import { it, expect } from 'vitest';
import { RACE_ECONOMY, raceOutcome } from './raceRules';
import { LOCAL_ROUTE } from '@/game/races/localRoute';
import { RACE_CALENDAR } from '@/game/races/raceCalendar';
import { MOUNTAIN_RACES } from '@/game/world/mountain/route';
it('server race rewards/checkpoints and payout benchmarks cover current runtime content', () => {
  for (const route of [LOCAL_ROUTE, ...RACE_CALENDAR, ...MOUNTAIN_RACES]) {
    const rule = RACE_ECONOMY.find(race => race.id === route.id)!;
    expect(rule.checkpoints).toBe(route.checkpoints.length); expect(rule.prizePhp).toBe(route.rival?.prizePhp ?? 0);
    // The opponent now drives a physical car and has no deterministic finish time.
    // This is a separate server payout benchmark, not a predicted rival result.
    expect(rule.rivalTimeMs).toBeGreaterThan(rule.minimumTimeMs);
  }
});

it('settles a physical race by finish order and keeps legacy attempts compatible', () => {
  expect(raceOutcome(true, 22000, null, 19000)).toBe('win');
  expect(raceOutcome(true, 22000, 21000, 19000)).toBe('loss');
  expect(raceOutcome(true, 18000, undefined, 19000)).toBe('win');
  expect(raceOutcome(false, 18000, null, 19000)).toBe('dnf');
});
