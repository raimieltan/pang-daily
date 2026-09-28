import { describe, expect, it } from 'vitest';
import { Race } from './Race';
import { LOCAL_ROUTE } from './localRoute';

const gates = [...LOCAL_ROUTE.checkpoints, LOCAL_ROUTE.finish];
const start = LOCAL_ROUTE.start;

describe('race timing with externally simulated rival', () => {
  it('validates the rival through the same ordered swept gates as the player', () => {
    const race = new Race(LOCAL_ROUTE);
    race.start(); race.update(3, start, LOCAL_ROUTE.waypoints[0]);
    race.update(.1, start, { x: 120, y: 0, z: 100 });
    expect(race.opponent.next).toBe(0);
    race.reset(); race.start(); race.update(3, start, LOCAL_ROUTE.waypoints[0]);
    for (const gate of gates) race.update(.1, start, gate.center);
    expect(race.opponent.finished).toBe(true);
    expect(race.opponentTime).not.toBeNull();
    expect(race.position).toBe(2);
  });

  it('freezes results after the player finishes while accepting measured rival motion', () => {
    const race = new Race(LOCAL_ROUTE);
    race.start(); race.update(3, start, LOCAL_ROUTE.waypoints[0]);
    for (const gate of gates) race.update(.1, gate.center, LOCAL_ROUTE.waypoints[0]);
    expect(race.phase).toBe('FINISHED');
    const result = [race.playerTime, race.opponentTime, race.elapsed, race.position];
    race.update(1, gates[3].center, { x: 120, y: 0, z: 60 });
    expect(race.rival.position.z).toBe(60);
    expect([race.playerTime, race.opponentTime, race.elapsed, race.position]).toEqual(result);
  });
});
