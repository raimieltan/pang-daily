import { describe, expect, it } from 'vitest';
import { LOCAL_ROUTE } from './localRoute';
import { RoadCorridor, DRIVER_SKILLS } from './AIDriver';
import { RACE_CALENDAR } from './raceCalendar';
import { rivalBuildStats } from './rivals';
import { MOUNTAIN_RACES } from '../world/mountain/route';
import { HUB_BOUNDS, HUB_LAYOUT } from '../world/hub/hubLayout';

describe('race calendar', () => {
  it('runs five races, one rival per tier, prizes rising', () => {
    expect(RACE_CALENDAR.map(r => r.rival!.tier)).toEqual([1, 2, 3, 4, 5]);
    RACE_CALENDAR.slice(1).forEach((r, i) => expect(r.rival!.prizePhp).toBeGreaterThan(RACE_CALENDAR[i].rival!.prizePhp));
  });

  it('keeps every start line apart so each prompt is unambiguous', () => {
    const all = [LOCAL_ROUTE, ...MOUNTAIN_RACES, ...RACE_CALENDAR];
    for (const a of all) for (const b of all) if (a !== b)
      expect(Math.hypot(a.start.x - b.start.x, a.start.z - b.start.z), `${a.id} vs ${b.id}`).toBeGreaterThan(24);
  });

  it('starts town races clear of chunk seams, where the grid probe finds no ground', () => {
    for (const { id, start } of [LOCAL_ROUTE, ...RACE_CALENDAR]) {
      if (start.x > HUB_BOUNDS.maxX) continue; // Mountain start.
      const chunk = HUB_LAYOUT.chunks.find(c => start.x > c.rect.minX && start.x < c.rect.maxX && start.z > c.rect.minZ && start.z < c.rect.maxZ);
      expect(chunk, `${id} sits on a seam`).toBeDefined();
      const { minX, maxX, minZ, maxZ } = chunk!.rect;
      expect(Math.min(start.x - minX, maxX - start.x, start.z - minZ, maxZ - start.z), id).toBeGreaterThan(2);
    }
  });

  for (const route of RACE_CALENDAR) it(`provides a driveable corridor for ${route.id}`, () => {
    const road = new RoadCorridor(route.waypoints);
    expect(road.cumulative.at(-1)).toBeGreaterThan(100);
    expect(road.segments.every(segment => segment.width > 3)).toBe(true);
  });

  it('separates driver skill from the car build', () => {
    expect(DRIVER_SKILLS[3].brakingSkill).toBeGreaterThan(DRIVER_SKILLS[0].brakingSkill);
    expect(rivalBuildStats('sean_evo_tribute').powerHp).toBeGreaterThan(rivalBuildStats('donor_daily').powerHp);
  });
});
