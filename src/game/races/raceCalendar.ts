import { RACE_REWARDS } from '../../game-core/economy/balance';
import { FIRST_RIVAL } from '@/game-core/social/rivalHistory';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { pointAlong, polylineLength } from '../world/layoutTools';
import { laneWaypoints, mountainRace, OVERLOOK_S, ROUTE_LENGTH } from '../world/mountain/route';
import type { Gate, Point, RaceDefinition, Waypoint } from './Race';
import { rival } from './rivals';

type Flat = { x: number; z: number };
const box = (id: string, p: Flat): Gate => ({ id, center: { x: p.x, y: 1, z: p.z }, halfSize: { x: 6, y: 4, z: 6 } });

/**
 * Town-street pace: corner speed from the path's own curvature (a flat, wide road holds more
 * lateral g than the mountain's 3.6 m/s²), capped on the straights.
 */
function paced(points: readonly Flat[], cap: number, lateral = 4.5): Waypoint[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 2)], b = points[Math.min(points.length - 1, i + 2)];
    if (a === p || b === p) return { x: p.x, y: 0, z: p.z, speed: cap };
    const turn = Math.abs(Math.atan2(Math.sin(Math.atan2(b.x - p.x, b.z - p.z) - Math.atan2(p.x - a.x, p.z - a.z)),
      Math.cos(Math.atan2(b.x - p.x, b.z - p.z) - Math.atan2(p.x - a.x, p.z - a.z))));
    const radius = turn < 1e-4 ? Infinity : Math.hypot(b.x - a.x, b.z - a.z) / (2 * Math.sin(turn / 2));
    return { x: p.x, y: 0, z: p.z, speed: Math.min(cap, Math.sqrt(radius * lateral)) };
  });
}

/** Samples a centre line every 3 m, `offset` metres to the right of travel. */
function lane(center: readonly Flat[], from: number, to: number, offset: number): Flat[] {
  const length = polylineLength(center), out: Flat[] = [];
  for (let s = from; s <= to; s += 3) {
    const p = pointAlong(center, ((s % length) + length) % length);
    out.push({ x: p.x + p.dirZ * offset, z: p.z - p.dirX * offset });
  }
  return out;
}

const LOOP = HUB_LAYOUT.loop.map(([x, z]) => ({ x, z }));
const LOOP_LENGTH = polylineLength(LOOP);
const at = (s: number) => pointAlong(LOOP, ((s % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH);
const start = (p: Flat & { dirX: number; dirZ: number }, offset: number): Point => ({ x: p.x + p.dirZ * offset, y: 0, z: p.z - p.dirX * offset });

/**
 * Tier 1. One clockwise lap of the town block from in front of Bahandi: west on the main road,
 * up past Suki 24 and home, the long north street, down past Kyo, and back along the main road.
 */
const LOOP_START = 30;
export const KYO_BLOCK_LAP: RaceDefinition = {
  id: 'kyo_block_lap', name: 'Kyo block lap', mode: 'touge',
  start: start(at(LOOP_START), 1), heading: Math.atan2(at(LOOP_START).dirX, at(LOOP_START).dirZ),
  checkpoints: [box('Suki 24 corner', at(LOOP_START + 140)), box('Home straight', at(LOOP_START + 280)),
    box('Kyo bend', at(LOOP_START + 470)), box('Main road', at(LOOP_START + 640))],
  finish: box('Bahandi line', at(LOOP_LENGTH + LOOP_START - 20)),
  waypoints: paced(lane(LOOP, LOOP_START, LOOP_LENGTH + LOOP_START + 60, 3.5), 19),
  rival: rival({ name: 'Jun-jun', paint: '#c3b18e', build: 'donor_daily', tier: 1, prizePhp: RACE_REWARDS.kyo_block_lap }),
};

/** Tier 2. Alimodian into the vegetable terraces, finishing at the top of the climb. */
export const TERRACE_SPRINT = mountainRace({
  id: 'terrace_sprint', name: 'Terrace sprint', direction: 1, from: 200, to: ROUTE_LENGTH * .36 - 30,
  gates: [.12, .17, .27], finish: 'Top of the climb', driveAwayM: 150,
  rival: rival({ name: 'Totoy', paint: '#516353', build: 'tidy_kit', tier: 2, prizePhp: RACE_REWARDS.terrace_sprint }),
});

/** Tier 3. From Pahuway overlook down the Maasin descent. Casey's hatch loves it. */
export const PAHUWAY_DESCENT = mountainRace({
  id: 'pahuway_descent', name: 'Pahuway descent', direction: 1, from: OVERLOOK_S + 45, to: ROUTE_LENGTH - 65,
  gates: [.79, .86, .93], finish: 'Maasin arrival', driveAwayM: 40,
  rival: rival({ npcId: FIRST_RIVAL.npcId, vehicleId: FIRST_RIVAL.vehicleId, name: FIRST_RIVAL.name, paint: '#f1f0eb', build: 'casey_kidlat_rs', tier: 3, prizePhp: RACE_REWARDS.pahuway_descent }),
});

/** Tier 4. Up the red-earth wall and along the ridge, against Kent's quiet EFI swap. */
export const THE_WALL = mountainRace({
  id: 'the_wall', name: 'The wall', direction: 1, from: ROUTE_LENGTH * .17 + 40, to: ROUTE_LENGTH * .66,
  gates: [.3, .36, .44, .51, .58], finish: 'Ridge end', driveAwayM: 150,
  rival: rival({ name: 'Kent', paint: '#eeede8', build: 'kent_sleeper', tier: 4, prizePhp: RACE_REWARDS.the_wall }),
});

/**
 * Tier 5. Sean's midnight run: from Kyo down to the main road, east out of town and the whole
 * mountain to Maasin, against the turbo Evo tribute.
 */
const east = (x: number, z: number) => ({ x, z });
// Starts inside the Kyo chunk: z = 70 is the seam with the main-road chunk, where the spawn probe finds no ground.
const KYO_EXIT = [east(118, 78), east(118, 20), east(118.5, 8), east(120, 2), east(124, -1), east(132, -2), east(240, -2), east(252, -1.6)];
const mountainLane = laneWaypoints(1).filter(p => p.s > 12);
const FULL_MOUNTAIN = mountainRace({ id: 'midnight_run', name: '', direction: 1, from: 90, to: ROUTE_LENGTH - 65,
  gates: [.17, .36, .51, .66, .79], finish: 'Maasin arrival' });
export const MIDNIGHT_RUN: RaceDefinition = {
  id: 'midnight_run', name: 'Midnight run · Kyo → Maasin', mode: 'touge',
  start: { x: 118, y: 0, z: 76 }, heading: Math.PI,
  checkpoints: [box('Main road', { x: 180, z: 0 }), ...FULL_MOUNTAIN.checkpoints],
  finish: FULL_MOUNTAIN.finish,
  waypoints: [...paced([...KYO_EXIT].flatMap((p, i, all) => {
    // Densify the town leg so curvature pacing sees the corner.
    const next = all[i + 1];
    if (!next) return [p];
    const n = Math.max(1, Math.ceil(Math.hypot(next.x - p.x, next.z - p.z) / 3));
    return Array.from({ length: n }, (_, k) => ({ x: p.x + (next.x - p.x) * k / n, z: p.z + (next.z - p.z) * k / n }));
  }), 19), ...mountainLane],
  rival: rival({ name: 'Sean', paint: '#1f4f9e', build: 'sean_evo_tribute', tier: 5, prizePhp: RACE_REWARDS.midnight_run }),
};

/** Ordered easiest first; each tier's rival runs a faster build and drives it harder. */
export const RACE_CALENDAR: readonly RaceDefinition[] = [KYO_BLOCK_LAP, TERRACE_SPRINT, PAHUWAY_DESCENT, THE_WALL, MIDNIGHT_RUN];
