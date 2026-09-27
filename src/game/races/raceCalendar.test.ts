import { describe, expect, it } from 'vitest';
import { LOCAL_ROUTE } from './localRoute';
import { Race } from './Race';
import { RACE_CALENDAR } from './raceCalendar';
import { rivalTuning } from './rivals';
import { MOUNTAIN_RACES } from '../world/mountain/route';
import { HUB_BOUNDS, HUB_LAYOUT } from '../world/hub/hubLayout';

function rivalRun(route: (typeof RACE_CALENDAR)[number]) {
  const race = new Race(route); race.start(); race.update(3, route.start);
  for (let t = 0; t < 900 && !race.opponent.finished; t += 1 / 30) race.update(1 / 30, route.start);
  return race;
}

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

  for (const route of RACE_CALENDAR) it(`rival clears every gate in order in ${route.id}`, () => {
    const race = rivalRun(route);
    expect(race.opponent.finished).toBe(true);
    expect(race.opponentTime).toBeGreaterThan(20);
  });

  it('makes the same car faster in a higher tier and a built car faster than a donor', () => {
    const [t1, t5] = [rivalTuning('kent_sleeper', 1), rivalTuning('kent_sleeper', 5)];
    expect(t5.speedScale).toBeGreaterThan(t1.speedScale);
    expect(t5.braking).toBeGreaterThan(t1.braking);
    expect(rivalTuning('sean_evo_tribute', 3).acceleration).toBeGreaterThan(rivalTuning('donor_daily', 3).acceleration);
  });
});
