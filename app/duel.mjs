// The Kumite, first duel: you against Kasumi on the Dragon Temple floor.
// She is a green-screen video standing in the 3D arena and always facing you (lock-on). Her clips: a guard
// stance (still), attack, hurt, knockout, victory. Positioning is the skill: when she swings, sidestep or step
// back so it misses; step in close and strike to land a hit. Each life meter empties to a knockout.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/three/libs/meshopt_decoder.module.js';

const $ = id => document.getElementById(id);
const FOE = {
  name: 'Kasumi', stance: 'assets/km-kasumi-fight.webp?2',
  clips: { attack: 'assets/km-kasumi-attack1.mp4', hurt: 'assets/km-kasumi-hurt.mp4', ko: 'assets/km-kasumi-ko.mp4', victory: 'assets/km-kasumi-victory.mp4' },
  hitAt: 1.15,          // seconds into her attack clip when the blade lands
  reach: 2.9,           // metres: how far her cut reaches
  lines: { start: 'You came all this way to lose in the mist?', hit: ['Lucky.', 'Is that all?', 'Again!'], miss: ['Too slow.', 'Stand still!'], win: 'The mist always wins.', lose: 'Well fought… outsider.' },
};
const ARENA = 'assets/kumite/dragon-temple.glb';

// ---------- renderer ----------
const canvas = $('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb7d6); scene.fog = new THREE.Fog(0xb9c8dd, 40, 140);
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 400); camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5a50, 2.4)); const sun = new THREE.DirectionalLight(0xffe2b8, 1.6); sun.position.set(20, 40, 10); scene.add(sun);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() };
addEventListener('resize', resize); resize();

// ---------- arena ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let floorY = 0; const ray = new THREE.Raycaster(); let arena = null, RADIUS = 8;
try {
  const g = await loader.loadAsync(ARENA); arena = g.scene;
  const b = new THREE.Box3().setFromObject(arena), size = b.getSize(new THREE.Vector3()), k = 36 / Math.max(size.x, size.z);
  arena.scale.setScalar(k); const c = b.getCenter(new THREE.Vector3()); arena.position.set(-c.x * k, -b.min.y * k, -c.z * k); scene.add(arena); arena.updateMatrixWorld(true);
  ray.set(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, -1, 0)); const hit = ray.intersectObject(arena, true)[0]; floorY = hit ? hit.point.y : 0;
  // how far the fighting floor reaches: walk out from the centre until the floor drops away
  for (let r = 2; r < 18; r += 0.5) { ray.set(new THREE.Vector3(r, floorY + 3, 0), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(arena, true)[0]; if (!h || Math.abs(h.point.y - floorY) > 0.6) { RADIUS = Math.max(4, r - 1); break } RADIUS = r }
} catch (e) { const f = new THREE.Mesh(new THREE.CircleGeometry(10, 48), new THREE.MeshStandardMaterial({ color: 0x6b5446 })); f.rotation.x = -Math.PI / 2; scene.add(f) }

// ---------- Kasumi: a keyed video card standing on the floor ----------
const KEY_FS = `uniform sampler2D map;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv);float g=c.g-max(c.r,c.b);float a=1.0-smoothstep(0.06,0.22,g);vec3 o=c.rgb;o.g=min(o.g,min(max(c.r,c.b),(c.r+c.b)*0.5+0.03));if(a<0.02)discard;gl_FragColor=vec4(o,a);}`;
const KEY_VS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const tl = new THREE.TextureLoader(), stanceTex = await tl.loadAsync(FOE.stance); stanceTex.colorSpace = THREE.SRGBColorSpace;
const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: stanceTex } }, vertexShader: KEY_VS, fragmentShader: KEY_FS, transparent: true, depthWrite: false });
// The clips are square, full body, feet about 12% up from the bottom edge, figure about 78% of the height.
const CARD = 1.7 / 0.78, card = new THREE.Mesh(new THREE.PlaneGeometry(CARD, CARD), mat); scene.add(card);
const clips = {};
for (const [k, src] of Object.entries(FOE.clips)) {
  const v = document.createElement('video'); v.src = src; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; clips[k] = { v, tex };
}
const ready = Promise.all(Object.values(clips).map(c => new Promise(r => { if (c.v.readyState >= 2) r(); else { c.v.addEventListener('loadeddata', r, { once: true }); c.v.addEventListener('error', r, { once: true }) } })));

// ---------- state ----------
const foe = { p: new THREE.Vector2(0, -2.6), hp: 100, state: 'idle', t: 0, cool: 2.2, aimAt: null, struck: false };
const me = { p: new THREE.Vector2(0, 2.6), hp: 100, cool: 0, yawOff: 0 };
let started = false, over = false, now = 0;
const keys = new Set();

let current = null, ending = null, endAt = 0;   // the clip playing, what to do when it ends, and when (timed, so a clip that can't play still ends)
function play(name, onEnd) {
  for (const c of Object.values(clips)) c.v.pause();
  current = name; ending = null;
  if (!name) { mat.uniforms.map.value = stanceTex; return }
  // keep her stance on screen until the clip really has a frame (some phones are slow to start a video)
  const c = clips[name]; c.v.currentTime = 0; c.v.muted = false; mat.uniforms.map.value = stanceTex;
  c.v.onplaying = () => { c.v.onplaying = null; if (current === name) mat.uniforms.map.value = c.tex };
  c.v.play().catch(() => { c.v.muted = true; c.v.play().catch(() => { }) });
  current = name; ending = onEnd; endAt = now + (c.v.duration || 4) + 0.15;
}
function setFoe(state) { foe.state = state; foe.t = 0 }
function bars() { $('hpMe').style.width = Math.max(0, me.hp) + '%'; $('hpThem').style.width = Math.max(0, foe.hp) + '%' }
let msgT = 0; function msg(t, ms = 900) { const m = $('msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(msgT); msgT = setTimeout(() => m.style.opacity = 0, ms) }
let lineT = 0; function say(t) { const l = $('line'); l.textContent = `${FOE.name}: “${t}”`; l.style.display = 'block'; clearTimeout(lineT); lineT = setTimeout(() => l.style.display = 'none', 2600) }
const pick = a => a[Math.floor(Math.random() * a.length)];

// small synthesized sounds: a swish for your strike, a thud when you are hit
let ac = null; const audio = () => ac ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
function noise(dur, f0, f1, gain) { try { const a = audio(), n = a.sampleRate * dur, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, a.currentTime); f.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur); const g = a.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(a.destination); s.start() } catch { } }

// ---------- your strike ----------
function strike() {
  if (!started || over || me.cool > 0) return; me.cool = 0.55;
  const s = $('slash'); s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); noise(0.18, 2400, 600, 0.35);
  const d = me.p.distanceTo(foe.p);
  if (d > 2.3) { msg('Too far', 600); return }
  if (foe.state === 'ko' || foe.state === 'victory') return;
  // hitting her before her blade lands interrupts the attack
  foe.hp -= 10 + Math.round(Math.random() * 6); bars(); noise(0.12, 900, 300, 0.6);
  if (foe.hp <= 0) { over = true; setFoe('ko'); play('ko'); msg('K.O.!', 2200); setTimeout(() => { say(FOE.lines.lose); end('You win') }, 2600); return }
  msg('Hit!', 500); if (Math.random() < 0.35) say(pick(FOE.lines.hit));
  setFoe('hurt'); foe.cool = Math.max(foe.cool, 1.0);
  play('hurt', () => { if (foe.state === 'hurt') { setFoe('idle'); play(null) } });
  // a short hurt: cut back to her stance early so the fight keeps its pace
  setTimeout(() => { if (foe.state === 'hurt' && foe.t > 1.3) { setFoe('idle'); play(null) } }, 1400);
}
$('strike').addEventListener('pointerdown', e => { e.preventDefault(); strike() });

// ---------- her attack ----------
function foeAttack() { setFoe('attack'); foe.aimAt = me.p.clone(); foe.struck = false; play('attack', () => { if (foe.state === 'attack') { setFoe('idle'); play(null); foe.cool = 1.4 + Math.random() * 1.6 } }) }
function foeLands() {
  foe.struck = true;
  const d = me.p.distanceTo(foe.p), dodged = me.p.distanceTo(foe.aimAt) > 0.85;   // you moved off the line she aimed at
  if (d > FOE.reach || dodged) { msg(dodged ? 'Dodged!' : 'Miss', 700); if (Math.random() < 0.4) say(pick(FOE.lines.miss)); return }
  me.hp -= 14 + Math.round(Math.random() * 6); bars(); noise(0.25, 300, 80, 0.9);
  const f = $('flash'); f.style.opacity = 1; setTimeout(() => f.style.opacity = 0, 180); navigator.vibrate?.(80);
  camera.userData.shake = 0.25;
  if (me.hp <= 0) { over = true; setFoe('victory'); setTimeout(() => { play('victory'); say(FOE.lines.win) }, 500); msg('Defeated', 2400); setTimeout(() => end('Kasumi wins'), 4600) }
}

function end(text) {
  const s = $('start'); s.querySelector('h1').textContent = text; s.querySelector('p').innerHTML = text === 'You win' ? 'Kasumi is down. The Kumite goes on.' : 'Read her swing, then move off the line.';
  s.querySelectorAll('p')[1]?.remove(); const b = $('go'); b.textContent = 'Rematch'; b.disabled = false; s.style.display = 'grid';
}
function reset() { foe.p.set(0, -2.6); me.p.set(0, 2.6); foe.hp = me.hp = 100; foe.cool = 2.2; me.cool = 0; over = false; setFoe('idle'); play(null); bars() }

// ---------- controls ----------
for (const b of document.querySelectorAll('[data-k]')) {
  const k = b.dataset.k, on = e => { e.preventDefault(); keys.add(k); b.classList.add('down') }, off = () => { keys.delete(k); b.classList.remove('down') };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
}
const KEYMAP = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
addEventListener('keydown', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys.add(k); if (e.code === 'Space') { e.preventDefault(); strike() } });
addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys.delete(k) });

// ---------- loop ----------
let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (t - last) / 1000); last = t; now += dt;
  if (started && !over) {
    // you move relative to her: in/out along the line between you, left/right circles round her
    const to = foe.p.clone().sub(me.p), dist = to.length(), fwd = to.clone().normalize(), side = new THREE.Vector2(-fwd.y, fwd.x);
    const mv = new THREE.Vector2(); if (keys.has('up')) mv.add(fwd); if (keys.has('down')) mv.sub(fwd); if (keys.has('left')) mv.sub(side); if (keys.has('right')) mv.add(side);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(3.4 * dt); me.p.add(mv); if (me.p.distanceTo(foe.p) < 1.3) me.p.copy(foe.p.clone().add(me.p.clone().sub(foe.p).setLength(1.3))) }
    if (me.p.length() > RADIUS) me.p.setLength(RADIUS);
    me.cool = Math.max(0, me.cool - dt);
    // her: close in when far, then attack on a timer
    foe.t += dt;
    if (foe.state === 'idle') {
      foe.cool -= dt; const d = me.p.distanceTo(foe.p);
      if (d > 2.4) { const step = me.p.clone().sub(foe.p).setLength(Math.min(d - 2.2, 1.6 * dt)); foe.p.add(step) }
      if (foe.cool <= 0 && d < 2.8) foeAttack();
    }
    if (foe.state === 'attack' && !foe.struck && foe.t >= FOE.hitAt) foeLands();
  }
  if (ending && now >= endAt) { const f = ending; ending = null; f() }
  // place her and the camera: always face each other
  card.position.set(foe.p.x, floorY + CARD * (0.5 - 0.12), foe.p.y);
  card.lookAt(camera.position.x, card.position.y, camera.position.z);
  const shake = camera.userData.shake || 0; camera.userData.shake = Math.max(0, shake - dt);
  camera.position.set(me.p.x + (Math.random() - 0.5) * shake * 0.3, floorY + 1.62 + Math.sin(now * 1.6) * 0.01, me.p.y);
  camera.rotation.y = Math.atan2(-(foe.p.x - me.p.x), -(foe.p.y - me.p.y)); camera.rotation.x = -0.06;
  renderer.render(scene, camera);
}
bars(); requestAnimationFrame(frame);
await ready;
const go = $('go'); go.disabled = false; go.textContent = 'Fight';
go.onclick = () => {
  audio().resume?.();
  // unlock the clips' sound on this tap (phones only allow it from a touch)
  for (const c of Object.values(clips)) { c.v.muted = true; c.v.play().then(() => { c.v.pause(); c.v.currentTime = 0; c.v.muted = false }).catch(() => { }) }
  $('start').style.display = 'none'; if (over || foe.hp < 100 || me.hp < 100) reset();
  started = true; msg('Fight!', 1000); setTimeout(() => say(FOE.lines.start), 900);
};
window.duel = { foe, me, strike, get state() { return foe.state } };
