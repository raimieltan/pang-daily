import { expect, it } from 'vitest';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { MOUNTAIN_LAMPS } from '../world/mountain/environment';
import { roadAt, ROUTE_LENGTH } from '../world/mountain/route';
import { pointAlong, polylineLength } from '../world/layoutTools';

it('provides streetlight coverage along the town loop and the mountain road', () => {
  const hub = HUB_LAYOUT.chunks.flatMap(c => c.lamps).filter(l => l.profile === 'sodium');
  const mountain = MOUNTAIN_LAMPS.filter(l => l.profile === 'sodium');
  const loop = HUB_LAYOUT.loop.map(([x, z]) => ({ x, z }));
  const nearest = (p: { x: number; z: number }, lamps: typeof hub) =>
    Math.min(...lamps.map(l => Math.hypot(l.at[0] - p.x, l.at[2] - p.z)));
  for (let s = 0; s < polylineLength(loop); s += 5)
    expect(nearest(pointAlong(loop, s), hub), `hub at ${s}m`).toBeLessThan(22);
  for (let s = 0; s < ROUTE_LENGTH; s += 10)
    expect(nearest(roadAt(s), mountain), `mountain at ${s}m`).toBeLessThan(22);
});
