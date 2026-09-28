import { expect, it } from 'vitest';
import type { Waypoint } from './Race';
import { buildRacingLine, lineTime, type CarLimits } from './racingLine';

const limits: CarLimits = {
  lateral: 6, brake: 7, accel: 4, topSpeed: 50,
  drag: .001, rolling: .15, engineBraking: .3,
  lockAccel: 7, minSteer: .1, maxSteer: .6, wheelbase: 2.5,
};

function rightBend(): Waypoint[] {
  const points: Waypoint[] = [];
  const add = (x: number, z: number) => points.push({ x, y: 0, z, width: 10, roadOffset: 1.5, speed: 30 });
  for (let z = -60; z < 0; z += 3) add(0, z);
  for (let i = 0; i <= 24; i++) {
    const angle = i / 24 * Math.PI / 2;
    add(50 * (1 - Math.cos(angle)), 50 * Math.sin(angle));
  }
  for (let x = 53; x < 120; x += 3) add(x, 50);
  return points;
}

it('uses the outside of a bend exit when it makes the full-road line faster', () => {
  const route = rightBend();
  const full = buildRacingLine(route, limits, { margin: 1.3 });
  const lane = buildRacingLine(route, limits, { margin: 1.3, keepLane: true });
  const offset = (index: number) => full[index].roadOffset! - route[index].roadOffset!;

  expect(Math.max(...Array.from({ length: 12 }, (_, i) => offset(i + 25)))).toBeGreaterThan(1.5);
  expect(Math.min(...Array.from({ length: 16 }, (_, i) => offset(i + 45)))).toBeLessThan(-1.5);
  expect(lineTime(full)).toBeLessThan(lineTime(lane) - .03);
});
