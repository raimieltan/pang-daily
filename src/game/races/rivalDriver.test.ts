import { expect, it } from 'vitest';
import { MIDNIGHT_RUN, TERRACE_SPRINT } from './raceCalendar';
import { buildRacingLine, lineTime } from './racingLine';
import { rivalCar, rivalLine, TIER_PACE } from './rivalDriver';
import { MOUNTAIN_ROAD_WIDTH } from '../world/mountain/route';

it('Sean gains time from a full-road line', () => {
  const route = MIDNIGHT_RUN;
  const { config } = rivalCar(route);
  const { points: planned, limits } = rivalLine(route, config);
  const laneOnly = buildRacingLine(route.waypoints, limits, {
    level: TIER_PACE[route.rival!.tier], keepLane: true, margin: 1.8,
  });
  expect(lineTime(planned)).toBeLessThan(lineTime(laneOnly) - .4);
});

it.each([TERRACE_SPRINT, MIDNIGHT_RUN])('$id can use both sides of mountain pavement', route => {
  const { config } = rivalCar(route);
    const mountain = rivalLine(route, config).points.filter(point => point.width === MOUNTAIN_ROAD_WIDTH);
  expect(Math.min(...mountain.map(point => point.roadOffset!))).toBeLessThan(-1);
  expect(Math.max(...mountain.map(point => point.roadOffset!))).toBeGreaterThan(1);
});
