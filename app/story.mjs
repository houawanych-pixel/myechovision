// Story mode: plays a drop-in campaign (app/campaigns/<id>/campaign.json) as a 16:9 movie-clip sequence.
// Neutral loop (look around) -> push forward plays the beat clip -> next zone's enter clip -> next neutral loop ...
// -> the final beat hands off to live chat. Forward only. Missing clips show a labelled slot with the Grok prompt.
// Characters are green-screen clips keyed by the same WebGL stage the chat uses (stage.mjs); tap one or call
// them by name to talk through the AI brain. Logic (format, state machine, quests) lives in story-core.mjs.
import { readIndex, validateCampaign, startRun, control, stickInput, nameCalled, clipSlots, mediaPath, grokPrompt, isVideoFile } from './story-core.mjs?v=1';
import { createStage } from './stage.mjs?v=15';
import { remoteReply } from './brain.mjs?v=21';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMPORTED = 'ev-campaigns-imported';
const DOCS = 'https://github.com/houawanych-pixel/myechovision/blob/main/docs/campaigns.md';
const loadImported = () => { try { return JSON.parse(localStorage.getItem(IMPORTED)) || [] } catch { return [] } };
const saveImported = list => { try { localStorage.setItem(IMPORTED, JSON.stringify(list)) } catch { throw Error('Storage is full; remove an imported campaign first.') } };

// opts: {brainCfg:()=>cfg|null, onLive:(campaign,urlOf)=>void, toast:(t)=>void, media:{put(id,file),url(key)}}
export function openStoryMode(host, opts = {}) {
  let dead = false, player = null;
  const toast = opts.toast || (() => { });
  const root = document.createElement('div'); root.className = 'storyMode'; host.replaceChildren(root);

  async function picker() {
    player?.destroy(); player = null;
    let list = [];
    try { list = readIndex(await (await fetch('campaigns/index.json', { cache: 'no-cache' })).json()) } catch { }
    const mine = loadImported();
    if (dead) return;
    root.innerHTML = `<div class="content"><div class="topline"><span class="mobileBrand">MY ECHOVISION</span><span class="tag">Story mode</span></div><h2>Story mode.</h2><p class="sub">Movie-clip campaigns. Push forward through each beat. There is no going back. At the end, the story goes live.</p>
      <div class="storyList">${list.map(c => `<button class="card storyCard" data-play="${esc(c.id)}"><div class="info"><span class="eyebrow">CAMPAIGN</span><strong>${esc(c.title)}</strong><small>${esc(c.blurb)}</small></div><span class="storyGo">▶ Play</span></button>`).join('')}
      ${mine.map(c => `<div class="card storyCard"><button class="linkish storyPlayMine" data-mine="${esc(c.id)}"><span class="eyebrow">IMPORTED</span><strong>${esc(c.title)}</strong></button><button class="mini secondary" data-drop="${esc(c.id)}" aria-label="Remove ${esc(c.title)}">×</button></div>`).join('')}
      ${list.length || mine.length ? '' : '<p class="footerNote">No campaigns found.</p>'}</div>
      <label class="secondary wide storyImport"><input type="file" id="storyFile" accept=".json,.zip,application/json,application/zip" hidden>＋ Import a campaign (.json or .zip)</label>
      <p class="footerNote">Make your own: a folder with a campaign.json and its clips. <a href="${DOCS}" target="_blank" rel="noopener">How campaigns work</a>.</p></div>`;
    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => play({ path: `campaigns/${b.dataset.play}/` }));
    root.querySelectorAll('[data-mine]').forEach(b => b.onclick = () => play({ imported: mine.find(x => x.id === b.dataset.mine) }));
    root.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { saveImported(loadImported().filter(x => x.id !== b.dataset.drop)); picker() });
    root.querySelector('#storyFile').onchange = e => importFile(e.target.files[0]).catch(err => toast(err.message));
  }

  // A .json is the manifest alone (clips show as slots unless they are web links). A .zip holds the folder:
  // campaign.json plus its media; the media is kept on this device.
  async function importFile(file) {
    if (!file) return;
    let json, files = {};
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      const entries = await unzip(file), man = Object.keys(entries).filter(n => /(^|\/)campaign\.json$/i.test(n)).sort((a, b) => a.length - b.length)[0];
      if (!man) throw Error('That zip has no campaign.json.');
      const dir = man.slice(0, man.length - 'campaign.json'.length);
      json = JSON.parse(await entries[man].text());
      for (const [n, blob] of Object.entries(entries)) if (n !== man && n.startsWith(dir) && !n.endsWith('/')) files[n.slice(dir.length)] = blob;
    } else json = JSON.parse(await file.text());
    const r = validateCampaign(json);
    if (!r.ok) throw Error('This campaign has problems: ' + r.errors.slice(0, 3).join(' '));
    const stored = {};
    for (const [key, clip] of Object.entries(r.campaign.clips)) {
      const blob = files[clip.file]; if (!blob) continue;
      if (!opts.media?.put) break;
      const type = /\.webm$/i.test(clip.file) ? 'video/webm' : /\.(mp4|mov)$/i.test(clip.file) ? 'video/mp4' : /\.png$/i.test(clip.file) ? 'image/png' : /\.jpe?g$/i.test(clip.file) ? 'image/jpeg' : 'image/webp';
      stored[key] = await opts.media.put(`media-camp-${r.campaign.id}-${clip.file.replace(/[^\w.-]+/g, '_')}`, new File([blob], clip.file.split('/').pop(), { type }));
    }
    const list = loadImported().filter(x => x.id !== r.campaign.id);
    list.push({ id: r.campaign.id, title: r.campaign.title, json, stored });
    saveImported(list);
    toast(`Imported “${r.campaign.title}”${Object.keys(stored).length ? ` with ${Object.keys(stored).length} clips` : ''}.`);
    picker();
  }

  async function play(src) {
    let raw, base = '';
    try {
      if (src.imported) raw = src.imported.json;
      else { base = src.path; const res = await fetch(base + 'campaign.json', { cache: 'no-cache' }); if (!res.ok) throw Error('campaign.json not found in ' + base); raw = await res.json() }
    } catch (e) { return toast(e.message) }
    const r = validateCampaign(raw);
    if (!r.ok) { root.innerHTML = `<div class="content"><h2>This campaign has problems.</h2><ul class="storyErrors">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><button class="secondary" id="storyBack">← Campaigns</button></div>`; root.querySelector('#storyBack').onclick = picker; return }
    const c = r.campaign;
    // where each clip lives, and whether it is really there
    const urls = {}, have = {};
    await Promise.all(Object.entries(c.clips).map(async ([key, clip]) => {
      const keep = src.imported?.stored?.[key];
      const url = keep ? opts.media?.url?.(keep) : /^(https?:|data:|blob:)/i.test(clip.file) || base ? mediaPath(base, clip.file) : '';
      urls[key] = keep || url; have[key] = false;
      if (!url) return;
      if (keep) { have[key] = true; urls[key] = keep; return }
      try { const h = await fetch(url, { method: 'HEAD', cache: 'no-cache' }); have[key] = h.ok && !/text\/html/.test(h.headers.get('content-type') || '') } catch { }
    }));
    if (dead) return;
    const urlOf = key => have[key] ? urls[key] : '';
    const shown = key => { const k = urlOf(key); return k && (opts.media?.url?.(k) || k) };
    player = createPlayer(root, c, { shown, have, base, opts, toast, back: picker, onLive: () => opts.onLive?.(c, urlOf) });
  }

  picker();
  return { destroy() { dead = true; player?.destroy(); root.remove() }, play, picker };
}

// ---------- the player ----------
function createPlayer(root, c, { shown, have, base, opts, toast, back, onLive }) {
  let dead = false, run = null, look = 0, lookVel = 0, keyLook = 0, stickX = 0, stickFwd = false, raf = 0, lineTimer = 0, clipTimer = 0, talkingTo = null, lastPhase = '';
  const stages = [], followers = new Set(), chats = {};
  const missing = Object.keys(c.clips).filter(k => !have[k]).length;
  root.innerHTML = `<div class="storyPlayer">
    <div class="storyBar"><button class="mini secondary" id="sBack" aria-label="Back to campaigns">←</button><div class="storyTitle"><strong>${esc(c.title)}</strong><small id="sWhere"></small></div><button class="mini secondary" id="sSlots">Clip slots${missing ? ` · ${missing} to make` : ''}</button></div>
    <div class="storyFrame" id="sFrame" tabindex="0" aria-label="Story view. Arrow keys or WASD: left and right look around, up goes forward.">
      <div class="storyWorld" id="sWorld"><div class="storyBg" id="sBg"></div><div class="storyCast" id="sCast"></div></div>
      <div class="storyFollow" id="sFollow"></div>
      <div class="storySlot" id="sSlot" hidden></div>
      <div class="storySub" id="sSub" aria-live="polite"></div>
      <div class="storyLive" id="sLive" hidden><span>LIVE</span></div>
    </div>
    <div class="storyControls">
      <div class="stick" id="sStick" aria-label="Analog stick: up is forward, left and right look around"><div class="stickRing"><span class="stickUp">▲</span></div><div class="stickKnob" id="sKnob"></div></div>
      <div class="storySide"><div class="storyBeat" id="sBeat"></div><div class="storyHint" id="sHint"></div>
        <form class="storyTalk" id="sTalk"><input id="sSay" maxlength="400" autocomplete="off" placeholder="Talk: “hey, Wren…”" aria-label="Talk to a character by name"><button class="primary mini" aria-label="Say it">↑</button></form>
        <div class="row" style="gap:6px"><button class="mini secondary" id="sSkip" hidden>Skip clip ▸</button><button class="mini secondary" id="sRestart">↺ Restart</button></div></div>
    </div></div>`;
  const $ = id => root.querySelector('#' + id);
  const zoneName = id => c.zones.find(z => z.id === id)?.name || id;
  const charOf = id => c.characters.find(x => x.id === id);

  // ----- media -----
  function setBackground(key, { once = false } = {}) {
    const bg = $('sBg'), slot = $('sSlot'), clip = c.clips[key];
    clearTimeout(clipTimer);
    for (const v of bg.querySelectorAll('video')) { v.onended = null; v.pause() }
    const url = shown(key), stand = !url && clip?.standIn;
    const src = url || stand || '';
    let el = null;
    if (src) {
      if (isVideoFile(url ? clip.file : stand)) { el = document.createElement('video'); el.muted = true; el.playsInline = true; el.autoplay = true; el.preload = 'auto'; el.loop = !once; el.src = src }
      else { el = new Image(); el.src = src; el.alt = '' }
      if (stand) el.className = 'standIn';
      bg.replaceChildren(el);
      if (el.tagName === 'VIDEO') el.play().catch(() => { });
    } else bg.replaceChildren();
    if (url) { slot.hidden = true; slot.innerHTML = '' }
    else {
      slot.hidden = false;
      slot.innerHTML = `<div><span class="eyebrow">CLIP SLOT${stand ? ' · stand-in shown' : ''}</span><strong>${esc(clip?.file.split('/').pop() || key)}</strong><small>${esc(clip?.kind || '')}${clip?.loop ? ' · loop' : ' · plays once'} · ${clip?.seconds || '?'}s</small><p>${esc((clip?.prompt || '').slice(0, 220))}${(clip?.prompt || '').length > 220 ? '…' : ''}</p><button class="mini secondary" data-copy="${esc(key)}">Copy Grok prompt</button></div>`;
      slot.querySelector('[data-copy]').onclick = e => { e.stopPropagation(); copy(grokPrompt(c, key)) };
    }
    return el;
  }
  // a clip that plays once; resolves when it ends (or after its length, for an empty slot)
  function playOnce(key) {
    return new Promise(res => {
      const el = setBackground(key, { once: true }), clip = c.clips[key];
      let done = false; const end = () => { if (done) return; done = true; clearTimeout(clipTimer); res() };
      $('sSkip').hidden = false; $('sSkip').onclick = end;
      if (el?.tagName === 'VIDEO' && (shown(key) || isVideoFile(clip?.standIn))) { el.onended = end; el.onerror = () => { clipTimer = setTimeout(end, 2000) }; clipTimer = setTimeout(end, ((clip?.seconds || 5) + 4) * 1000) }
      else clipTimer = setTimeout(end, Math.min(clip?.seconds || 3, 3) * 1000);
    });
  }
  // a character: keyed green-screen loop, or a labelled slot
  function person(ch, cls) {
    const box = document.createElement('button'); box.className = 'storyChar ' + cls; box.type = 'button'; box.dataset.char = ch.id; box.setAttribute('aria-label', `Talk to ${ch.name}`);
    const url = ch.idle && shown(ch.idle);
    if (url) { const st = createStage(box); stages.push(st); st.setCharacter({ normal: { src: url, type: isVideoFile(c.clips[ch.idle].file) ? 'video/mp4' : 'image/png' } }, ch.chroma, 0.8); box.classList.add('keyedChar') }
    else box.innerHTML = `<span class="charSlot"><b>${esc(ch.name)}</b><small>CHARACTER SLOT</small><small>${esc(ch.idle ? c.clips[ch.idle].file.split('/').pop() : 'no idle clip set')}</small></span>`;
    const tag = document.createElement('span'); tag.className = 'charName'; tag.textContent = ch.name; box.append(tag);
    box.onclick = e => { e.stopPropagation(); talkingTo = ch.id; $('sSay').placeholder = `Talk to ${ch.name}…`; $('sSay').focus(); if (!chats[ch.id]?.length) say(ch, null) };
    return box;
  }
  function placeCast(beat) {
    for (const s of stages.splice(0)) s.destroy();
    const cast = $('sCast'), fol = $('sFollow'); cast.replaceChildren(); fol.replaceChildren();
    for (const x of beat.cast) { const ch = charOf(x.id); if (ch?.kind === 'follower') followers.add(ch.id) }
    for (const x of beat.cast) {
      const ch = charOf(x.id); if (!ch || ch.kind === 'follower') continue;
      const el = person(ch, 'bgChar'); el.style.left = (x.x * 100) + '%'; el.style.setProperty('--s', x.scale); cast.append(el);
    }
    for (const id of followers) fol.append(person(charOf(id), 'follower'));
  }

  // ----- lines: subtitles, spoken with the phone's voice -----
  function speakLine(l) {
    try {
      if (!window.speechSynthesis || !l.text) return;
      const u = new SpeechSynthesisUtterance(l.text), v = charOf(l.who)?.voice || {};
      u.rate = v.rate || (l.who === 'narrator' ? 0.95 : 1); u.pitch = v.pitch || 1; u.volume = l.shout ? 1 : 0.9;
      speechSynthesis.speak(u);
    } catch { }
  }
  function lines(list) {
    clearTimeout(lineTimer); try { speechSynthesis.cancel() } catch { }
    const sub = $('sSub'); let i = 0;
    const next = () => {
      if (dead) return;
      const l = list[i++]; if (!l) { sub.classList.remove('on'); return }
      const who = l.who === 'narrator' ? '' : l.who === 'you' ? (c.player?.name || 'You') : charOf(l.who)?.name || '';
      sub.innerHTML = `${who ? `<b>${esc(who)}:</b> ` : ''}<span class="${l.who === 'narrator' ? 'narr' : ''}${l.shout ? ' shout' : ''}">${esc(l.text)}</span>`; sub.classList.add('on');
      speakLine(l);
      lineTimer = setTimeout(next, Math.max(2200, l.text.length * 62));
    };
    next();
  }

  // ----- the state machine -----
  async function apply(effects) {
    for (const e of effects) {
      if (dead) return;
      const b = c.beats[run.beat];
      $('sWhere').textContent = `${zoneName(run.zone)} · beat ${run.beat + 1} of ${c.beats.length}`;
      $('sBeat').innerHTML = `<span class="eyebrow">${esc(zoneName(b.zone))}</span><strong>${esc(b.title || b.id)}</strong>`;
      root.dataset.phase = run.phase;
      if (e.type === 'zone') {
        $('sHint').textContent = `Entering ${zoneName(e.zone)}…`;
        if (e.lines?.length) lines(e.lines);
        if (e.clip) { await playOnce(e.clip); if (!dead) step('clipEnded') }
      } else if (e.type === 'forward') {
        $('sHint').textContent = '';
        lines(e.lines || []);
        await playOnce(e.clip); if (!dead) step('clipEnded');
      } else if (e.type === 'neutral') {
        $('sSkip').hidden = true;
        setBackground(e.clip); placeCast(b); lines(e.lines);
        $('sHint').textContent = b.hint;
      } else if (e.type === 'live') {
        $('sSkip').hidden = true; $('sHint').textContent = ''; $('sLive').hidden = false;
        lines([{ who: 'narrator', text: 'Going live.' }]);
        setTimeout(() => { if (!dead) onLive() }, 1400);
      }
    }
  }
  function step(input) { if (!run) return; const o = control(c, run, input); run = o.run; if (o.effects.length) apply(o.effects.filter(e => e.type !== 'look')) }
  function start() { followers.clear(); for (const k in chats) delete chats[k]; $('sLive').hidden = true; look = 0; const o = startRun(c); run = o.run; apply(o.effects) }

  // ----- looking around and the stick -----
  const frame = $('sFrame'), world = $('sWorld');
  const tick = () => {
    if (dead) return; raf = requestAnimationFrame(tick);
    const want = keyLook || (Math.abs(stickX) > 0.25 ? stickX : 0);
    lookVel += (want * 1.1 - lookVel) * 0.15; look = Math.max(-1, Math.min(1, look + lookVel * 0.016));
    world.style.setProperty('--look', look.toFixed(4));
  };
  raf = requestAnimationFrame(tick);
  const stick = $('sStick'), knob = $('sKnob'); let drag = null;
  const stickMove = (x, y) => {
    const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d }
    const vy = Math.min(y, 0.12);                                            // the knob barely goes down: there is no back
    knob.style.transform = `translate(${x * 34}px,${vy * 34}px)`;
    stickX = x;
    const inp = stickInput(x, y);
    if (inp === 'forward' && !stickFwd) { stickFwd = true; step('forward') } else if (inp !== 'forward') stickFwd = false;
    if (inp === 'left' || inp === 'right') step(inp);
  };
  stick.onpointerdown = e => { e.preventDefault(); drag = stick.getBoundingClientRect(); stick.setPointerCapture?.(e.pointerId); stick.onpointermove(e) };
  stick.onpointermove = e => { if (!drag) return; const r = drag, R = r.width / 2; stickMove((e.clientX - r.left - R) / (R * 0.7), (e.clientY - r.top - R) / (R * 0.7)) };
  stick.ondragstart = e => e.preventDefault();
  stick.onpointerup = stick.onpointercancel = stick.onlostpointercapture = () => { drag = null; stickX = 0; stickFwd = false; knob.style.transform = '' };
  const keys = new Set();
  const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '');
  const kd = e => {
    if (typing(e) || !root.isConnected) return; const k = e.key.toLowerCase();
    if (['arrowleft', 'a', 'arrowright', 'd'].includes(k)) { keys.add(k); keyLook = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0); step(keyLook < 0 ? 'left' : 'right'); e.preventDefault() }
    else if (['arrowup', 'w'].includes(k)) { if (!e.repeat) step('forward'); e.preventDefault() }
    else if (['arrowdown', 's'].includes(k)) { step('down'); e.preventDefault() }          // ignored by the state machine
  };
  const ku = e => { const k = e.key.toLowerCase(); keys.delete(k); keyLook = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0) };
  addEventListener('keydown', kd); addEventListener('keyup', ku);

  // ----- talking: tap someone, or call them by name -----
  async function say(ch, text) {
    const sub = $('sSub'), hist = chats[ch.id] ||= [];
    if (text) hist.push({ role: 'user', text });
    const cfg = opts.brainCfg?.();
    let reply = '';
    sub.innerHTML = `<b>${esc(ch.name)}:</b> <span>…</span>`; sub.classList.add('on'); clearTimeout(lineTimer);
    if (cfg && text) {
      const b = c.beats[run?.beat || 0];
      try { reply = (await remoteReply({ name: ch.name, role: ch.role, persona: ch.persona, look: ch.look, scene: `${zoneName(b.zone)} (${c.title})`, sceneDetails: `${b.title}. Everything is falling apart; answer fast and short, you are on the move.`, player: c.player?.name || 'the survivor', playerPersona: c.player?.persona || '', messages: hist.slice(-10) }, cfg, t => { if (!dead) sub.innerHTML = `<b>${esc(ch.name)}:</b> <span>${esc(t)}</span>` })).text } catch (e) { reply = '' }
    }
    reply ||= text ? ch.fallback || '…' : (ch.greeting || ch.fallback || `I'm ${ch.name}.`);
    if (dead) return;
    hist.push({ role: 'assistant', text: reply });
    lines([{ who: ch.id, text: reply }]);
  }
  $('sTalk').onsubmit = e => {
    e.preventDefault(); const box = $('sSay'), text = box.value.trim(); if (!text) return; box.value = '';
    const b = c.beats[run?.beat || 0], here = [...b.cast.map(x => charOf(x.id)), ...[...followers].map(charOf)].filter(Boolean);
    const ch = nameCalled(text, here) || nameCalled(text, c.characters) || charOf(talkingTo) || here[0];
    if (!ch) return toast('Nobody is close enough to hear you.');
    talkingTo = ch.id; say(ch, text);
  };

  $('sBack').onclick = back;
  $('sRestart').onclick = start;
  $('sSlots').onclick = () => slotsPanel(root, c, have, copy);
  frame.onclick = () => frame.focus({ preventScroll: true });
  function copy(t) { (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Prompt copied. Paste it into Grok, then save the clip with the file name shown.')).catch(() => { prompt('Copy this prompt:', t) }) }
  start();
  return {
    get run() { return run }, step,
    destroy() { dead = true; cancelAnimationFrame(raf); clearTimeout(lineTimer); clearTimeout(clipTimer); try { speechSynthesis.cancel() } catch { } removeEventListener('keydown', kd); removeEventListener('keyup', ku); for (const s of stages) s.destroy(); root.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src') }) }
  };
}

function slotsPanel(root, c, have, copy) {
  const old = root.querySelector('.storySlots'); if (old) return old.remove();
  const p = document.createElement('div'); p.className = 'storySlots';
  const slots = clipSlots(c);
  p.innerHTML = `<div class="row between"><strong>Clip slots</strong><button class="mini secondary" data-x aria-label="Close">×</button></div><p class="footerNote">Make each clip with its prompt, save it with exactly this name, and put it in <code>app/campaigns/${esc(c.id)}/media/</code>. It shows up on the next visit.</p>
    ${slots.map(s => `<div class="slotRow ${have[s.key] ? 'ok' : ''}"><span>${have[s.key] ? '✓' : '○'}</span><div><strong>${esc(s.file.split('/').pop())}</strong><small>${esc(s.kind)}${s.loop ? ' · loop' : ''} · ${s.seconds}s${s.standIn ? ' · stand-in: ' + esc(s.standIn) : ''}</small></div><button class="mini secondary" data-copy="${esc(s.key)}">Prompt</button></div>`).join('')}`;
  p.querySelector('[data-x]').onclick = () => p.remove();
  p.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(grokPrompt(c, b.dataset.copy)));
  root.querySelector('.storyPlayer').append(p);
}

// ---------- a small zip reader (stored and deflated entries), enough for a campaign folder ----------
export async function unzip(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw Error('That file is not a zip.');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const out = {}, dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/') || name.startsWith('__MACOSX')) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = buf.subarray(start, start + size);
    if (method === 0) out[name] = new Blob([data]);
    else if (method === 8) out[name] = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  }
  return out;
}
