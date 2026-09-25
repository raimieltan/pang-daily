import type { Waypoint } from '../races/Race';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { pointAlong, polylineLength } from '../world/layoutTools';
import { laneWaypoints } from '../world/mountain/route';

// Follow the rounded town streets on their right-hand side.
function townLane(reverse: boolean): Waypoint[] {
  const center = HUB_LAYOUT.loop.map(([x, z]) => ({ x, z }));
  if (reverse) center.reverse();
  const length = polylineLength(center), points: Waypoint[] = [];
  for (let s = 0; s < length; s += 3) {
    const p = pointAlong(center, s);
    points.push({ x: p.x + p.dirZ * 2, y: 0, z: p.z - p.dirX * 2, speed: 9 });
  }
  points.push({ ...points[0] });
  return points;
}
const clockwise = townLane(false);
const uphill = laneWaypoints(1);
// Leave the main road at the west bend, circle town, and merge eastbound.
// At the east junction continue straight south to the main road before turning east.
const townReturn = clockwise.filter(p => p.z > 8 || p.x < 0);
const junction: Waypoint[] = [
  { x: 118, y: 0, z: 8, speed: 6 },
  { x: 119, y: 0, z: 3, speed: 6 },
  { x: 122, y: 0, z: -1, speed: 6 },
  { x: 127, y: 0, z: -2, speed: 8 },
  { x: 210, y: 0, z: -2, speed: 12 },
];
export const TRAFFIC_LANES: readonly (readonly Waypoint[])[] = [
  uphill,
  [...laneWaypoints(-1), { x: 0, y: 0, z: 2, speed: 9 }, ...townReturn, ...junction, ...uphill],
  clockwise,
  townLane(true),
];
