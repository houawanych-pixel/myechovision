import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan, walkable, slide, updateDoors, liftAt, liftNear, liftDoor, createFollower, recordTrail, stepFollower, placeFollower, floorAt } from '../app/ship-core.mjs';

const layout = JSON.parse(readFileSync(new URL('../app/assets/ship/layout.json', import.meta.url)));
const fresh = () => buildPlan(layout);

test('plan covers decks 4, 5 and 6 with cabins and lifts', () => {
  const plan = fresh();
  assert.ok(plan.rooms.some(r => r.name === 'messhall' && r.deck === 36));
  assert.ok(plan.rooms.some(r => r.name === 'holodeck' && r.deck === 31));
  assert.equal(plan.rooms.filter(r => r.name === 'cabin' && r.deck === 36).length, 18);
  assert.equal(plan.rooms.filter(r => r.name === 'cabin' && r.deck === 42).length, 16);
  const mid = plan.lifts.find(l => l.label.startsWith('lift_m'));
  assert.deepEqual(mid.stops.map(s => s.name), ['Deck 4', 'Deck 5', 'Deck 6']);
  const fwd = plan.lifts.find(l => l.label.startsWith('lift_f'));
  assert.deepEqual(fwd.stops.map(s => s.name), ['Deck 3', 'Deck 5']);
});

test('every door on the walk has floor on both sides, except the engineering gallery', () => {
  const plan = fresh();
  const broken = plan.doors.filter(d => !d.works).map(d => [d.x, d.y, d.deck]);
  assert.deepEqual(broken, [[0, -35.85, 36]]);
});

test('walls block, open doors let you through, shut doors do not', () => {
  const plan = fresh();
  assert.ok(walkable(plan, [0, 80], 36));                 // corridor
  assert.ok(!walkable(plan, [8, 95], 36));                // beside the narrow neck: solid
  const d = plan.doors.find(x => x.x === 14.65 && x.y === 71.5 && x.deck === 36);   // corridor -> stub
  const through = (open) => { d.open = open; let p = [13.6, 71.5]; for (let i = 0; i < 20; i++) p = slide(plan, p, 0.15, 0, 36); return p[0] };
  assert.ok(through(0) < 14.5, 'shut door stops you');
  assert.ok(through(1) > 15.2, 'open door lets you into the stub');
});

test('doors open when someone comes near and close after', () => {
  const plan = fresh();
  const d = plan.doors.find(x => x.x === 0 && x.y === 91.55);
  updateDoors(plan, [{ p: [0, 90.5], deck: 36 }], 1);
  assert.equal(d.open, 1);
  updateDoors(plan, [{ p: [0, 80], deck: 36 }], 1);
  assert.equal(d.open, 0);
});

test('lift doors open only where the car is', () => {
  const plan = fresh();
  const mid = plan.lifts.find(l => l.label.startsWith('lift_m'));
  mid.at = 36;
  const d5 = liftDoor(plan, mid, 36), d6 = liftDoor(plan, mid, 31);
  updateDoors(plan, [{ p: [1.5, 87.1], deck: 36 }, { p: [1.5, 87.1], deck: 31 }], 1);
  assert.equal(d5.open, 1); assert.equal(d6.open, 0);
  assert.equal(liftNear(plan, [1.5, 87.1], 31), mid);
  assert.equal(liftAt(plan, [4.1, 87.1], 36), mid);
  assert.ok(!walkable(plan, [4.1, 87.1], 31), 'no car on deck 6, no floor in the shaft');
  assert.equal(floorAt(plan, [0, 20], 31), 28.7, 'the holodeck floor is sunk below deck 6');
});

test('the companion follows the path behind you and keeps her distance', () => {
  const plan = fresh();
  const f = createFollower([0, 76], 36);
  const player = { p: [0, 79], deck: 36, vel: [0, 0] };
  // walk 25 m down the corridor toward the stern
  for (let t = 0; t < 12.5; t += 1 / 30) {
    player.vel = [0, -2]; player.p = slide(plan, player.p, 0, -2 / 30, 36);
    recordTrail(f, player.p, 36); stepFollower(f, plan, player, 1 / 30);
  }
  // she was in front (toward the stern) at the start, so she must have moved aside and now trails behind
  player.vel = [0, 0];
  for (let t = 0; t < 4; t += 1 / 30) stepFollower(f, plan, player, 1 / 30);
  const d = Math.hypot(f.p[0] - player.p[0], f.p[1] - player.p[1]);
  assert.ok(d > 1.1 && d < 2.2, 'stands close, upper-body distance, got ' + d.toFixed(2));
  assert.ok(f.p[1] > player.p[1], 'behind you');
  assert.ok(walkable(plan, f.p, 36, 0.2), 'never inside a wall');
});

test('walking at her makes her circle around you at the same distance', () => {
  const plan = fresh();
  const f = createFollower([0, 60], 36), player = { p: [0, 64], deck: 36, vel: [0, -2] };
  placeFollower(f, [0, 62.6], 36);
  let minD = Infinity;
  for (let t = 0; t < 2; t += 1 / 30) {
    player.p = slide(plan, player.p, 0, -2 / 30, 36); recordTrail(f, player.p, 36); stepFollower(f, plan, player, 1 / 30);
    minD = Math.min(minD, Math.hypot(f.p[0] - player.p[0], f.p[1] - player.p[1]));
  }
  assert.ok(minD > 0.85, 'kept clear of you, closest ' + minD.toFixed(2));
  assert.ok(f.p[1] > player.p[1] - 0.5, 'she went around you rather than being pushed ahead');
});

test('a world layout (from a .glb) gets named lift stops, its own start floor and working doors', () => {
  const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const lay = {
    decks: [4, 0], liftStart: 0,
    rooms: [
      { n: 'hall', p: rect(-1.2, 1.2, 0.3, 9.7), z: 0, h: 3, label: 'Hall' },
      { n: 'lift_A', p: rect(-1.4, 1.4, 10.3, 12.7), z: 0, h: 3, label: 'Dock' },
      { n: 'lift_A', p: rect(-1.4, 1.4, 10.3, 12.7), z: 4, h: 3, label: 'Bridge' },
      { n: 'bridge', p: rect(-5, 5, 13.3, 20), z: 4, h: 4, label: 'Bridge' },
    ],
    doors: [{ x: 0, y: 10, z: 0, w: 2.4 }, { x: 0, y: 13, z: 4, w: 2.4 }],
  };
  const plan = buildPlan(lay, lay.decks);
  assert.equal(plan.lifts.length, 1);
  const L = plan.lifts[0];
  assert.deepEqual(L.stops.map(s => s.name), ['Bridge', 'Dock']);
  assert.equal(L.at, 0);
  assert.equal(plan.rooms[0].label, 'Hall');
  const d0 = liftDoor(plan, L, 0), d4 = liftDoor(plan, L, 4);
  assert.ok(d0.works && d4.works);
  // shut door blocks, open door lets you through
  assert.equal(walkable(plan, [0, 10], 0), false);
  updateDoors(plan, [{ p: [0, 9], deck: 0 }], 2);
  assert.equal(walkable(plan, [0, 10], 0), true);
  // the bridge-side door stays shut while the car is down at the dock
  updateDoors(plan, [{ p: [0, 14], deck: 4 }], 2);
  assert.ok(d4.open < 0.01);
});
