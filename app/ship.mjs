// Walk mode. By default: a first-person walk through decks 4-6 of the Homelancer starship model, with sliding doors,
// working turbolifts (call button outside, deck buttons inside) and Judy following on a camera-facing billboard.
// Opened from a story (?session=<id>) it loads that story's scene and companion instead: the starship or the
// person's own 3D world (.glb), and their companion as a billboard (picture or green-screen clips) or a 3D model.
// Plan coordinates (ship-core.mjs) are x across, y toward the nose, z up; three.js uses (x, z, -y).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { setupRig } from './rig.mjs?v=1';
import { MeshoptDecoder } from './vendor/three/libs/meshopt_decoder.module.js';
import { createTalk } from './ship-talk.mjs?v=5';
import { buildPlan, slide, walkable, floorAt, roomAt, updateDoors, liftAt, liftNear, liftDoor, createFollower, recordTrail, stepFollower, placeFollower, EYE } from './ship-core.mjs?v=5';

const $ = id => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, z, -y);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const params = new URLSearchParams(location.search), NORENDER = params.has('norender');

// ---------- what to load ----------
// Files people upload in My Echo Vision live in this browser's IndexedDB; built-in ones are plain paths.
function idbGet(key) {
  return new Promise(res => {
    try {
      const r = indexedDB.open('echo-vision-media', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => { try { const q = r.result.transaction('files').objectStore('files').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null) } catch { res(null) } };
      r.onerror = () => res(null);
    } catch { res(null) }
  });
}
async function mediaOf(key) {
  if (!key) return null;
  if (!/^media-/.test(key)) return { url: key, video: /\.(mp4|webm|mov)(\?|$)/i.test(key) };
  const b = await idbGet(key); return b ? { url: URL.createObjectURL(b), video: /^video\//.test(b.type) } : null;
}
// A character with both a 3D body and video clips walks as the 3D body; the Body chip switches to the video (remembered).
function bodyPref() { try { return localStorage.getItem('ship-body') || '3d' } catch { return '3d' } }
async function loadConfig() {
  const JUDY = { name: 'Judy', still: { url: 'assets/judy.webp' }, normal: { url: 'assets/judy-normal.mp4', video: true }, walk: { url: 'assets/judy-walk-knee.mp4', video: true }, walkSound: 'assets/judy-walk-knee.mp3', talk: { url: 'assets/judy-talk.mp4', video: true }, chroma: 'green', spill: 0.8, cut: true, model: 'assets/rigs/judy.glb', rigged: true };
  let st = null; try { st = JSON.parse(localStorage.getItem('echo-vision-studio-v2')) } catch { }
  const sid = params.get('session'), sess = sid && st?.sessions?.find(x => x.id === sid);
  if (!sess) return { world: 'ship', name: 'Walk the ship', partner: { ...JUDY, hasBody: true, model: bodyPref() === 'video' ? '' : JUDY.model } };
  const scene = st.scenes.find(x => x.id === sess.scene) || {}, c = st.cast.find(x => x.id === sess.partner) || {};
  const partner = c.id === 'judy' ? JUDY : {
    name: c.name || 'Your companion', chroma: c.chroma || 'none', spill: c.spill ?? 0.8, rigged: !!c.rigged, cut: !!c.chroma && c.chroma !== 'none',
    model: (await mediaOf(c.model))?.url || '', still: await mediaOf(c.image), normal: await mediaOf(c.clips?.normal || c.loop), walk: await mediaOf(c.clips?.walkLoop || c.clips?.walk), walkSound: (await mediaOf(c.walkSound))?.url || '', talk: await mediaOf(c.clips?.talking)
  };
  const extras = [];
  for (const id of (sess.party || []).filter(x => x !== sess.partner && x !== sess.player).slice(0, 2)) {
    const m = st.cast.find(x => x.id === id); if (!m) continue;
    extras.push({ name: m.name, chroma: m.chroma || 'none', spill: m.spill ?? 0.8, still: await mediaOf(m.image), normal: await mediaOf(m.clips?.normal || m.loop), walk: await mediaOf(m.clips?.walkLoop || m.clips?.walk), full: await mediaOf(m.clips?.approach) });
  }
  partner.hasBody = !!partner.model; if (bodyPref() === 'video') partner.model = '';
  return { world: !scene.world || scene.world === 'ship' ? 'ship' : (await mediaOf(scene.world))?.url || 'ship', name: scene.name || 'Your world', partner, extras };
}
const CFG = await loadConfig(), P = CFG.partner, SHIP = CFG.world === 'ship';
document.querySelector('.start h1').textContent = CFG.name;
document.querySelector('.start p').textContent = SHIP ? `${[P.name, ...(CFG.extras || []).map(x => x.name)].join(' and ')} ${(CFG.extras || []).length ? 'walk' : 'walks'} with you. Doors open as you reach them. Step into a lift and choose a deck.` : `${P.name} walks with you. Use the stick to walk and turn.`;
const ROOM_NAMES = { messhall: 'Mess hall', fcorr: 'Forward corridor', neck: 'Corridor', corridor: 'Crew corridor', corridor4: 'Crew corridor', aftneck: 'Corridor', aftcorr: 'Aft corridor', aftcorr4: 'Aft corridor', armory: 'Armory', brig: 'Brig', ecorr: 'Engineering hall', d6corr: 'Corridor', holodeck: 'Holodeck', gym: 'Gym', cargo: 'Cargo bay', crewlounge: 'Crew lounge', sickbay: 'Sickbay', transporter: 'Transporter room', d3corr: 'Corridor', sciencelab: 'Science lab', hydroponics: 'Hydroponics', cabin: 'Crew cabin' };
const DECK_OF_ROOM = { sickbay: 'Deck 3', transporter: 'Deck 3', d3corr: 'Deck 3', lift_f3: 'Deck 3' };
const DECK_LABEL = { 31: 'Deck 6', 36: 'Deck 5', 42: 'Deck 4' };

// ---------- renderer and scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));   // sharp on phones (her clip especially)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e19);
scene.fog = new THREE.Fog(0xd9dbe0, 30, 90);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 90);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9ca3, 2.6));
const lamp = new THREE.PointLight(0xffffff, 22, 16, 1.6); scene.add(lamp);
const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() };
addEventListener('resize', resize); resize();

// ---------- state ----------
let plan = null;
const player = { p: [0, 79], deck: 36, yaw: 0, pitch: 0, vel: [0, 0], floor: 36 };
let judy = null, riding = false, started = false;
// a world's own .glb can carry a floor plan (scene extras "echoLayout", same format as assets/ship/layout.json):
// then it walks like the starship, with sliding doors and lifts, instead of feeling its way along the model
let PLAN = SHIP, WORLD_LAYOUT = null;
const DEFAULT_START = { p: [0, 79], yaw: Math.PI };   // deck 5 crew corridor beside the middle lift, facing the stern

// ---------- loading ----------
function worldLayout(g) {
  const json = g.parser?.json, sc = json?.scenes?.[json.scene ?? 0];
  let L = g.scene?.userData?.echoLayout ?? sc?.extras?.echoLayout;
  if (typeof L === 'string') { try { L = JSON.parse(L) } catch { L = null } }
  return L && Array.isArray(L.rooms) && Array.isArray(L.doors) && Array.isArray(L.decks) ? L : null;
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let gltf;
if (SHIP) {
  const [layout, g] = await Promise.all([fetch('assets/ship/layout.json?v=1').then(r => r.json()), loader.loadAsync('assets/ship/decks.glb?v=1')]);
  gltf = g; plan = buildPlan(layout);
} else {
  // someone's own 3D world: no floor plan, so walking is checked against the model itself (see groundAt / blocked)
  gltf = await loader.loadAsync(CFG.world);
  WORLD_LAYOUT = worldLayout(gltf);
  if (WORLD_LAYOUT) { plan = buildPlan(WORLD_LAYOUT, WORLD_LAYOUT.decks); PLAN = true }
  else plan = { open: true, rooms: [], doors: [], lifts: [], decks: [0] };
}
let doorMat = null;
// windows look out into space: the glass shows a 360 sky in the direction you look through it, so it moves like a real view
// (the nebula sits ahead of the ship's nose; a sprinkle of fine stars is added on top)
const skyTex = new THREE.TextureLoader().load('assets/sky/crystara.jpg'); skyTex.colorSpace = THREE.NoColorSpace;
const windowMat = new THREE.ShaderMaterial({ uniforms: { sky: { value: skyTex } },
  vertexShader: 'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.0);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: 'uniform sampler2D sky;varying vec3 wp;float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}void main(){vec3 d=normalize(wp-cameraPosition);float lon=atan(d.x,-d.z);vec2 uv=vec2(0.5+lon/6.2831853,0.5+asin(clamp(d.y,-1.0,1.0))/3.1415926);vec3 c=texture2D(sky,uv).rgb*1.15;vec3 q=floor(d*420.0);float s=h(q);if(s>0.992)c+=vec3(0.85,0.9,1.0)*(s-0.992)*110.0*smoothstep(0.5,0.0,length(fract(d*420.0)-0.5));gl_FragColor=vec4(c,1.0);}' });
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
  if (m && /star/i.test(m.name || '')) o.material = windowMat;
  // monitors stay dark glass for now (a screen animation can play on them later)
  if (m && /screen/i.test(m.name || '')) { m.color.set(0x050608); m.emissive?.set(0x000000); m.emissiveIntensity = 0; m.roughness = 0.12; m.metalness = 0.4 }
  // Blender's procedural looks, redone simply: glass you can see through, the Voyager-style carpet, the holodeck grid
  if (m && /glass|frost/i.test(m.name || '')) { m.transparent = true; m.opacity = /frost/i.test(m.name) ? 0.55 : 0.18; m.depthWrite = false; m.roughness = 0.05 }
  if (m && /carpet/i.test(m.name || '')) { m.color.set(0x8d9097); m.roughness = 0.9; m.metalness = 0 }
  // the ship's look on the walk: bright white walls and ceilings with black trim (the beige Blender colours made it dark)
  if (SHIP && m && /beige|field|ceil|wall/i.test(m.name || '') && !/glass|frost/i.test(m.name)) { m.color.set(/beige2|field/i.test(m.name) ? 0xd9dbe0 : 0xf2f3f5); if (m.map) m.color.set(0xffffff) }
  if (SHIP && m && /floor/i.test(m.name || '')) m.color.set(m.map ? 0xffffff : 0xb9bcc3);
  if (m && /holo/i.test(m.name || '')) o.material = holoMat;
  o.frustumCulled = true;
});
scene.add(gltf.scene);
const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), nrm = new THREE.Vector3();
const upHit = h => { if (!h.face) return false; nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld); return nrm.y > 0.55 };
// the floor under a point: the first upward-facing surface below `from` metres
function groundAt(p, from) {
  ray.set(V(p[0], p[1], from), DOWN); ray.far = 60;
  return ray.intersectObject(gltf.scene, true).find(upHit)?.point.y ?? null;
}
// is there a wall within reach in this direction, at knee and chest height?
function blocked(p, floor, dx, dy) {
  const L = Math.hypot(dx, dy); if (!L) return false;
  const dir = new THREE.Vector3(dx / L, 0, -dy / L);
  for (const h of [0.45, 1.2]) { ray.set(V(p[0], p[1], floor + h), dir); ray.far = L + 0.3; if (ray.intersectObject(gltf.scene, true).length) return true }
  return false;
}
if (!SHIP) {
  // models straight from generators are often about one unit across: grow them to a walkable size (about 36 m)
  { const b0 = new THREE.Box3().setFromObject(gltf.scene), s0 = b0.getSize(new THREE.Vector3()), big = Math.max(s0.x, s0.z); if (big > 0 && big < 6) { gltf.scene.scale.multiplyScalar(36 / big); gltf.scene.updateMatrixWorld(true) } }
  const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  camera.far = Math.max(90, span * 3); camera.updateProjectionMatrix(); scene.fog.near = Math.max(18, span * 0.6); scene.fog.far = Math.max(55, span * 2);
  // start in the middle, on the lowest floor there
  ray.set(new THREE.Vector3(mid.x, box.max.y + 1, mid.z), DOWN); ray.far = size.y + 2;
  const hits = ray.intersectObject(gltf.scene, true).filter(upHit);
  CFG.start = { p: [mid.x, -mid.z], floor: hits.length ? hits.at(-1).point.y : box.min.y };
}

// ---------- doors ----------
doorMat ??= new THREE.MeshStandardMaterial({ color: 0x8b93a5, metalness: 0.4, roughness: 0.5 });
const doorGroup = new THREE.Group(); scene.add(doorGroup);
for (const d of plan.doors) {
  const h = 2.6, half = d.w / 2, leaves = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(half, h, 0.07);
    // each leaf shows its half of the door picture
    // each leaf shows its half of the door picture. Seen from the back (box face 5, vertices 20-23) the leaves swap
    // sides, so that face takes the other half: the door reads the right way round from both corridors.
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const left = (i >= 20 && i < 24) ? s > 0 : s < 0; uv.setX(i, left ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5) }
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
const KEY_FS = `uniform sampler2D map;uniform float spill;uniform float light;uniform float key;uniform float fadeBottom;varying vec2 vUv;
void main(){vec4 c=texture2D(map,vUv);vec3 o=c.rgb;float a=1.0;
if(key>1.5){float k=c.b-max(c.r,c.g);a=1.0-smoothstep(0.06,0.2,k);o.b=min(o.b,mix(o.b,max(o.r,o.g),spill));}
else if(key>0.5){float k=c.g-max(c.r,c.b);a=1.0-smoothstep(0.06,0.2,k);o.g=min(o.g,mix(o.g,max(o.r,o.b),spill));}
a*=c.a*smoothstep(0.0,fadeBottom,vUv.y);if(a<0.02)discard;
o=mix(vec3(dot(o,vec3(0.299,0.587,0.114))),o,1.12);o=(o-0.5)*1.06+0.5;   // a touch more colour and contrast: keyed clips look washed out otherwise
gl_FragColor=vec4(clamp(o,0.0,1.0)*light,a);
}`;
function videoClip(src) {
  const v = document.createElement('video');
  v.src = src; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.NoColorSpace;   // raw pixels, shown as they are
  return { v, tex };
}
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
const stillSrc = P.still?.url || (P.normal && !P.normal.video ? P.normal.url : '');
const still = stillSrc ? new THREE.TextureLoader().load(stillSrc, t => fitBillboard(t.image.width, t.image.height)) : blank; still.colorSpace = THREE.NoColorSpace;
const clips = {};
if (P.normal?.video) clips.normal = videoClip(P.normal.url);
if (P.walk?.video) clips.walk = videoClip(P.walk.url);
if (P.talk?.video) clips.talk = videoClip(P.talk.url);
for (const c of Object.values(clips)) c.v.addEventListener('loadedmetadata', () => fitBillboard(c.v.videoWidth, c.v.videoHeight), { once: true });
const judyMat = new THREE.ShaderMaterial({ uniforms: { map: { value: still }, spill: { value: P.spill ?? 0.8 }, light: { value: 1.0 }, key: { value: P.chroma === 'blue' ? 2 : P.chroma === 'green' ? 1 : 0 }, fadeBottom: { value: 0.3 } }, vertexShader: KEY_VS, fragmentShader: KEY_FS, transparent: true, depthWrite: false });
// She is shown big, the way she fills the screen in chat: close to you, her head a little above your eye line,
// and the bottom of her clip (where it stops at the thighs) below the edge of the screen and faded out.
const JH = 1.75, JW = JH * 400 / 736, TOP = EYE + 0.32;
const judyMesh = new THREE.Mesh(new THREE.PlaneGeometry(JW, JH), judyMat);
judyMesh.renderOrder = 10; scene.add(judyMesh);
function fitBillboard(w, h) { if (w && h) judyMesh.scale.x = (w / h) / (400 / 736) }
// ---------- the rest of the party ----------
// Up to two more people follow you too. Nobody walks in single file or hides behind someone else: the first two
// walk side by side (one a little left, one a little right of your path) and a third trails further back in the
// middle, so you see all of them when you look back. Each has their own billboard and clips.
const FULL_H = 1.72;
const EXTRAS = (CFG.extras || []).map((X, i) => {
  // The one further back is seen whole, head to foot, so they use their full-body (far) walk when they have one.
  const full = i === 1 && !!X.full?.video;
  const xc = {}; if (full) { xc.walk = videoClip(X.full.url); xc.normal = xc.walk } else { if (X.normal?.video) xc.normal = videoClip(X.normal.url); if (X.walk?.video) xc.walk = videoClip(X.walk.url) }
  const xsrc = X.still?.url || (X.normal && !X.normal.video ? X.normal.url : '');
  const xstill = xsrc ? new THREE.TextureLoader().load(xsrc) : blank; xstill.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: xstill }, spill: { value: X.spill ?? 0.8 }, light: { value: 1.0 }, key: { value: X.chroma === 'blue' ? 2 : X.chroma === 'green' ? 1 : 0 }, fadeBottom: { value: full ? 0.0 : 0.3 } }, vertexShader: KEY_VS, fragmentShader: KEY_FS, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(full ? FULL_H * 0.66 : JW, full ? FULL_H : JH), mat); mesh.renderOrder = 9 - i; scene.add(mesh);
  for (const c of Object.values(xc)) c.v.addEventListener('loadedmetadata', () => { if (c.v.videoWidth) mesh.scale.x = (c.v.videoWidth / c.v.videoHeight) / (full ? 0.66 : 400 / 736) }, { once: true });
  return { X, full, clips: xc, still: xstill, mat, mesh, f: null, lane: i === 0 ? 0.75 : 0, gap: i === 0 ? 1.45 : 2.7, off: [0, 0], shown: null };
});
const JUDY_LANE = EXTRAS.length ? -0.75 : 0;
// A sideways nudge across the path to the player, eased, and only where there is floor for it.
function laneOffset(f, lane, off, dt) {
  let t = [0, 0];
  if (lane) { const dx = player.p[0] - f.p[0], dy = player.p[1] - f.p[1], d = Math.hypot(dx, dy) || 1; for (const k of [1, 0.7, 0.45]) { const q = [f.p[0] - dy / d * lane * k, f.p[1] + dx / d * lane * k]; if (walkable(plan, q, f.deck, 0.2)) { t = [q[0] - f.p[0], q[1] - f.p[1]]; break } } }
  const k = Math.min(1, dt * 3); off[0] += (t[0] - off[0]) * k; off[1] += (t[1] - off[1]) * k; return off;
}
const judyOff = [0, 0];
function extraClip(e, name) { if (e.shown === name) return; e.shown = name; const c = e.clips[name], playing = c && c.v.readyState >= 2 && !c.v.paused; e.mat.uniforms.map.value = playing ? c.tex : (name === 'walk' && e.clips.normal && e.clips.normal.v.readyState >= 2 && !e.clips.normal.v.paused) ? e.clips.normal.tex : e.still }
// a 3D companion instead of a billboard: scaled to 1.7 m; rigged models play walk and idle animations
let model = null, mixer = null, acts = {}, actNow = null, rigTick = null;
if (P.model) {
  try {
    const g = await loader.loadAsync(P.model); model = g.scene;
    // a rig with no moves of its own (Tripo): stand it up, face it forward, and give it a built-in breathe and walk
    if (P.rigged && !g.animations.length) rigTick = setupRig(model);
    model.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(model, true), h = b.max.y - b.min.y || 1, wide = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) || 1, k = Math.min(1.7 / h, 2.0 / wide);   // person-sized, even if the model is not a person
    model.scale.setScalar(k); model.position.y = -b.min.y * k;
    const holder = new THREE.Group(); holder.add(model); scene.add(holder); model = holder; judyMesh.visible = false;
    if (P.rigged && g.animations.length) {
      mixer = new THREE.AnimationMixer(holder.children[0]);
      const find = re => g.animations.find(a => re.test(a.name));
      const walkA = find(/walk|run|move/i) || g.animations[0], idleA = find(/idle|stand|breath/i) || (g.animations.find(a => a !== walkA) || null);
      acts.walk = mixer.clipAction(walkA); if (idleA) acts.idle = mixer.clipAction(idleA);
    }
  } catch { model = null }
}
function modelAnim(name) { const a = acts[name] || (name === 'idle' ? null : acts.walk); if (actNow === a) return; actNow?.fadeOut(0.25); actNow = a; a?.reset().fadeIn(0.25).play() }
let judyClip = null;
function showClip(name) {
  if (judyClip === name) return; judyClip = name;
  const c = clips[name];
  const playing = c && c.v.readyState >= 2 && !c.v.paused;
  judyMat.uniforms.map.value = playing ? c.tex : (name === 'walk' && clips.normal && clips.normal.v.readyState >= 2 && !clips.normal.v.paused) ? clips.normal.tex : still;
}

// ---------- controls ----------
const input = { mx: 0, my: 0, keys: new Set() };
let stickId = null, stickO = null, lookId = null, lookLast = null;
const knob = $('knob'), knobDot = knob.firstElementChild;
canvas.addEventListener('contextmenu', e => e.preventDefault());
// A fixed analog stick at the bottom left: up walks forward, down walks back, left and right turn.
// Touch anywhere on the left half to grab it. Dragging on the right half looks around, with only a little
// downward tilt so Judy (framed from the waist up) always looks whole.
const PITCH_DOWN = -0.2, PITCH_UP = 0.55;
const stickCentre = () => { const r = knob.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] };
addEventListener('pointerdown', e => {
  if (!started || e.target.closest('button,a,.panel,input,form,canvas#radar,.bigmap')) return;
  const left = e.clientX < innerWidth / 2;
  if (left && stickId === null) { stickId = e.pointerId; stickO = stickCentre(); knob.classList.add('on'); moveStick(e) }
  else if (!left && lookId === null) { lookId = e.pointerId; lookLast = [e.clientX, e.clientY] }
});
function moveStick(e) {
  let dx = e.clientX - stickO[0], dy = e.clientY - stickO[1]; const r = Math.hypot(dx, dy), R = 50;
  if (r > R) { dx *= R / r; dy *= R / r }
  input.mx = dx / R; input.my = -dy / R; knobDot.style.transform = `translate(${dx}px,${dy}px)`;
}
addEventListener('pointermove', e => {
  if (e.pointerId === stickId) moveStick(e);
  else if (e.pointerId === lookId) {
    const k = e.pointerType === 'mouse' ? 0.004 : 0.0055;
    player.yaw -= (e.clientX - lookLast[0]) * k; player.pitch = Math.max(PITCH_DOWN, Math.min(PITCH_UP, player.pitch - (e.clientY - lookLast[1]) * k));
    lookLast = [e.clientX, e.clientY];
  }
});
const endPointer = e => {
  if (e.pointerId === stickId) { stickId = null; input.mx = input.my = 0; knob.classList.remove('on'); knobDot.style.transform = '' }
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

// footsteps: the recorded walking sound from the hallway walk, looped. One copy follows your walking; a second copy,
// half a step out of time and a touch higher, follows hers and is placed left or right of you where she is.
let stepsBuf = null; const walkers = {};
async function loadSteps() {
  try { stepsBuf = await actx.decodeAudioData(await (await fetch('assets/ship/steps.m4a')).arrayBuffer()) } catch { return }
  for (const [id, rate, at] of [['me', 1.0, 0], ['her', 1.07, 0.31]]) {
    const src = actx.createBufferSource(), g = actx.createGain(), pan = actx.createStereoPanner ? actx.createStereoPanner() : null;
    src.buffer = stepsBuf; src.loop = true; src.playbackRate.value = rate; g.gain.value = 0;
    let n = src.connect(g); if (pan) n = n.connect(pan); n.connect(actx.destination); src.start(0, at * stepsBuf.duration);
    walkers[id] = { src, g, pan };
  }
}
// Her own walk sound (cut from the same take as her walk loop) plays in step with the video: the sound is a separate
// file looped in Web Audio (no gap at the loop), and it is re-lined up with the video whenever the two drift apart.
let herWalk = null;
async function loadHerWalk() {
  if (!P.walkSound || !clips.walk) return;
  try {
    const buf = await actx.decodeAudioData(await (await fetch(P.walkSound)).arrayBuffer());
    const g = actx.createGain(), pan = actx.createStereoPanner ? actx.createStereoPanner() : null; g.gain.value = 0;
    (pan ? g.connect(pan) : g).connect(actx.destination);
    herWalk = { buf, g, pan, src: null, t0: 0, L: 1 };
  } catch { herWalk = null }
}
function herWalkSync() {
  const h = herWalk, v = clips.walk.v; if (!h || v.readyState < 2) return;
  const L = Math.min(v.duration || h.buf.duration, h.buf.duration);
  let drift = 1;
  if (h.src) { const pos = (actx.currentTime - h.t0) % h.L; drift = Math.abs(pos - v.currentTime); drift = Math.min(drift, h.L - drift) }
  if (drift > 0.07) {
    try { h.src?.stop() } catch { }
    const s = actx.createBufferSource(); s.buffer = h.buf; s.loop = true; s.loopStart = 0; s.loopEnd = L; s.connect(h.g);
    const off = v.currentTime % L; s.start(0, off); h.src = s; h.t0 = actx.currentTime - off; h.L = L;
  }
}
function footsteps() {
  if (!walkers.me) return;
  const t = actx.currentTime, mine = Math.hypot(...player.vel);
  walkers.me.g.gain.setTargetAtTime(mine > 0.3 ? 0.55 * Math.min(1, mine / 2.2) : 0, t, mine > 0.3 ? 0.06 : 0.12);
  walkers.me.src.playbackRate.setTargetAtTime(0.85 + 0.15 * Math.min(1, mine / 2.2), t, 0.2);
  const herSp = judy.moving && judy.deck === player.deck ? Math.hypot(...judy.vel) : 0;
  const dx = judy.p[0] - player.p[0], dy = judy.p[1] - player.p[1], dist = Math.hypot(dx, dy) || 1;
  const side = (dx * Math.cos(player.yaw) + dy * Math.sin(player.yaw)) / dist;
  const her = herWalk ? herWalk : walkers.her, onWalk = herSp > 0.3 && (!herWalk || judyClip === 'walk');
  if (herWalk) { walkers.her.g.gain.setTargetAtTime(0, t, 0.05); herWalkSync() }
  her.g.gain.setTargetAtTime(onWalk ? (herWalk ? 0.9 : 0.45) / Math.max(1, dist * 0.5) : 0, t, onWalk ? 0.06 : 0.12);
  if (her.pan) her.pan.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, side * 0.85)), t, 0.1);
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
  EXTRAS.forEach((e, i) => e.f && placeFollower(e.f, [lift.x + (i ? 0 : (lift.x > player.p[0] ? -0.6 : 0.6)), lift.y + 0.9 + i * 0.4], to));
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
    if (k.has('a') || k.has('arrowleft')) mx = -1; if (k.has('d') || k.has('arrowright')) mx = 1;
    // a small dead zone, then turn speed grows with how far the stick is pushed sideways
    const turn = Math.abs(mx) < 0.12 ? 0 : Math.sign(mx) * (Math.abs(mx) - 0.12) / 0.88;
    player.yaw -= turn * Math.abs(turn) * 1.6 * dt; mx = 0;
    if (Math.abs(my) < 0.12) my = 0;
    const fx = -Math.sin(player.yaw), fy = Math.cos(player.yaw), rx = Math.cos(player.yaw), ry = Math.sin(player.yaw);
    const sp = my < 0 ? 1.4 : 2.2, vx = (fx * my + rx * mx) * sp, vy = (fy * my + ry * mx) * sp;
    let np;
    if (PLAN) np = slide(plan, player.p, vx * dt, vy * dt, player.deck);
    else {
      const q = player.p, dx = vx * dt, dy = vy * dt;
      np = !blocked(q, player.floor, dx, dy) ? [q[0] + dx, q[1] + dy] : !blocked(q, player.floor, dx, 0) ? [q[0] + dx, q[1]] : !blocked(q, player.floor, 0, dy) ? [q[0], q[1] + dy] : q;
    }
    player.vel = [(np[0] - player.p[0]) / dt, (np[1] - player.p[1]) / dt]; player.p = np;
    
    const fl = PLAN ? floorAt(plan, player.p, player.deck) : groundAt(player.p, player.floor + 1.2) ?? player.floor; player.floor += (fl - player.floor) * Math.min(1, dt * 6);
    recordTrail(judy, player.p, player.deck);
  } else player.vel = [0, 0];
  if (judy) { stepFollower(judy, plan, player, dt); if (started) footsteps() }
  for (const e of EXTRAS) {
    if (!e.f) continue; recordTrail(e.f, player.p, player.deck); stepFollower(e.f, plan, player, dt);
    const o = laneOffset(e.f, e.lane, e.off, dt), ef = PLAN ? floorAt(plan, e.f.p, e.f.deck) : (groundAt(e.f.p, player.floor + 1.2) ?? player.floor);
    e.mesh.visible = e.f.deck === player.deck; e.mesh.position.copy(V(e.f.p[0] + o[0], e.f.p[1] + o[1], e.full ? ef + FULL_H / 2 : ef + TOP - JH / 2));
    if (e.full) { const v = e.clips.walk.v; if (e.f.moving && v.paused && started) v.play().catch(() => { }); else if (!e.f.moving && !v.paused) v.pause() }
    e.mesh.rotation.set(0, Math.atan2(camera.position.x - e.mesh.position.x, camera.position.z - e.mesh.position.z), 0);
    extraClip(e, e.f.moving ? 'walk' : 'normal');
  }
  // doors: you and Judy both open them
  const before = plan.doors.map(d => d.open > 0.02);
  updateDoors(plan, [player, judy, ...EXTRAS.map(e => e.f)].filter(Boolean), dt);
  plan.doors.forEach((d, i) => { if (!before[i] && d.open > 0.02 && Math.hypot(d.x - player.p[0], d.y - player.p[1]) < 12 && d.deck === player.deck) hiss() });
  placeDoors();
  // lift buttons: "Call lift" outside a lift door, the deck panel inside the car
  const inLift = liftAt(plan, player.p, player.deck), near = !inLift && liftNear(plan, player.p, player.deck);
  if (inLift) { if (panelLift !== inLift || panel.style.display !== 'block') renderPanel(inLift); panel.style.display = 'block'; call.style.display = 'none' }
  else { panel.style.display = 'none'; panelLift = null; call.style.display = near && near.at !== player.deck ? 'block' : 'none' }
  // Judy: stand on the floor, face the camera, walk clip when she moves away from you
  if (!PLAN) { const g = groundAt(judy.p, (judy.floor ?? player.floor) + 1.2); judy.floor = g ?? judy.floor ?? player.floor }
  const jf = PLAN ? floorAt(plan, judy.p, judy.deck) : judy.floor;
  if (model) {
    model.visible = judy.deck === player.deck;
    model.position.copy(V(judy.p[0], judy.p[1], jf));
    model.rotation.y = Math.atan2(camera.position.x - model.position.x, camera.position.z - model.position.z);
    modelAnim(judy.moving ? 'walk' : 'idle'); mixer?.update(dt); rigTick?.(dt, judy.moving ? Math.hypot(...judy.vel) : 0, talking);
    // the body has no face, so while they talk, their talking clip plays in a comms window
    commsOn = talking && judy.deck === player.deck; if (commsOn) showClip(clips.talk ? 'talk' : 'normal');
  } else {
    judyMesh.visible = judy.deck === player.deck;
    const jo = laneOffset(judy, JUDY_LANE, judyOff, dt); judyMesh.position.copy(V(judy.p[0] + jo[0], judy.p[1] + jo[1], jf + TOP - JH / 2));
    judyMesh.rotation.set(0, Math.atan2(camera.position.x - judyMesh.position.x, camera.position.z - judyMesh.position.z), 0);
    const away = judy.moving && ((judy.p[0] - player.p[0]) * judy.vel[0] + (judy.p[1] - player.p[1]) * judy.vel[1]) > 0.3;
    showClip(talking && clips.talk ? 'talk' : (P.walkSound ? judy.moving : away) ? 'walk' : 'normal');
  }
  placeCamera();
  if (now - labelTimer > 300 && !riding) {
    labelTimer = now; const r = roomAt(plan, player.p, player.deck);
    if (!SHIP) $('where').textContent = WORLD_LAYOUT ? CFG.name + (r?.lift ? ' · Lift' : r?.label ? ' · ' + r.label : '') : CFG.name; else {
    const deck = DECK_OF_ROOM[r?.name] || (r?.lift ? r.lift.stops.find(s => s.deck === player.deck)?.name : null) || DECK_LABEL[player.deck];
    $('where').textContent = deck + (r && !r.lift ? ' · ' + (ROOM_NAMES[r.name] || r.name.replace(/\d|[LR]$/g, '').replace(/^stub4?/, 'Cabin hall')) : r?.lift ? ' · Turbolift' : '');
  } }
  drawRadar(); if (bigmap.style.display === 'block') drawBigMap();
  if (!NORENDER) { renderer.render(scene, camera); drawComms() }
}

// ---------- comms window: a 3D body's talking face ----------
// Rigged bodies have no moving face, so when one speaks we cut to their talking clip in a small comms window
// (keyed like the billboard) and close it when they finish. Characters without a clip show their picture there.
let commsOn = false;
if (P.hasBody) { const b = document.createElement('button'); b.className = 'chip'; b.textContent = P.model ? '🎞 Video' : '🧍 3D'; b.title = 'Switch between the 3D body and the video';
  b.onclick = () => { try { localStorage.setItem('ship-body', P.model ? 'video' : '3d') } catch { } location.reload() }; $('talkBtn').before(b) }
const hudScene = new THREE.Scene(), hudCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 2);
const hudFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), judyMat); hudFace.position.z = -1; hudScene.add(hudFace);
const commsBox = document.createElement('div'); commsBox.className = 'comms'; commsBox.innerHTML = `<b>◉ ${P.name.replace(/[<&]/g, '')}</b>`; document.body.append(commsBox);
function drawComms() {
  commsBox.style.display = commsOn ? 'block' : 'none'; if (!commsOn) return;
  const W = innerWidth, H = innerHeight, w = Math.round(Math.min(170, W * 0.36)), h = Math.round(w * 1.5), x = 12, top = 128;
  commsBox.style.cssText += `;left:${x}px;top:${top}px;width:${w}px;height:${h}px`;
  const m = judyMat.uniforms.map.value?.image, aw = m?.videoWidth || m?.width || 2, ah = m?.videoHeight || m?.height || 3, a = aw / ah, pa = w / h;
  hudFace.scale.set(a > pa ? a / pa : 1, a > pa ? 1 : pa / a, 1);
  const bg = renderer.getClearColor(new THREE.Color()), ba = renderer.getClearAlpha();
  renderer.setScissorTest(true); renderer.setViewport(x, H - top - h, w, h); renderer.setScissor(x, H - top - h, w, h);
  renderer.setClearColor(0x0d1626, 1); renderer.clear(); renderer.render(hudScene, hudCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.setClearColor(bg, ba);
}

// ---------- radar and map ----------
// A small round radar (top right) centred on you, nose of the ship up; tap it for the whole deck with your arrow.
const radar = $('radar'), rg = radar.getContext('2d'), bigmap = $('bigmap'), mapc = $('mapc'), mg = mapc.getContext('2d');
const deckRooms = () => plan.rooms.filter(r => r.deck === player.deck);
function drawPlan(g, toPx, rooms, lw) {
  for (const r of rooms) {
    g.beginPath(); r.poly.forEach((q, i) => { const [x, y] = toPx(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.closePath();
    g.fillStyle = r.lift ? 'rgba(255,197,107,.35)' : r.name === 'cabin' ? 'rgba(144,224,228,.10)' : 'rgba(144,224,228,.2)'; g.fill();
    g.lineWidth = lw; g.strokeStyle = r.lift ? 'rgba(255,197,107,.9)' : 'rgba(144,224,228,.75)'; g.stroke();
  }
}
function drawArrow(g, x, y, size) {
  const fx = -Math.sin(player.yaw), fy = Math.cos(player.yaw), a = Math.atan2(fx, fy);   // 0 = toward the nose (up)
  g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.62, size * 0.7); g.lineTo(0, size * 0.32); g.lineTo(-size * 0.62, size * 0.7); g.closePath();
  g.fillStyle = '#fff'; g.shadowColor = '#90e0e4'; g.shadowBlur = size; g.fill(); g.restore();
}
function drawDot(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#ffc56b'; g.fill() }
function drawRadar() {
  const W = radar.width, R = W / 2, range = 22, k = R / range, p = player.p;
  rg.clearRect(0, 0, W, W); rg.save(); rg.beginPath(); rg.arc(R, R, R - 2, 0, Math.PI * 2); rg.clip();
  const toPx = (x, y) => [R + (x - p[0]) * k, R - (y - p[1]) * k];
  if (!plan.open) drawPlan(rg, toPx, deckRooms(), 2);
  else { rg.strokeStyle = 'rgba(144,224,228,.25)'; for (let i = -range; i <= range; i += 5) { const [a] = toPx(Math.round(p[0] / 5) * 5 + i, 0), [, b] = toPx(0, Math.round(p[1] / 5) * 5 + i); rg.beginPath(); rg.moveTo(a, 0); rg.lineTo(a, W); rg.moveTo(0, b); rg.lineTo(W, b); rg.stroke() } }
  rg.strokeStyle = 'rgba(144,224,228,.3)'; rg.beginPath(); rg.arc(R, R, R * 0.5, 0, Math.PI * 2); rg.stroke();
  if (judy && judy.deck === player.deck) { const [jx, jy] = toPx(judy.p[0], judy.p[1]); drawDot(rg, jx, jy, 6) }
  drawArrow(rg, R, R, 13); rg.restore();
}
function drawBigMap() {
  const dpr = Math.min(devicePixelRatio || 1, 2), W = mapc.clientWidth * dpr, H = mapc.clientHeight * dpr;
  if (mapc.width !== W || mapc.height !== H) { mapc.width = W; mapc.height = H }
  mg.clearRect(0, 0, W, H);
  const rooms = plan.open ? [] : deckRooms(), pts = rooms.flatMap(r => r.poly).concat([player.p]);
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  let x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
  if (plan.open) { x0 = player.p[0] - 40; x1 = player.p[0] + 40; y0 = player.p[1] - 40; y1 = player.p[1] + 40 }
  const pad = 70 * dpr, k = Math.min((W - pad) / (x1 - x0), (H - pad * 1.6) / (y1 - y0)), cx = W / 2 - (x0 + x1) / 2 * k, cy = H / 2 + (y0 + y1) / 2 * k;
  const toPx = (x, y) => [cx + x * k, cy - y * k];
  drawPlan(mg, toPx, rooms, 1.5 * dpr);
  if (judy && judy.deck === player.deck) { const [jx, jy] = toPx(judy.p[0], judy.p[1]); drawDot(mg, jx, jy, 7 * dpr) }
  const [px, py] = toPx(player.p[0], player.p[1]); drawArrow(mg, px, py, 16 * dpr);
  $('mapTitle').textContent = SHIP ? ($('where').textContent.split(' · ')[0] || 'Deck') : CFG.name;
}
radar.addEventListener('click', () => { bigmap.style.display = 'block'; drawBigMap() });
$('mapClose').onclick = () => { bigmap.style.display = 'none' };
bigmap.addEventListener('click', e => { if (e.target === mapc) bigmap.style.display = 'none' });

// ---------- talking while walking ----------
let talking = false, talk = null, sayTimer = 0;
// Nothing pops up over the view: every line (yours, hers, and notes like "the brain is not connected")
// goes into the Log, which you open with the Log button when you want to read back.
const logLines = [], logEl = $('log'), logList = $('logList'), logBtn = $('logBtn');
function showLine(who, text) {
  logLines.push({ who, text, t: new Date() });
  if (logEl.style.display === 'block') renderLog(); else if (who === 'note') logBtn.classList.add('dot');
}
function renderLog() {
  const esc = t => String(t).replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  logList.innerHTML = logLines.length ? logLines.map(l => `<p class="${l.who}">${l.who === 'her' ? `<b>${esc(talk?.name || P.name)}</b> ` : l.who === 'you' ? '<b>You</b> ' : ''}${esc(l.text)}</p>`).join('') : '<p class="note">Nothing said yet.</p>';
  logList.scrollTop = logList.scrollHeight;
}
logBtn.onclick = () => { const open = logEl.style.display !== 'block'; logEl.style.display = open ? 'block' : 'none'; logBtn.classList.toggle('on', open); logBtn.classList.remove('dot'); if (open) renderLog() };
$('logClose').onclick = () => { logEl.style.display = 'none'; logBtn.classList.remove('on') };
const typebar = $('typebar'), typeIn = $('typeIn'), talkBtn = $('talkBtn'), typeBtn = $('typeBtn');
typeBtn.onclick = () => { const open = typebar.style.display !== 'flex'; typebar.style.display = open ? 'flex' : 'none'; typeBtn.classList.toggle('on', open); if (open) typeIn.focus() };
typebar.onsubmit = e => {
  e.preventDefault(); const t = typeIn.value; typeIn.value = '';
  // the box gets out of the way as soon as you send
  typebar.style.display = 'none'; typeBtn.classList.remove('on'); typeIn.blur();
  if (t.trim()) talk?.ask(t);
};
talkBtn.onclick = () => {
  if (!talk) return;
  if (!talk.canListen) return showLine('note', 'This browser cannot listen. Use Type instead.');
  const on = !talkBtn.classList.contains('on');
  const now = talk.setHands(on, off => { talkBtn.classList.toggle('on', off); talkBtn.classList.toggle('listen', off) });
  talkBtn.classList.toggle('on', now); talkBtn.classList.toggle('listen', now);
  showLine('note', now ? `Hands-free on. Just talk to ${talk.name}.` : 'Hands-free off.');
};
async function startTalk() {
  const sc = SHIP ? { name: CFG.name === 'Walk the ship' ? 'The starship' : CFG.name, details: 'Decks 4 to 6 of a starship: crew corridors and cabins, a mess hall, a holodeck, a science lab, and turbolifts between the decks. You are walking it together.' } : { name: CFG.name, details: 'A 3D place you are walking around together.' };
  talk = await createTalk({ sessionId: params.get('session'), partnerName: P.name, sceneName: sc.name, sceneDetails: sc.details, onSpeaking: on => { talking = on; judyClip = null }, onLine: showLine });
  if (!talk.ready) showLine('note', 'The AI brain is not connected yet, so she cannot answer here.');
}

// ---------- start ----------
player.p = [...DEFAULT_START.p]; player.yaw = DEFAULT_START.yaw;
if (!SHIP) { player.p = CFG.start.p; player.deck = 0; player.floor = CFG.start.floor; player.yaw = 0 }
if (WORLD_LAYOUT?.start) { const st = WORLD_LAYOUT.start; player.p = [...st.p]; player.deck = st.deck; player.floor = st.deck; player.yaw = st.yaw || 0 }
if (WORLD_LAYOUT) document.querySelector('.start p').textContent = `${P.name} walks with you. Doors open as you reach them. Step into a lift and choose a floor.`;
if (params.get('at')) { const [x, y, z] = params.get('at').split(',').map(Number); player.p = [x, y]; if (z) { player.deck = z; player.floor = z } }
if (params.get('yaw')) player.yaw = Number(params.get('yaw'));
judy = createFollower([player.p[0] + Math.sin(player.yaw) * 1.2, player.p[1] - Math.cos(player.yaw) * 1.2], player.deck, { gap: 1.2, near: 0.85 });
if (!walkable(plan, judy.p, judy.deck)) placeFollower(judy, player.p, player.deck);
judy.floor = player.floor;
judy.trail = [[...player.p]];
for (const e of EXTRAS) { e.f = createFollower([...judy.p], player.deck, { gap: e.gap, near: e.gap - 0.4 }); e.f.trail = [[...player.p]] }
placeDoors(); placeCamera();
requestAnimationFrame(frame);
const go = $('go'); go.disabled = false; go.textContent = 'Start walking';
go.onclick = () => {
  startTalk();
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); loadSteps(); loadHerWalk() } catch { }
  for (const c of Object.values(clips)) c.v.play().then(() => { judyClip = null }).catch(() => { });
  for (const e of EXTRAS) for (const c of Object.values(e.clips)) c.v.play().then(() => { e.shown = null }).catch(() => { });
  $('start').style.display = 'none'; started = true;
};
if (params.has('autostart')) go.onclick();
// for checks: window.ship exposes the live state
window.ship = { set talking(v) { talking = v }, plan, player, get judy() { return judy }, get party() { return EXTRAS.map(e => e.f && { p: e.f.p, off: e.off, moving: e.f.moving, visible: e.mesh.visible }) }, ride, camera, renderer, snap() { placeDoors(); placeCamera(); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', 0.85) } };
