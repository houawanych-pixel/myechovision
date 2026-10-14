// Walk the ship: a first-person walk through decks 4-6 of the Homelancer starship model, with sliding doors,
// working turbolifts (call button outside, deck buttons inside) and Judy following on a camera-facing billboard.
// Plan coordinates (ship-core.mjs) are x across, y toward the nose, z up; three.js uses (x, z, -y).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/three/libs/meshopt_decoder.module.js';
import { buildPlan, slide, walkable, floorAt, roomAt, updateDoors, liftAt, liftNear, liftDoor, createFollower, recordTrail, stepFollower, placeFollower, EYE } from './ship-core.mjs?v=2';

const $ = id => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOM_NAMES = { messhall: 'Mess hall', fcorr: 'Forward corridor', neck: 'Corridor', corridor: 'Crew corridor', corridor4: 'Crew corridor', aftneck: 'Corridor', aftcorr: 'Aft corridor', aftcorr4: 'Aft corridor', armory: 'Armory', brig: 'Brig', ecorr: 'Engineering hall', d6corr: 'Corridor', holodeck: 'Holodeck', gym: 'Gym', cargo: 'Cargo bay', crewlounge: 'Crew lounge', sickbay: 'Sickbay', transporter: 'Transporter room', d3corr: 'Corridor', sciencelab: 'Science lab', hydroponics: 'Hydroponics', cabin: 'Crew cabin' };
const DECK_OF_ROOM = { sickbay: 'Deck 3', transporter: 'Deck 3', d3corr: 'Deck 3', lift_f3: 'Deck 3' };
const DECK_LABEL = { 31: 'Deck 6', 36: 'Deck 5', 42: 'Deck 4' };

// ---------- renderer and scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e19);
scene.fog = new THREE.Fog(0x1a1d26, 18, 55);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 90);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xfff3e4, 0x5d574d, 1.55));
const lamp = new THREE.PointLight(0xfff1dc, 18, 14, 1.6); scene.add(lamp);
const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() };
addEventListener('resize', resize); resize();

// ---------- state ----------
let plan = null;
const player = { p: [0, 79], deck: 36, yaw: 0, pitch: -0.04, vel: [0, 0], floor: 36 };
let judy = null, riding = false, started = false;
const DEFAULT_START = { p: [0, 79], yaw: Math.PI };   // deck 5 crew corridor beside the middle lift, facing the stern

// ---------- loading ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const [layout, gltf] = await Promise.all([
  fetch('assets/ship/layout.json?v=1').then(r => r.json()),
  loader.loadAsync('assets/ship/decks.glb?v=1')
]);
plan = buildPlan(layout);
let doorMat = null;
const holoMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.0);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: 'varying vec3 wp;void main(){vec3 g=abs(fract(wp/1.0)-0.5);float l=smoothstep(0.47,0.5,max(max(g.x,g.y),g.z)*0.0+min(min(max(g.x,g.y),max(g.y,g.z)),max(g.x,g.z)));gl_FragColor=vec4(vec3(0.02,0.02,0.02)+vec3(1.0,0.72,0.2)*l*0.9,1.0);}' });
// windows: the Blender star shader does not travel in the file, so the glass gets a star field drawn here
const starMat = new THREE.ShaderMaterial({ vertexShader: 'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.0);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: 'varying vec3 wp;float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}void main(){vec3 c=vec3(0.025,0.018,0.07);vec3 q=floor(wp*5.0);float s=h(q);if(s>0.975){vec3 f=fract(wp*5.0)-0.5;float d=length(f);c+=vec3(0.9,0.92,1.0)*smoothstep(0.22,0.0,d)*(s-0.975)*40.0;}gl_FragColor=vec4(c,1.0);}' });
gltf.scene.traverse(o => {
  if (!o.isMesh) return;
  const m = o.material;
  // the cabins' painted door is replaced by real sliding doors; keep its picture for every door leaf
  if (m && /doorimg/i.test(m.name || '')) { doorMat = m; o.visible = false }
  if (m && m.transparent && m.opacity < 0.05) o.visible = false;
  if (m && /star/i.test(m.name || '')) o.material = starMat;
  // Blender's procedural looks, redone simply: glass you can see through, the Voyager-style carpet, the holodeck grid
  if (m && /glass|frost/i.test(m.name || '')) { m.transparent = true; m.opacity = /frost/i.test(m.name) ? 0.55 : 0.18; m.depthWrite = false; m.roughness = 0.05 }
  if (m && /carpet/i.test(m.name || '')) { m.color.set(/grey/i.test(m.name) ? 0x55535c : /mauve/i.test(m.name) ? 0x5e4a58 : /tan/i.test(m.name) ? 0x7d6a55 : 0x3d3946); m.roughness = 1; m.metalness = 0 }
  if (m && /holo/i.test(m.name || '')) o.material = holoMat;
  o.frustumCulled = true;
});
scene.add(gltf.scene);

// ---------- doors ----------
doorMat ??= new THREE.MeshStandardMaterial({ color: 0x8b93a5, metalness: 0.4, roughness: 0.5 });
const doorGroup = new THREE.Group(); scene.add(doorGroup);
for (const d of plan.doors) {
  const h = 2.6, half = d.w / 2, leaves = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(half, h, 0.07);
    // each leaf shows its half of the door picture
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, s < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
    const mesh = new THREE.Mesh(g, d.works ? doorMat : doorMat.clone());
    if (!d.works) mesh.material.color = new THREE.Color(0x6b5a5a);
    doorGroup.add(mesh); leaves.push({ mesh, s });
  }
  d.leaves = leaves;
  d.base = V(d.x, d.y, d.deck + h / 2);
  d.rotY = Math.atan2(d.u[1], d.u[0]);   // leaf width runs along the wall
}
function placeDoors() {
  for (const d of plan.doors) for (const { mesh, s } of d.leaves) {
    const off = s * (d.w / 4 + d.open * d.w / 2 * 0.96);
    mesh.position.set(d.base.x + d.u[0] * off, d.base.y, d.base.z - d.u[1] * off);
    mesh.rotation.y = d.rotY;
    mesh.visible = d.open < 0.999;
  }
}

// ---------- Judy on a billboard ----------
// Her clips are green-screen videos framed from the head to mid-thigh; the key and a soft fade at the bottom
// run in the shader, the same idea as the chat stage (stage.mjs), so she stands in the corridor with no box around her.
const KEY_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const KEY_FS = `uniform sampler2D map;uniform float spill;uniform float light;varying vec2 vUv;
void main(){vec4 c=texture2D(map,vUv);float k=c.g-max(c.r,c.b);float a=1.0-smoothstep(0.06,0.2,k);
vec3 o=c.rgb;o.g=min(o.g,mix(o.g,max(o.r,o.b),spill));a*=c.a*smoothstep(0.0,0.3,vUv.y);if(a<0.02)discard;
gl_FragColor=vec4(o*light,a);
#include <colorspace_fragment>
}`;
function videoClip(src) {
  const v = document.createElement('video');
  v.src = src; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace;
  return { v, tex };
}
const still = new THREE.TextureLoader().load('assets/judy.webp'); still.colorSpace = THREE.SRGBColorSpace;
const clips = { normal: videoClip('assets/judy-normal.mp4'), walk: videoClip('assets/judy-walk.mp4') };
const judyMat = new THREE.ShaderMaterial({ uniforms: { map: { value: still }, spill: { value: 0.8 }, light: { value: 1.0 } }, vertexShader: KEY_VS, fragmentShader: KEY_FS, transparent: true, depthWrite: false });
const JH = 1.18, JW = JH * 400 / 736;
const judyMesh = new THREE.Mesh(new THREE.PlaneGeometry(JW, JH), judyMat);
judyMesh.renderOrder = 10; scene.add(judyMesh);
let judyClip = null;
function showClip(name) {
  if (judyClip === name) return; judyClip = name;
  const c = clips[name];
  const playing = c && c.v.readyState >= 2 && !c.v.paused;
  judyMat.uniforms.map.value = playing ? c.tex : still;
}

// ---------- controls ----------
const input = { mx: 0, my: 0, keys: new Set() };
let stickId = null, stickO = null, lookId = null, lookLast = null;
const knob = $('knob'), knobDot = knob.firstElementChild;
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pointerdown', e => {
  if (!started || e.target.closest('button,a,.panel')) return;
  const left = e.clientX < innerWidth / 2 && e.pointerType !== 'mouse';
  if (left && stickId === null) { stickId = e.pointerId; stickO = [e.clientX, e.clientY]; knob.style.display = 'block'; knob.style.left = e.clientX + 'px'; knob.style.top = e.clientY + 'px'; knobDot.style.transform = '' }
  else if (lookId === null) { lookId = e.pointerId; lookLast = [e.clientX, e.clientY] }
});
addEventListener('pointermove', e => {
  if (e.pointerId === stickId) {
    let dx = e.clientX - stickO[0], dy = e.clientY - stickO[1]; const r = Math.hypot(dx, dy), R = 55;
    if (r > R) { dx *= R / r; dy *= R / r }
    input.mx = dx / R; input.my = -dy / R; knobDot.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === lookId) {
    const k = e.pointerType === 'mouse' ? 0.004 : 0.0055;
    player.yaw -= (e.clientX - lookLast[0]) * k; player.pitch = Math.max(-1.1, Math.min(1.1, player.pitch - (e.clientY - lookLast[1]) * k));
    lookLast = [e.clientX, e.clientY];
  }
});
const endPointer = e => {
  if (e.pointerId === stickId) { stickId = null; input.mx = input.my = 0; knob.style.display = 'none' }
  if (e.pointerId === lookId) lookId = null;
};
addEventListener('pointerup', endPointer); addEventListener('pointercancel', endPointer);
addEventListener('keydown', e => input.keys.add(e.key.toLowerCase()));
addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));

// ---------- sound: soft door hiss and lift hum, made on the fly ----------
let actx = null;
function hiss(gain = 0.08, dur = 0.5) {
  if (!actx) return; const n = actx.sampleRate * dur, b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; g.gain.value = gain; s.buffer = b; s.connect(f).connect(g).connect(actx.destination); s.start();
}
function hum(sec) {
  if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
  o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(72, t + sec * 0.5); o.frequency.linearRampToValueAtTime(55, t + sec);
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3); g.gain.setValueAtTime(0.06, t + sec - 0.4); g.gain.linearRampToValueAtTime(0, t + sec);
  o.connect(f).connect(g).connect(actx.destination); o.start(t); o.stop(t + sec + 0.05);
}

// footsteps: a soft heel-and-sole thump, yours in the middle, hers placed where she is, half a step out of time with yours
let stepBuf = null;
function stepSound(gain, pan, rate) {
  if (!actx) return;
  if (!stepBuf) {
    const n = Math.floor(actx.sampleRate * 0.16); stepBuf = actx.createBuffer(1, n, actx.sampleRate); const d = stepBuf.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / actx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 38) * 0.8 + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 30) * 0.9 + (t > 0.05 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.05) * 60) * 0.35 : 0) }
  }
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), pn = actx.createStereoPanner ? actx.createStereoPanner() : null;
  s.buffer = stepBuf; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 300; g.gain.value = gain;
  let n = s.connect(f).connect(g); if (pn) { pn.pan.value = Math.max(-1, Math.min(1, pan)); n = n.connect(pn) } n.connect(actx.destination); s.start();
}
const steps = { me: 0, her: 0.45 };
function footsteps(dt) {
  const mine = Math.hypot(...player.vel) * dt; steps.me += mine;
  if (steps.me > 0.72) { steps.me = 0; stepSound(0.22, 0, 1.0) }
  if (judy.moving && judy.deck === player.deck) {
    steps.her += Math.hypot(...judy.vel) * dt;
    if (steps.her > 0.66) {
      steps.her = 0;
      // left or right of you, from where she is relative to the way you face
      const dx = judy.p[0] - player.p[0], dy = judy.p[1] - player.p[1], rx = Math.cos(player.yaw), ry = Math.sin(player.yaw);
      const dist = Math.hypot(dx, dy) || 1;
      stepSound(0.28 / Math.max(1, dist * 0.6), (dx * rx + dy * ry) / dist * 0.8, 1.22);
    }
  }
}

// ---------- lifts ----------
const call = $('call'), panel = $('panel'), floors = $('floors'), fade = $('fade');
let panelLift = null;
function renderPanel(lift) {
  panelLift = lift;
  floors.replaceChildren(...lift.stops.map(s => {
    const b = document.createElement('button'), here = s.deck === lift.at;
    b.className = here ? 'here' : ''; b.innerHTML = `<span>${s.name}</span><b></b>`;
    b.onclick = () => { if (!here) ride(lift, s.deck) };
    return b;
  }));
}
async function moveCar(lift, to) {
  const n = Math.max(1, Math.round(Math.abs(to - lift.at) / 5.5));
  lift.moving = true; hum(1.2 * n + 0.6); await sleep(1200 * n + 600); lift.at = to; lift.moving = false;
  lift.forceOpen = to; setTimeout(() => { if (lift.forceOpen === to) lift.forceOpen = null }, 2500);
}
async function ride(lift, to) {
  if (riding || lift.moving) return; riding = true;
  floors.querySelectorAll('button').forEach(b => { if (b.textContent === lift.stops.find(s => s.deck === to).name) b.className = 'go' });
  lift.hold = true; hiss(0.06); await sleep(800);                           // doors close
  const dest = lift.stops.find(s => s.deck === to).name;
  $('where').textContent = 'Turbolift → ' + dest;
  fade.style.opacity = '0.55';
  const from = player.deck, n = Math.max(1, Math.round(Math.abs(to - from) / 5.5));
  lift.moving = true; hum(1.2 * n + 0.6);
  const t0 = performance.now(), dur = 1200 * n + 600;
  while (performance.now() - t0 < dur) { await sleep(16) }
  // arrive: you and Judy are carried to the same spot on the new deck
  player.deck = to; player.floor = to; lift.at = to; lift.moving = false;
  placeFollower(judy, [lift.x + (lift.x > player.p[0] ? 0.6 : -0.6), lift.y + 0.7], to);
  fade.style.opacity = '0'; lift.hold = false;
  lift.forceOpen = to; setTimeout(() => { if (lift.forceOpen === to) lift.forceOpen = null }, 2500);
  hiss(0.06); riding = false; renderPanel(lift);
}
call.onclick = async () => {
  const lift = liftNear(plan, player.p, player.deck);
  if (!lift || lift.moving || lift.at === player.deck) return;
  call.textContent = 'Lift coming…'; await moveCar(lift, player.deck); call.textContent = 'Call lift'; hiss(0.06);
};

// ---------- main loop ----------
function placeCamera() {
  const p = player.p;
  camera.position.copy(V(p[0], p[1], player.floor + EYE));
  camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
  lamp.position.copy(V(p[0], p[1], player.floor + 2.6));
}
let last = performance.now(), hintTimer = 0, labelTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started && !riding) {
    let mx = input.mx, my = input.my; const k = input.keys;
    if (k.has('w') || k.has('arrowup')) my = 1; if (k.has('s') || k.has('arrowdown')) my = -1;
    if (k.has('a')) mx = -1; if (k.has('d')) mx = 1;
    if (k.has('arrowleft')) player.yaw += 1.8 * dt; if (k.has('arrowright')) player.yaw -= 1.8 * dt;
    const fx = -Math.sin(player.yaw), fy = Math.cos(player.yaw), rx = Math.cos(player.yaw), ry = Math.sin(player.yaw);
    const sp = 2.2, vx = (fx * my + rx * mx) * sp, vy = (fy * my + ry * mx) * sp;
    const np = slide(plan, player.p, vx * dt, vy * dt, player.deck);
    player.vel = [(np[0] - player.p[0]) / dt, (np[1] - player.p[1]) / dt]; player.p = np;
    if (Math.hypot(vx, vy) > 0.1 && !hintTimer) hintTimer = setTimeout(() => $('hint').style.opacity = '0', 2500);
    const fl = floorAt(plan, player.p, player.deck); player.floor += (fl - player.floor) * Math.min(1, dt * 4);
    recordTrail(judy, player.p, player.deck);
  } else player.vel = [0, 0];
  if (judy) { stepFollower(judy, plan, player, dt); if (started && !riding) footsteps(dt) }
  // doors: you and Judy both open them
  const before = plan.doors.map(d => d.open > 0.02);
  updateDoors(plan, [player, judy].filter(Boolean), dt);
  plan.doors.forEach((d, i) => { if (!before[i] && d.open > 0.02 && Math.hypot(d.x - player.p[0], d.y - player.p[1]) < 12 && d.deck === player.deck) hiss() });
  placeDoors();
  // lift buttons: "Call lift" outside a lift door, the deck panel inside the car
  const inLift = liftAt(plan, player.p, player.deck), near = !inLift && liftNear(plan, player.p, player.deck);
  if (inLift) { if (panelLift !== inLift || panel.style.display !== 'block') renderPanel(inLift); panel.style.display = 'block'; call.style.display = 'none' }
  else { panel.style.display = 'none'; panelLift = null; call.style.display = near && near.at !== player.deck ? 'block' : 'none' }
  // Judy: stand on the floor, face the camera, walk clip when she moves away from you
  const jf = floorAt(plan, judy.p, judy.deck);
  judyMesh.visible = judy.deck === player.deck;
  judyMesh.position.copy(V(judy.p[0], judy.p[1], jf + 1.8 - JH / 2));
  judyMesh.rotation.set(0, Math.atan2(camera.position.x - judyMesh.position.x, camera.position.z - judyMesh.position.z), 0);
  const away = judy.moving && ((judy.p[0] - player.p[0]) * judy.vel[0] + (judy.p[1] - player.p[1]) * judy.vel[1]) > 0.3;
  showClip(away ? 'walk' : 'normal');
  placeCamera();
  if (now - labelTimer > 300 && !riding) {
    labelTimer = now; const r = roomAt(plan, player.p, player.deck);
    const deck = DECK_OF_ROOM[r?.name] || (r?.lift ? r.lift.stops.find(s => s.deck === player.deck)?.name : null) || DECK_LABEL[player.deck];
    $('where').textContent = deck + (r && !r.lift ? ' · ' + (ROOM_NAMES[r.name] || r.name.replace(/\d|[LR]$/g, '').replace(/^stub4?/, 'Cabin hall')) : r?.lift ? ' · Turbolift' : '');
  }
  if (!NORENDER) renderer.render(scene, camera);
}

// ---------- start ----------
const params = new URLSearchParams(location.search), NORENDER = params.has('norender');
player.p = [...DEFAULT_START.p]; player.yaw = DEFAULT_START.yaw;
if (params.get('at')) { const [x, y, z] = params.get('at').split(',').map(Number); player.p = [x, y]; if (z) { player.deck = z; player.floor = z } }
if (params.get('yaw')) player.yaw = Number(params.get('yaw'));
judy = createFollower([player.p[0] + Math.sin(player.yaw) * 1.45, player.p[1] - Math.cos(player.yaw) * 1.45], player.deck);
if (!walkable(plan, judy.p, judy.deck)) placeFollower(judy, player.p, player.deck);
judy.trail = [[...player.p]];
placeDoors(); placeCamera();
requestAnimationFrame(frame);
const go = $('go'); go.disabled = false; go.textContent = 'Start walking';
go.onclick = () => {
  try { actx = new (window.AudioContext || window.webkitAudioContext)() } catch { }
  for (const c of Object.values(clips)) c.v.play().then(() => { judyClip = null }).catch(() => { });
  $('start').style.display = 'none'; started = true;
};
if (params.has('autostart')) go.onclick();
// for checks: window.ship exposes the live state
window.ship = { plan, player, get judy() { return judy }, ride, camera, renderer, snap() { placeDoors(); placeCamera(); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', 0.85) } };
