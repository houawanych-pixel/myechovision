// Story mode logic: the drop-in campaign format (load + validate) and the forward-only beat state machine.
// No DOM here, so it is tested in Node (tests/story.test.mjs). The player that draws it is app/story.mjs.
// Format reference: docs/campaigns.md.

export const FORMAT = 'echovision-campaign/1';
export const CHARACTER_KINDS = ['follower', 'background'];
export const CLIP_KINDS = ['neutral', 'forward', 'zone', 'character'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MEDIA_EXT = /\.(mp4|webm|mov|png|jpe?g|webp|gif)$/i;
export const isVideoFile = f => /\.(mp4|webm|mov)$/i.test(String(f || ''));

// ---------- campaign list ----------
// app/campaigns/index.json: {"campaigns":[{"id":"cryo-escape","title":"Cold Wake"}, ...]} (a plain list of ids works too).
export function readIndex(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.campaigns) ? json.campaigns : [];
  const out = [], seen = new Set();
  for (const e of list) {
    const x = typeof e === 'string' ? { id: e } : e && typeof e === 'object' ? e : null;
    if (!x || !SLUG.test(String(x.id || '')) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, title: String(x.title || x.id), blurb: String(x.blurb || ''), path: `campaigns/${x.id}/` });
  }
  return out;
}

// ---------- validator ----------
// Returns {ok, errors, warnings, campaign}. `campaign` is a normalized copy (defaults filled in) only when ok.
export function validateCampaign(raw) {
  const errors = [], warnings = [], err = m => errors.push(m), warn = m => warnings.push(m);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['The campaign is not a JSON object.'], warnings, campaign: null };
  const c = structuredClone(raw);
  if (c.format && c.format !== FORMAT) warn(`format is "${c.format}"; this player reads "${FORMAT}".`);
  if (!SLUG.test(String(c.id || ''))) err('id must be lowercase letters, digits and dashes (it is also the folder name).');
  if (!String(c.title || '').trim()) err('title is missing.');
  // clips
  c.clips = c.clips && typeof c.clips === 'object' && !Array.isArray(c.clips) ? c.clips : {};
  for (const [key, clip] of Object.entries(c.clips)) {
    if (!clip || typeof clip !== 'object') { err(`clips.${key} must be an object.`); continue }
    if (!String(clip.file || '').trim()) err(`clips.${key}.file is missing.`);
    else if (!MEDIA_EXT.test(clip.file)) err(`clips.${key}.file "${clip.file}" must be .mp4, .webm, .mov, .png, .jpg, .webp or .gif.`);
    else if (/^\/|\.\.|^[a-z]+:/i.test(clip.file) && !/^(https?:|data:|blob:)/i.test(clip.file)) err(`clips.${key}.file must be a path inside the campaign folder.`);
    if (clip.kind && !CLIP_KINDS.includes(clip.kind)) err(`clips.${key}.kind must be one of ${CLIP_KINDS.join(', ')}.`);
    clip.loop = clip.loop ?? (clip.kind === 'neutral' || clip.kind === 'character');
    clip.seconds = Number(clip.seconds) > 0 ? Number(clip.seconds) : (clip.loop ? 8 : 4);
    if (!clip.prompt) warn(`clips.${key} has no Grok prompt.`);
  }
  const clipRef = (where, key, kinds) => {
    if (key == null || key === '') return;
    if (!c.clips[key]) return err(`${where} points at clip "${key}", which is not in clips.`);
    if (kinds && c.clips[key].kind && !kinds.includes(c.clips[key].kind)) warn(`${where} uses clip "${key}" of kind ${c.clips[key].kind}.`);
  };
  // characters
  c.characters = Array.isArray(c.characters) ? c.characters : [];
  const chars = new Map();
  for (const [i, ch] of c.characters.entries()) {
    const at = `characters[${i}]`;
    if (!ch || !SLUG.test(String(ch.id || ''))) { err(`${at}.id must be a lowercase slug.`); continue }
    if (chars.has(ch.id)) err(`${at}.id "${ch.id}" is used twice.`);
    chars.set(ch.id, ch);
    if (!String(ch.name || '').trim()) err(`${at}.name is missing.`);
    ch.kind = ch.kind || 'background';
    if (!CHARACTER_KINDS.includes(ch.kind)) err(`${at}.kind must be follower or background.`);
    ch.chroma = ch.chroma || 'green';
    if (!['green', 'blue', 'none'].includes(ch.chroma)) err(`${at}.chroma must be green, blue or none.`);
    ch.calls = [...new Set([ch.name, ...(Array.isArray(ch.calls) ? ch.calls : [])].map(x => String(x || '').trim()).filter(Boolean))];
    clipRef(`${at}.idle`, ch.idle, ['character']);
    clipRef(`${at}.talk`, ch.talk, ['character']);
    if (!ch.persona) warn(`${at} (${ch.name}) has no persona; the AI brain will improvise.`);
  }
  const who = (where, id) => { if (id && id !== 'narrator' && id !== 'you' && !chars.has(id)) err(`${where} names "${id}", who is not in characters.`) };
  const lines = (where, list) => {
    if (list == null) return [];
    if (!Array.isArray(list)) { err(`${where} must be a list.`); return [] }
    return list.map((l, i) => {
      const x = typeof l === 'string' ? { text: l } : l || {};
      if (!String(x.text || '').trim()) err(`${where}[${i}].text is missing.`);
      who(`${where}[${i}].who`, x.who);
      return { who: x.who || 'narrator', text: String(x.text || ''), at: Number(x.at) >= 0 ? Number(x.at) : null, shout: !!x.shout };
    });
  };
  // zones
  c.zones = Array.isArray(c.zones) ? c.zones : [];
  const zones = new Map();
  for (const [i, z] of c.zones.entries()) {
    if (!z || !SLUG.test(String(z.id || ''))) { err(`zones[${i}].id must be a lowercase slug.`); continue }
    if (zones.has(z.id)) err(`zones[${i}].id "${z.id}" is used twice.`);
    zones.set(z.id, z);
    z.name = String(z.name || z.id);
    clipRef(`zones[${i}].enter`, z.enter, ['zone', 'forward']);
    z.enterLines = lines(`zones[${i}].enterLines`, z.enterLines);
  }
  if (!zones.size) err('zones is empty; add at least one zone.');
  // beats
  c.beats = Array.isArray(c.beats) ? c.beats : [];
  if (!c.beats.length) err('beats is empty; add at least one beat.');
  const beatIds = new Set();
  for (const [i, b] of c.beats.entries()) {
    const at = `beats[${i}]`, last = i === c.beats.length - 1;
    if (!b || typeof b !== 'object') { err(`${at} must be an object.`); continue }
    if (!SLUG.test(String(b.id || ''))) err(`${at}.id must be a lowercase slug.`);
    else if (beatIds.has(b.id)) err(`${at}.id "${b.id}" is used twice.`);
    beatIds.add(b.id);
    if (!zones.has(b.zone)) err(`${at}.zone "${b.zone}" is not in zones.`);
    if (!b.neutral) err(`${at}.neutral (the looping idle clip) is missing.`);
    clipRef(`${at}.neutral`, b.neutral, ['neutral']);
    b.live = !!b.live;
    if (b.live && !last) err(`${at} goes live but is not the last beat; only the final beat may go live.`);
    if (last && !b.live) err(`the last beat (${b.id}) must have "live": true; it is the handoff to live play.`);
    if (!b.live && !b.forward) err(`${at}.forward (the clip that plays when you push forward) is missing.`);
    clipRef(`${at}.forward`, b.forward, ['forward', 'zone']);
    b.lines = lines(`${at}.lines`, b.lines);
    b.forwardLines = lines(`${at}.forwardLines`, b.forwardLines);
    b.cast = Array.isArray(b.cast) ? b.cast.map(x => typeof x === 'string' ? { id: x } : x) : [];
    for (const [k, x] of b.cast.entries()) { who(`${at}.cast[${k}]`, x?.id); x.x = Number.isFinite(+x.x) ? Math.max(0, Math.min(1, +x.x)) : 0.5; x.scale = Number(x.scale) > 0 ? +x.scale : 1 }
    b.hint = String(b.hint || (b.live ? 'Push forward to go live.' : 'Push forward.'));
  }
  // quests
  c.quests = Array.isArray(c.quests) ? c.quests : [];
  for (const [i, q] of c.quests.entries()) {
    const at = `quests[${i}]`;
    if (!q || !SLUG.test(String(q.id || ''))) { err(`${at}.id must be a lowercase slug.`); continue }
    if (!q.title) err(`${at}.title is missing.`);
    if (!q.trigger || !['live', 'text', 'zone'].includes(q.trigger.on)) err(`${at}.trigger.on must be live, text or zone.`);
    if (!q.goal?.find) err(`${at}.goal.find (the character to fetch) is missing.`); else who(`${at}.goal.find`, q.goal.find);
    if (!q.return?.to) err(`${at}.return.to (who to bring them back to) is missing.`); else who(`${at}.return.to`, q.return.to);
    if (!q.outcome?.text) err(`${at}.outcome.text is missing.`);
    if (q.giver) who(`${at}.giver`, q.giver);
    if (q.outcome?.stays) who(`${at}.outcome.stays`, q.outcome.stays);
  }
  // live handoff
  const live = c.live || {};
  if (!c.live) err('live (the handoff to live play) is missing.');
  else {
    live.mode = live.mode || 'chat';
    if (live.mode !== 'chat') err('live.mode must be "chat" (the only handoff this build supports).');
    if (!live.partner) err('live.partner (who you talk to first) is missing.'); else who('live.partner', live.partner);
    live.crew = Array.isArray(live.crew) && live.crew.length ? live.crew : [live.partner].filter(Boolean);
    for (const id of live.crew) who('live.crew', id);
    if (!live.scene?.name) err('live.scene.name is missing.');
  }
  // the media the campaign shows must all have a slot
  for (const ref of Object.keys(c.clips)) if (!usedClips(c).has(ref)) warn(`clip "${ref}" is not used by any beat, zone or character.`);
  return errors.length ? { ok: false, errors, warnings, campaign: null } : { ok: true, errors, warnings, campaign: c };
}
function usedClips(c) {
  const s = new Set();
  for (const b of c.beats || []) { s.add(b?.neutral); s.add(b?.forward) }
  for (const z of c.zones || []) s.add(z?.enter);
  for (const ch of c.characters || []) { s.add(ch?.idle); s.add(ch?.talk); for (const k of Object.values(ch?.clips || {})) s.add(k) }
  return s;
}

// Every media slot of a campaign with where its file is expected, so missing files can be shown and listed.
export function clipSlots(c, base = '') {
  return Object.entries(c.clips || {}).map(([key, clip]) => ({ key, ...clip, url: mediaPath(base, clip.file) }));
}
export const mediaPath = (base, file) => !file ? '' : /^(https?:|data:|blob:)/i.test(file) ? file : base + file;

// ---------- the forward-only state machine ----------
// Phases: 'zone' (zone-enter clip playing) -> 'neutral' (idle loop, look around) -> 'forward' (beat clip playing)
// -> 'zone' or 'neutral' of the next beat ... -> 'live' (handed off). There is no way back.
// Inputs: 'forward', 'back', 'down', 'left', 'right', 'clipEnded'. Returns {run, effects}; the run is never mutated.
export function startRun(c) {
  const b = c.beats[0], z = zoneOf(c, b);
  const run = { beat: 0, phase: 'neutral', zone: b.zone, seen: [b.zone], history: [] };
  if (z?.enter) return { run: { ...run, phase: 'zone' }, effects: [{ type: 'zone', zone: z.id, clip: z.enter, lines: z.enterLines || [] }] };
  return { run, effects: [{ type: 'neutral', beat: b.id, clip: b.neutral, lines: b.lines || [], live: !!b.live }] };
}
const zoneOf = (c, b) => c.zones.find(z => z.id === b?.zone);
export function control(c, run, input) {
  if (!run || run.phase === 'live') return { run, effects: [] };
  const b = c.beats[run.beat];
  if (input === 'forward') {
    if (run.phase !== 'neutral') return { run, effects: [] };          // a clip is playing: wait for it
    if (b.live) return { run: { ...run, phase: 'live', history: [...run.history, b.id] }, effects: [{ type: 'live', beat: b.id, live: c.live }] };
    return { run: { ...run, phase: 'forward' }, effects: [{ type: 'forward', beat: b.id, clip: b.forward, lines: b.forwardLines || [] }] };
  }
  if (input === 'clipEnded') {
    if (run.phase === 'forward') {
      const i = run.beat + 1, nb = c.beats[i], next = { ...run, beat: i, history: [...run.history, b.id] };
      if (nb.zone !== run.zone) {
        const z = zoneOf(c, nb), entered = { ...next, zone: nb.zone, seen: [...run.seen, nb.zone] };
        if (z?.enter) return { run: { ...entered, phase: 'zone' }, effects: [{ type: 'zone', zone: z.id, clip: z.enter, lines: z.enterLines || [] }] };
        return { run: { ...entered, phase: 'neutral' }, effects: [{ type: 'zone', zone: z.id, clip: null, lines: z.enterLines || [] }, neutral(nb)] };
      }
      return { run: { ...next, phase: 'neutral' }, effects: [neutral(nb)] };
    }
    if (run.phase === 'zone') return { run: { ...run, phase: 'neutral' }, effects: [neutral(b)] };
    return { run, effects: [] };
  }
  if (input === 'left' || input === 'right') return { run, effects: run.phase === 'neutral' || run.phase === 'forward' || run.phase === 'zone' ? [{ type: 'look', dir: input === 'left' ? -1 : 1 }] : [] };
  return { run, effects: [] };                                         // 'back', 'down' and anything else: ignored
}
const neutral = b => ({ type: 'neutral', beat: b.id, clip: b.neutral, lines: b.lines || [], live: !!b.live });

// Analog stick to input: x,y in -1..1 (y negative is up). Up past the threshold is forward; down never moves you.
export function stickInput(x, y, dead = 0.6) {
  if (y < -dead && Math.abs(x) < Math.abs(y)) return 'forward';
  if (Math.abs(x) > 0.25) return x < 0 ? 'left' : 'right';
  return null;
}

// ---------- calling characters by name ----------
// "hey, Judy", "Teo, come here", "Wren?" -> that character. Only characters in `list` can answer.
export function nameCalled(text, list) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
  let best = null, at = Infinity;
  for (const ch of list || []) for (const n of ch.calls || [ch.name]) {
    const k = String(n || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!k) continue;
    const i = t.indexOf(' ' + k + ' ');
    if (i >= 0 && i < at) { best = ch; at = i }
  }
  return best;
}

// ---------- quests ----------
// A quest: trigger (when it starts) -> goal (find a character) -> return (bring them back) -> outcome (they stay and work).
// progress: {state:'idle'|'active'|'found'|'done'}. Events: {type:'live'} | {type:'text',text,partner} | {type:'zone',zone}
// | {type:'talk',who,text}. Returns {progress, effects:[{type:'start'|'found'|'done', quest, say?, text?}]}.
const wordsMatch = (words, text) => !!words && new RegExp(`\\b(${words})\\b`, 'i').test(String(text || ''));
export function questStep(q, progress, ev) {
  const p = progress || { state: 'idle' };
  if (p.state === 'idle') {
    const t = q.trigger || {};
    const fire = (t.on === 'live' && ev.type === 'live') || (t.on === 'zone' && ev.type === 'zone' && ev.zone === t.zone) || (t.on === 'text' && (ev.type === 'text' || ev.type === 'talk') && wordsMatch(t.words, ev.text));
    return fire ? { progress: { state: 'active' }, effects: [{ type: 'start', quest: q.id, who: q.giver || null, say: q.trigger.say || '', text: q.goal.text || '' }] } : { progress: p, effects: [] };
  }
  if (p.state === 'active' && ev.type === 'talk' && ev.who === q.goal.find)
    return { progress: { state: 'found' }, effects: [{ type: 'found', quest: q.id, who: q.goal.find, say: q.goal.say || '', text: q.return.text || '' }] };
  if (p.state === 'found' && (ev.type === 'talk' || ev.type === 'text')) {
    const back = (ev.type === 'talk' && ev.who === q.return.to) || wordsMatch(q.return.words, ev.text);
    if (back) return { progress: { state: 'done' }, effects: [{ type: 'done', quest: q.id, who: q.outcome.stays || q.goal.find, say: q.outcome.say || '', text: q.outcome.text, flag: q.outcome.flag || null }] };
  }
  return { progress: p, effects: [] };
}
export function questStatus(q, progress) {
  const s = progress?.state || 'idle';
  return s === 'active' ? q.goal.text || `Find ${q.goal.find}.` : s === 'found' ? q.return.text || 'Bring them back.' : s === 'done' ? q.outcome.text : '';
}

// ---------- prompts ----------
// The full Grok video prompt for a clip slot, with the file name it must be saved as.
export function grokPrompt(c, key) {
  const clip = c.clips[key]; if (!clip) return '';
  const name = clip.file.split('/').pop();
  const head = clip.kind === 'character'
    ? `Full-body shot of one character on a plain solid ${clip.screen === 'blue' ? 'blue' : 'green'} screen, evenly lit, no shadows, no floor line, nothing else in frame. 16:9 landscape, fixed camera, no cuts, no text. Feet to head in frame with space around.`
    : `Cinematic 16:9 first-person view at eye height, fixed lens, no text, no on-screen UI.`;
  const loop = clip.loop ? ` Seamless loop: the last frame matches the first frame exactly, ${clip.seconds} seconds.` : ` Plays once, about ${clip.seconds} seconds; the last frame matches the start of the next scene.`;
  return `${head}${loop}\n${clip.prompt || clip.describe || ''}\nOriginal design only; no existing film, game or brand characters, logos or ships.\nSave as: ${name}`;
}

// The character records the live chat needs (same shape as the app's cast list).
// urlOf(clipKey) returns where that clip's file is ('' when it has not been dropped in yet).
export function liveCast(c, urlOf = () => '') {
  return c.live.crew.map(id => c.characters.find(ch => ch.id === id)).filter(Boolean).map(ch => {
    const normal = ch.idle ? urlOf(ch.idle) : '', talking = ch.talk ? urlOf(ch.talk) : '', image = ch.portrait ? urlOf(ch.portrait) : '';
    return { id: castId(c, ch.id), name: ch.name, role: ch.role || '', persona: ch.persona || '', look: ch.look || '', image, ...(normal ? { chroma: ch.chroma, spill: 0.8, clips: { normal, ...(talking ? { talking } : {}) } } : { clips: {} }), voice: '', campaign: c.id, calls: ch.calls };
  });
}
export const castId = (c, id) => `cmp-${c.id}-${id}`;
