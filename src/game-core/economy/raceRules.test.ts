import { it, expect } from 'vitest';
import { RACE_ECONOMY } from './raceRules';
import { LOCAL_ROUTE } from '@/game/races/localRoute';
import { RACE_CALENDAR } from '@/game/races/raceCalendar';
import { MOUNTAIN_RACES } from '@/game/world/mountain/route';
import { Race } from '@/game/races/Race';
it('server race rewards/checkpoints and deterministic rival thresholds match current runtime content', () => {
  for (const route of [LOCAL_ROUTE, ...RACE_CALENDAR, ...MOUNTAIN_RACES]) {
    const rule = RACE_ECONOMY.find(race => race.id === route.id)!;
    expect(rule.checkpoints).toBe(route.checkpoints.length); expect(rule.prizePhp).toBe(route.rival?.prizePhp ?? 0);
    const race = new Race(route); race.start();
    for (let step = 0; step < 360000 && race.opponentTime === null; step++) race.update(1 / 120, route.start);
    expect(Math.ceil(race.opponentTime! * 1000)).toBe(rule.rivalTimeMs);
  }
});
