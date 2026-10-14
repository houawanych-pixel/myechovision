// Walk-the-ship logic with no graphics: which floor is walkable, where the doors are, how the lifts run and how
// the companion follows. Everything here is in the ship's own plan coordinates (metres): x = across, y = toward
// the nose, z = height. The page (ship.mjs) turns these into 3D positions.

export const RADIUS = 0.3;           // how close the walker may get to a wall
export const EYE = 1.65;             // eye height above the floor

const DECK_NAMES = { 31: 'Deck 6', 36: 'Deck 5', 42: 'Deck 4' };

export function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function edgeDist(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(p, poly[j], poly[i]));
  return d;
}
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// Builds the walkable plan from the layout exported with the ship (assets/ship/layout.json).
// decks: the deck heights the walk covers. A room belongs to a deck when its floor is at, or a little below, the deck.
export function buildPlan(layout, decks = [31, 36, 42]) {
  const rooms = [];
  for (const r of layout.rooms) {
    const deck = decks.find(d => r.z > d - 2.5 && r.z <= d + 0.6);
    if (deck === undefined) continue;
    rooms.push({ name: r.n, poly: r.p, floor: r.z, deck, h: r.h });
  }
  // crew cabins (14.4 x 7.6 m) are separate models placed at these centres, mirrored to both sides
  for (const [z, list] of layout.cabins) {
    if (!decks.includes(z)) continue;
    for (const [x, y] of list) for (const s of [1, -1])
      rooms.push({ name: 'cabin', poly: rect(s * x - 7.0, s * x + 7.0, y - 3.6, y + 3.6), floor: z, deck: z, h: 3.4 });
  }
  // lifts: one shaft per footprint, with a stop on each deck that has a lift room there
  const lifts = [];
  for (const r of rooms) {
    if (!/^lift_/.test(r.name)) continue;
    const cx = r.poly.reduce((a, p) => a + p[0], 0) / r.poly.length, cy = r.poly.reduce((a, p) => a + p[1], 0) / r.poly.length;
    let L = lifts.find(l => Math.hypot(l.x - cx, l.y - cy) < 0.5);
    if (!L) { L = { id: 'lift' + lifts.length, x: cx, y: cy, poly: r.poly, stops: [], at: null, moving: false, label: r.name }; lifts.push(L) }
    const num = (r.name.match(/\d/) || ['?'])[0];
    L.stops.push({ deck: r.deck, name: 'Deck ' + num });
    r.lift = L;
  }
  for (const L of lifts) { L.stops.sort((a, b) => b.deck - a.deck); L.at = L.stops.find(s => s.deck === 36)?.deck ?? L.stops[0].deck }
  // doors: oriented along the nearest wall; a door only works when there is floor on both sides of it
  const doors = [];
  for (const d of layout.doors) {
    const deck = decks.find(z => Math.abs(d.z - z) < 0.6);
    if (deck === undefined) continue;
    const p = [d.x, d.y];
    let best = null, bd = Infinity;
    for (const r of rooms) {
      if (r.deck !== deck) continue;
      const poly = r.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const dd = segDist(p, poly[j], poly[i]);
        if (dd < bd) { bd = dd; best = [poly[j], poly[i]] }
      }
    }
    if (!best) continue;
    let ux = best[1][0] - best[0][0], uy = best[1][1] - best[0][1];
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    // snap to the main axes: every wall a door sits in runs along x or y
    if (Math.abs(ux) > Math.abs(uy)) { ux = 1; uy = 0 } else { ux = 0; uy = 1 }
    const nx = -uy, ny = ux;
    const a = [d.x + nx * 0.7, d.y + ny * 0.7], b = [d.x - nx * 0.7, d.y - ny * 0.7];
    const ra = rooms.find(r => r.deck === deck && inside(a, r.poly)), rb = rooms.find(r => r.deck === deck && inside(b, r.poly));
    const lift = ra?.lift || rb?.lift || null;
    doors.push({ x: d.x, y: d.y, deck, w: d.w, leaf: d.leaf, u: [ux, uy], n: [nx, ny], works: !!(ra && rb), cabin: !d.leaf || ra?.name === 'cabin' || rb?.name === 'cabin', lift, open: 0 });
  }
  return { rooms, doors, lifts, decks };
}

export const deckName = (plan, deck, lift) => lift?.stops.find(s => s.deck === deck)?.name || DECK_NAMES[deck] || 'Deck';

// The room under a point on a deck (the most specific one: smallest area first)
export function roomAt(plan, p, deck) {
  let hit = null;
  for (const r of plan.rooms) if (r.deck === deck && inside(p, r.poly)) { if (!hit || area(r.poly) < area(hit.poly)) hit = r }
  return hit;
}
const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0)) / 2;

// The doorway gap around a door: a box across the wall that is free to walk through while the door is open.
function inDoorway(p, d, r = RADIUS) {
  const dx = p[0] - d.x, dy = p[1] - d.y;
  const along = Math.abs(dx * d.u[0] + dy * d.u[1]), across = Math.abs(dx * d.n[0] + dy * d.n[1]);
  return along <= d.w / 2 - r * 0.6 && across <= 0.9;
}

// Can a body of radius r stand at p on this deck? Inside a room (clear of its walls) or in an open doorway.
// A lift room counts only while its car is on this deck.
export function walkable(plan, p, deck, r = RADIUS) {
  for (const d of plan.doors) if (d.deck === deck && d.works && d.open > 0.75 && inDoorway(p, d, r)) return true;
  for (const room of plan.rooms) {
    if (room.deck !== deck || !inside(p, room.poly)) continue;
    if (room.lift && room.lift.at !== deck) continue;
    if (edgeDist(p, room.poly) >= r) return true;
    // near a wall: fine if the wall there is an open doorway into the next room
    for (const d of plan.doors) if (d.deck === deck && d.works && d.open > 0.75 && inDoorway(p, d, 0)) return true;
  }
  return false;
}

// Moves from p by (dx,dy), sliding along walls instead of stopping dead.
export function slide(plan, p, dx, dy, deck, r = RADIUS) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.15));
  let x = p[0], y = p[1];
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    if (walkable(plan, [x + sx, y + sy], deck, r)) { x += sx; y += sy }
    else if (walkable(plan, [x + sx, y], deck, r)) x += sx;
    else if (walkable(plan, [x, y + sy], deck, r)) y += sy;
  }
  return [x, y];
}

// Floor height under p (the holodeck sits lower than its deck, for example).
export function floorAt(plan, p, deck) { return roomAt(plan, p, deck)?.floor ?? deck }

// Doors open when someone is near and close behind them. Lift doors open only while the car is on that deck
// and not moving. Returns nothing; updates door.open (0 shut .. 1 open) by dt.
export function updateDoors(plan, people, dt) {
  for (const d of plan.doors) {
    let want = false;
    if (d.works) for (const q of people) if (q.deck === d.deck && Math.hypot(q.p[0] - d.x, q.p[1] - d.y) < 2.6) want = true;
    if (d.lift && (d.lift.at !== d.deck || d.lift.moving || d.lift.hold)) want = false;
    if (d.lift && d.lift.forceOpen === d.deck && !d.lift.moving) want = true;
    d.open = Math.max(0, Math.min(1, d.open + (want ? 1 : -1) * dt / 0.7));
  }
}

export const liftDoor = (plan, lift, deck) => plan.doors.find(d => d.lift === lift && d.deck === deck);
export const liftAt = (plan, p, deck) => plan.rooms.find(r => r.lift && r.deck === deck && inside(p, r.poly))?.lift || null;
// The lift whose door you are standing near (to call it).
export function liftNear(plan, p, deck, reach = 3.0) {
  let best = null, bd = reach;
  for (const d of plan.doors) if (d.lift && d.deck === deck) { const dd = Math.hypot(p[0] - d.x, p[1] - d.y); if (dd < bd) { bd = dd; best = d.lift } }
  return best;
}

// ---------- the companion ----------
// She walks the player's own path (a breadcrumb trail), so she goes through doors and around corners the same way.
// She keeps about `gap` metres of path behind the player. If the player walks at her, she steps aside.
export function createFollower(start, deck, { gap = 3.2, speed = 2.6 } = {}) {
  return { p: [...start], deck, trail: [[...start]], gap, speed, dodge: null, moving: false, vel: [0, 0] };
}
export function recordTrail(f, playerP, playerDeck) {
  if (playerDeck !== f.deck) return;
  const last = f.trail[f.trail.length - 1];
  if (!last || Math.hypot(playerP[0] - last[0], playerP[1] - last[1]) > 0.3) f.trail.push([...playerP]);
  if (f.trail.length > 400) f.trail.splice(0, f.trail.length - 400);
}
// Length of the path from her, through the footsteps still ahead of her, to the player.
export function pathLength(f, playerP) {
  let L = 0, prev = f.p;
  for (const q of f.trail) { L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q }
  return L + Math.hypot(playerP[0] - prev[0], playerP[1] - prev[1]);
}
// One step of her behaviour. player: {p, deck, vel:[vx,vy]}. Returns nothing; updates f.
export function stepFollower(f, plan, player, dt) {
  f.moving = false; f.vel = [0, 0];
  if (player.deck !== f.deck) return;
  const toMe = [f.p[0] - player.p[0], f.p[1] - player.p[1]], dist = Math.hypot(...toMe) || 1e-6;
  const pv = Math.hypot(...player.vel);
  // the player is coming straight at her: pick a side that has floor and step out of the way
  if (!f.dodge && dist < 1.9 && pv > 0.4 && (player.vel[0] * toMe[0] + player.vel[1] * toMe[1]) / (pv * dist) > 0.55) {
    const side = [-player.vel[1] / pv, player.vel[0] / pv];
    // sideways first (the side she is already leaning to), backing away only when the hall is too narrow
    const lean = Math.sign(toMe[0] * side[0] + toMe[1] * side[1]) || 1;
    const opts = [lean, -lean].flatMap(s => [1.6, 1.1].map(k => [f.p[0] + side[0] * s * k, f.p[1] + side[1] * s * k]))
      .concat([[f.p[0] + player.vel[0] / pv * 2.5, f.p[1] + player.vel[1] / pv * 2.5]])
      .filter(q => walkable(plan, q, f.deck, RADIUS) && walkable(plan, [(q[0] + f.p[0]) / 2, (q[1] + f.p[1]) / 2], f.deck, RADIUS));
    if (opts.length) f.dodge = { to: opts[0], t: 1.4 };
  }
  let target, ahead;
  if (f.dodge) { target = f.dodge.to; ahead = Math.hypot(target[0] - f.p[0], target[1] - f.p[1]); f.dodge.t -= dt; if (f.dodge.t <= 0) { f.dodge = null; f.trail = [[...player.p]] } }
  else {
    // the trail is a queue of the player's footsteps she has not reached yet
    while (f.trail.length > 1 && Math.hypot(f.trail[0][0] - f.p[0], f.trail[0][1] - f.p[1]) < 0.35) f.trail.shift();
    // if the player doubled back past her, skip the loop: jump to the newest footstep right beside her
    for (let i = f.trail.length - 1; i > 0; i--) if (Math.hypot(f.trail[i][0] - f.p[0], f.trail[i][1] - f.p[1]) < 0.8) { f.trail.splice(0, i); break }
    const left = pathLength(f, player.p);
    // she stops once the path left to the player is no longer than the gap
    if (left <= f.gap) return;
    target = f.trail[0] || player.p;
    ahead = left - f.gap;
  }
  const dx = target[0] - f.p[0], dy = target[1] - f.p[1], d = Math.hypot(dx, dy);
  if (d < 0.02) { if (!f.dodge && f.trail.length > 1) f.trail.shift(); return }
  // faster when she has fallen behind, slower as she arrives
  const sp = f.dodge ? f.speed * 1.2 : Math.min(f.speed * (dist > f.gap + 3 ? 1.4 : 1), 0.5 + ahead * 2.5);
  const np = slide(plan, f.p, dx / d * sp * dt, dy / d * sp * dt, f.deck, 0.22);
  f.vel = [(np[0] - f.p[0]) / dt, (np[1] - f.p[1]) / dt];
  f.moving = Math.hypot(...f.vel) > 0.25;
  f.p = np;
}
// After a lift ride or a jump she stands just behind the player, with a fresh trail.
export function placeFollower(f, p, deck) { f.p = [...p]; f.deck = deck; f.trail = [[...p]]; f.dodge = null }
