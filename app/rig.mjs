// Rigged characters (Tripo and similar 78-bone rigs) arrive in a T-pose with no animations.
// This gives them a standing pose, faces them the right way, and moves them with a small built-in
// breathe-and-walk until the shared move set exists. Bone names are matched loosely (L_Upperarm, l_upperarm…).
import * as THREE from 'three';

const v = () => new THREE.Vector3(), q = () => new THREE.Quaternion();

// Turn `bone` so the direction from it to `child` points along `target` (world space).
function aim(bone, child, target) {
  bone.updateWorldMatrix(true, false);
  const dir = child.getWorldPosition(v()).sub(bone.getWorldPosition(v())).normalize();
  const turn = q().setFromUnitVectors(dir, target.clone().normalize()), bw = bone.getWorldQuaternion(q()), pw = bone.parent.getWorldQuaternion(q());
  bone.quaternion.copy(pw.invert().multiply(turn).multiply(bw)); bone.updateWorldMatrix(false, true);
}

// Call once on the loaded scene (before scaling). Returns null if this is not a humanoid rig.
export function setupRig(root, { gentle = false } = {}) {
  // gentle: long capes, skirts and heels are weighted to the legs, so the stride stays short and the knees barely bend
  const LEG = gentle ? 0.38 : 1, KNEE = gentle ? 0.25 : 1, ARM = gentle ? 0.5 : 1;
  const B = {}; root.traverse(b => { if (b.isBone) B[b.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = b });
  const get = (...names) => names.map(n => B[n]).find(Boolean);
  const L = get('lupperarm', 'leftarm', 'upperarml'), R = get('rupperarm', 'rightarm', 'upperarmr');
  if (!L || !R) return null;
  root.updateMatrixWorld(true);
  // Face the camera: with the character facing +Z, its left shoulder sits at +X.
  const across = L.getWorldPosition(v()).sub(R.getWorldPosition(v())); across.y = 0;
  root.rotation.y += Math.atan2(across.z, across.x); root.updateMatrixWorld(true);
  const side = new THREE.Vector3(1, 0, 0), front = new THREE.Vector3(0, 0, 1), down = new THREE.Vector3(0, -1, 0);
  // Arms down at the sides, a little out and forward, hands relaxed.
  for (const [up, fore, hand, s] of [[L, get('lforearm', 'leftforearm'), get('lhand', 'lefthand'), 1], [R, get('rforearm', 'rightforearm'), get('rhand', 'righthand'), -1]]) {
    if (!fore) continue;
    aim(up, fore, down.clone().addScaledVector(side, s * 0.18).addScaledVector(front, 0.05));
    if (hand) aim(fore, hand, down.clone().addScaledVector(side, s * 0.11).addScaledVector(front, 0.25));
  }
  // Remember each moving bone's rest pose and the world side axis in its own space, so swings are easy.
  const parts = {};
  for (const [k, names] of Object.entries({ lthigh: ['lthigh', 'leftupleg'], rthigh: ['rthigh', 'rightupleg'], lcalf: ['lcalf', 'leftleg'], rcalf: ['rcalf', 'rightleg'], spine: ['spine02', 'spine1', 'spine'], neck: ['head'], lup: ['lupperarm', 'leftarm'], rup: ['rupperarm', 'rightarm'], hip: ['hip', 'hips', 'pelvis'] })) {
    const b = get(...names); if (!b) continue;
    const inv = b.getWorldQuaternion(q()).invert();
    parts[k] = { b, rest: b.quaternion.clone(), sideAxis: side.clone().applyQuaternion(inv).normalize(), frontAxis: front.clone().applyQuaternion(inv).normalize(), upAxis: new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize(), pos: b.position.clone() };
  }
  let phase = 0, t = 0, walkMix = 0;
  const turnOf = (p, axis, a) => p.b.quaternion.copy(p.rest).multiply(q().setFromAxisAngle(p[axis], a));
  // speed in metres a second; talking adds a little life to the head and chest.
  return function tick(dt, speed = 0, talking = false) {
    t += dt; walkMix += ((speed > 0.15 ? 1 : 0) - walkMix) * Math.min(1, dt * 6);
    phase += dt * Math.min(speed, 2.2) * 4.2;
    const s = Math.sin(phase), w = walkMix, br = Math.sin(t * 1.9);
    const P = parts;
    if (P.lthigh) turnOf(P.lthigh, 'sideAxis', -s * 0.42 * LEG * w);
    if (P.rthigh) turnOf(P.rthigh, 'sideAxis', s * 0.42 * LEG * w);
    if (P.lcalf) turnOf(P.lcalf, 'sideAxis', Math.max(0, s) * 0.65 * KNEE * w);
    if (P.rcalf) turnOf(P.rcalf, 'sideAxis', Math.max(0, -s) * 0.65 * KNEE * w);
    if (P.lup) turnOf(P.lup, 'sideAxis', s * 0.32 * ARM * w + br * 0.015);
    if (P.rup) turnOf(P.rup, 'sideAxis', -s * 0.32 * ARM * w - br * 0.015);
    if (P.spine) turnOf(P.spine, 'sideAxis', -br * 0.018 * (1 - w) - 0.03 * w);
    if (P.neck) P.neck.b.quaternion.copy(P.neck.rest).multiply(q().setFromAxisAngle(P.neck.upAxis, Math.sin(t * 0.37) * 0.06 + (talking ? Math.sin(t * 2.3) * 0.05 : 0))).multiply(q().setFromAxisAngle(P.neck.sideAxis, talking ? Math.sin(t * 3.1) * 0.04 : 0));
    if (P.hip) { P.hip.b.quaternion.copy(P.hip.rest).multiply(q().setFromAxisAngle(P.hip.upAxis, s * 0.08 * w + Math.sin(t * 0.5) * 0.02 * (1 - w))) }
  };
}
