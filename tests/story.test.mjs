import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readIndex, validateCampaign, startRun, control, stickInput, nameCalled, questStep, questStatus, grokPrompt, liveCast, clipSlots } from '../app/story-core.mjs';

const read = p => JSON.parse(readFileSync(new URL('../app/' + p, import.meta.url)));
const cold = () => read('campaigns/cryo-escape/campaign.json');
// a tiny campaign: two zones, three beats, the last one live
const mini = () => ({
  format: 'echovision-campaign/1', id: 'mini', title: 'Mini',
  zones: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', enter: 'b_enter' }],
  clips: { a1: { file: 'media/a1.mp4', kind: 'neutral', prompt: 'x' }, a1f: { file: 'media/a1f.mp4', kind: 'forward', prompt: 'x' }, a2: { file: 'media/a2.mp4', kind: 'neutral', prompt: 'x' }, a2f: { file: 'media/a2f.mp4', kind: 'forward', prompt: 'x' }, b_enter: { file: 'media/b_enter.mp4', kind: 'zone', prompt: 'x' }, b1: { file: 'media/b1.mp4', kind: 'neutral', prompt: 'x' } },
  characters: [{ id: 'ana', name: 'Ana Reyes', kind: 'background', persona: 'p', calls: ['Ana'] }],
  beats: [{ id: 'one', zone: 'a', neutral: 'a1', forward: 'a1f', lines: [{ who: 'ana', text: 'Go!' }] }, { id: 'two', zone: 'a', neutral: 'a2', forward: 'a2f' }, { id: 'end', zone: 'b', neutral: 'b1', live: true }],
  live: { mode: 'chat', partner: 'ana', scene: { name: 'Dock' } }
});

test('campaign index lists the drop-in folders and skips bad entries', () => {
  const list = readIndex(read('campaigns/index.json'));
  assert.ok(list.some(c => c.id === 'cryo-escape' && c.path === 'campaigns/cryo-escape/'));
  for (const c of list) assert.ok(existsSync(new URL(`../app/campaigns/${c.id}/campaign.json`, import.meta.url)), c.id);
  assert.deepEqual(readIndex({ campaigns: ['ok-one', { id: 'Bad Id' }, { id: 'ok-one' }, null, { id: 'two', title: 'Two' }] }).map(c => c.id), ['ok-one', 'two']);
  assert.deepEqual(readIndex(null), []);
});

test('Cold Wake validates and has the shape the brief asks for', () => {
  const r = validateCampaign(cold());
  assert.equal(r.ok, true, r.errors.join('\n'));
  const c = r.campaign;
  assert.ok(c.zones.length >= 4);
  assert.ok(c.beats.at(-1).live);
  assert.ok(c.beats[0].lines.some(l => /get up, let's go.*gonna blow/i.test(l.text)));
  assert.ok(c.beats.at(-1).lines.some(l => /let's get on the ship now/i.test(l.text)));
  assert.ok(c.characters.some(ch => ch.kind === 'follower') && c.characters.some(ch => ch.kind === 'background'));
  assert.ok(c.quests.some(q => q.id === 'dead-panel'));
  assert.equal(c.outline.acts.filter(a => a.playable).length, 1);
  for (const s of clipSlots(c, 'campaigns/cryo-escape/')) { assert.match(s.file, /^media\/[a-z0-9_]+\.mp4$/); assert.ok(grokPrompt(c, s.key).includes('Save as: ' + s.file.slice(6))) }
  for (const ch of c.characters.filter(x => x.idle)) assert.match(grokPrompt(c, ch.idle), /green screen.*16:9/s);
});

test('validator catches broken manifests with clear messages', () => {
  assert.equal(validateCampaign(null).ok, false);
  assert.equal(validateCampaign(mini()).ok, true);
  const cases = [
    [c => { c.id = 'Has Spaces' }, /id must be/],
    [c => { c.beats[0].zone = 'nowhere' }, /zone "nowhere"/],
    [c => { c.beats[1].neutral = 'missing_clip' }, /not in clips/],
    [c => { delete c.beats[0].forward }, /forward/],
    [c => { c.beats[2].live = false }, /must have "live": true/],
    [c => { c.beats[0].live = true }, /only the final beat/],
    [c => { c.beats[0].lines.push({ who: 'ghost', text: 'boo' }) }, /"ghost"/],
    [c => { c.clips.a1.file = '../../secret.mp4' }, /inside the campaign folder/],
    [c => { c.clips.a1.file = 'media/a1.exe' }, /must be \.mp4/],
    [c => { delete c.live }, /live/],
    [c => { c.beats[1].id = 'one' }, /used twice/],
  ];
  for (const [mess, msg] of cases) { const c = mini(); mess(c); const r = validateCampaign(c); assert.equal(r.ok, false, String(msg)); assert.ok(r.errors.some(e => msg.test(e)), `${msg} in ${r.errors}`) }
});

test('forward advances, back and down are ignored, neutral loops between beats, zone enter fires, final beat goes live', () => {
  const c = validateCampaign(mini()).campaign;
  let { run, effects } = startRun(c);
  assert.equal(run.phase, 'neutral'); assert.deepEqual(effects.map(e => e.type), ['neutral']); assert.equal(effects[0].clip, 'a1');
  for (const inp of ['back', 'down', 'left', 'right', 'clipEnded', 'nonsense']) { const o = control(c, run, inp); assert.deepEqual(o.run, run, inp); assert.ok(o.effects.every(e => e.type === 'look'), inp) }
  let o = control(c, run, 'forward'); assert.equal(o.run.phase, 'forward'); assert.equal(o.effects[0].clip, 'a1f'); run = o.run;
  assert.deepEqual(control(c, run, 'forward').effects, [], 'pushing again while the clip plays does nothing');
  assert.equal(control(c, run, 'down').run, run);
  o = control(c, run, 'clipEnded'); run = o.run;
  assert.equal(run.phase, 'neutral'); assert.equal(run.beat, 1); assert.equal(o.effects[0].clip, 'a2', 'settles into the next beat neutral loop');
  o = control(c, control(c, run, 'forward').run, 'clipEnded'); run = o.run;
  assert.equal(run.phase, 'zone'); assert.equal(run.zone, 'b'); assert.deepEqual(o.effects.map(e => [e.type, e.clip]), [['zone', 'b_enter']]);
  o = control(c, run, 'clipEnded'); run = o.run; assert.equal(run.phase, 'neutral'); assert.equal(o.effects[0].live, true);
  o = control(c, run, 'forward'); assert.equal(o.run.phase, 'live'); assert.equal(o.effects[0].type, 'live'); assert.equal(o.effects[0].live.partner, 'ana');
  assert.deepEqual(control(c, o.run, 'forward').effects, [], 'nothing after live');
  assert.deepEqual(o.run.history, ['one', 'two', 'end']);
});

test('the whole Cold Wake intro plays forward to the live handoff', () => {
  const c = validateCampaign(cold()).campaign;
  let { run } = startRun(c), zones = 0, guard = 0;
  while (run.phase !== 'live' && guard++ < 100) {
    let o = control(c, run, 'forward'); if (!o.effects.length) o = control(c, run, 'clipEnded');
    zones += o.effects.filter(e => e.type === 'zone').length; run = o.run;
  }
  assert.equal(run.phase, 'live'); assert.equal(zones, c.zones.length - 1); assert.equal(run.history.length, c.beats.length);
});

test('stick: up is forward, sideways looks, down does nothing', () => {
  assert.equal(stickInput(0, -0.9), 'forward'); assert.equal(stickInput(0.1, -0.7), 'forward');
  assert.equal(stickInput(0, 0.95), null); assert.equal(stickInput(0.1, 0.9), null);
  assert.equal(stickInput(-0.8, 0.1), 'left'); assert.equal(stickInput(0.8, -0.2), 'right'); assert.equal(stickInput(0.1, 0.1), null);
});

test('characters answer to their name', () => {
  const c = validateCampaign(cold()).campaign;
  assert.equal(nameCalled('hey, Teo!', c.characters).id, 'teo');
  assert.equal(nameCalled('Wren-6, stay close', c.characters).id, 'wren');
  assert.equal(nameCalled('chief, where now?', c.characters).id, 'vance');
  assert.equal(nameCalled('I see theodore', c.characters), null);
  assert.equal(nameCalled('hello', c.characters), null);
});

test('dead-panel quest: trigger, find the engineer, bring him back, he stays', () => {
  const q = validateCampaign(cold()).campaign.quests.find(x => x.id === 'dead-panel');
  let r = questStep(q, null, { type: 'text', text: 'hi' }); assert.equal(r.progress.state, 'idle');
  r = questStep(q, r.progress, { type: 'live' }); assert.equal(r.progress.state, 'active'); assert.equal(r.effects[0].who, 'vance');
  assert.match(questStatus(q, r.progress), /Teo/);
  r = questStep(q, r.progress, { type: 'talk', who: 'vance', text: 'ok' }); assert.equal(r.progress.state, 'active');
  r = questStep(q, r.progress, { type: 'talk', who: 'teo', text: 'hey Teo' }); assert.equal(r.progress.state, 'found'); assert.equal(r.effects[0].type, 'found');
  r = questStep(q, r.progress, { type: 'talk', who: 'teo', text: 'how are you' }); assert.equal(r.progress.state, 'found');
  r = questStep(q, r.progress, { type: 'talk', who: 'teo', text: 'come with me' }); assert.equal(r.progress.state, 'done');
  assert.equal(r.effects[0].who, 'teo'); assert.equal(r.effects[0].flag, 'panel-fixed');
  assert.deepEqual(questStep(q, r.progress, { type: 'live' }).effects, []);
});

test('live cast uses the campaign crew and only clips that exist', () => {
  const c = validateCampaign(cold()).campaign;
  const none = liveCast(c);
  assert.deepEqual(none.map(x => x.id), c.live.crew.map(id => 'cmp-cryo-escape-' + id));
  assert.ok(none.every(x => !x.chroma && !Object.keys(x.clips).length && x.persona));
  const some = liveCast(c, k => k === 'vance_idle_loop' ? 'campaigns/cryo-escape/media/vance_idle_loop.mp4' : '');
  const v = some.find(x => x.name === 'Vance Okafor'); assert.equal(v.chroma, 'green'); assert.equal(v.clips.normal, 'campaigns/cryo-escape/media/vance_idle_loop.mp4');
});
