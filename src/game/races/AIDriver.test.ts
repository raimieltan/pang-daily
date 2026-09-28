import { describe, expect, it } from 'vitest';
import { AIDriver, DRIVER_SKILLS } from './AIDriver';
import type { Waypoint } from './Race';

const personality = { aggression: .4, patience: .6, overtakingPreference: 'balanced' as const,
  defensiveTendency: .4, riskTolerance: .4, trafficRiskTolerance: .3, mistakeFrequency: .2 };
const straight: Waypoint[] = Array.from({ length: 21 }, (_, i) => ({ x: 0, y: 0, z: i * 5, speed: 25 }));
const feedback = (z: number, speed: number) => ({ position: { x: 0, y: 0, z }, heading: 0, speed,
  yawRate: 0, lateralSlip: 0, frontGripUsage: .3, rearGripUsage: .3, grip: 1 });

describe('racing driver input planner', () => {
  it('lets every tier accelerate past baseline road pace on a clear straight', () => {
    const road = straight.map(point => ({ ...point, speed: 23 }));
    const beginner = new AIDriver(road, DRIVER_SKILLS[0], personality, 7, 2.5);
    const expert = new AIDriver(road, DRIVER_SKILLS[3], personality, 7, 2.5);
    expect(beginner.update(1 / 60, feedback(20, 24), []).throttle).toBeGreaterThan(0);
    const fast = expert.update(1 / 60, feedback(20, 28), []);
    expect(fast.throttle).toBeGreaterThan(0);
    expect(fast.brake).toBe(0);
  });

  it('brakes for a slower physical vehicle in its path', () => {
    const driver = new AIDriver(straight, DRIVER_SKILLS[1], personality, 7, 2.5);
    const free = driver.update(1 / 60, feedback(20, 20), []);
    driver.reset();
    const traffic = driver.update(1 / 60, feedback(20, 20), [{ position: { x: 0, y: 0, z: 33 },
      velocity: { x: 0, y: 0, z: 5 }, kind: 'traffic', width: 1.7, length: 4.3 }]);
    expect(traffic.brake).toBeGreaterThan(free.brake);
    expect(traffic.throttle).toBe(0);
  });

  it('starts a pass on the clear side of traffic before the last few metres', () => {
    const driver = new AIDriver(straight, DRIVER_SKILLS[1], personality, 7, 2.5);
    const input = driver.update(1 / 60, feedback(20, 20), [{ position: { x: 1.5, y: 0, z: 50 },
      velocity: { x: 0, y: 0, z: 5 }, kind: 'traffic', width: 1.7, length: 4.3 }]);
    expect(driver.laneChange).toBe('MOVING');
    expect(input.steer).toBeLessThan(0);
  });

  it('brakes instead of passing into approaching traffic', () => {
    const driver = new AIDriver(straight, DRIVER_SKILLS[1], personality, 7, 2.5);
    const input = driver.update(1 / 60, feedback(20, 20), [
      { position: { x: 1.5, y: 0, z: 50 }, velocity: { x: 0, y: 0, z: 5 }, kind: 'traffic', width: 1.7, length: 4.3 },
      { position: { x: -1.7, y: 0, z: 65 }, velocity: { x: 0, y: 0, z: -12 }, kind: 'traffic', width: 1.7, length: 4.3 },
    ]);
    expect(driver.laneChange).toBe('NONE');
    expect(input.brake).toBeGreaterThan(0);
  });

  it('reverses after pushing against scenery, then retries on a different line', () => {
    const driver = new AIDriver(straight, DRIVER_SKILLS[3], personality, 7, 2.5);
    const pinned = { ...feedback(20, 0), position: { x: 1.5, y: 0, z: 20 } };
    let reversing = false;
    for (let i = 0; i < 180; i++) {
      const input = driver.update(1 / 60, pinned, []);
      reversing ||= input.brake === 1 && input.throttle === 0;
    }
    expect(reversing).toBe(true);
    for (let i = 0; i < 130; i++) {
      const input = driver.update(1 / 60, { ...pinned, speed: -2,
        position: { ...pinned.position, z: 20 - i * .02 } }, []);
      if (i < 10) expect(input.brake).toBe(1);
    }
    const retry = driver.update(1 / 60, { ...pinned, position: { ...pinned.position, z: 17.4 } }, []);
    expect(retry.throttle).toBeGreaterThan(0);
    expect(retry.steer).toBeLessThan(0);
  });

  it('does not reverse while waiting behind another vehicle', () => {
    const driver = new AIDriver(straight, DRIVER_SKILLS[3], personality, 7, 2.5);
    const stopped = { ...feedback(20, 0), position: { x: 0, y: 0, z: 20 } };
    const traffic = [{ position: { x: 0, y: 0, z: 25 }, velocity: { x: 0, y: 0, z: 0 },
      kind: 'traffic' as const, width: 1.7, length: 4.3 }];
    for (let i = 0; i < 240; i++) expect(driver.update(1 / 60, stopped, traffic).brake).toBeLessThan(1);
  });

  it('looks farther ahead with speed and maps bends to corner metadata', () => {
    const bend = [...straight.slice(0, 8), ...Array.from({ length: 8 }, (_, i) => ({
      x: (i + 1) * 3, y: 0, z: 35 - i * 2, speed: 8 }))];
    const driver = new AIDriver(bend, DRIVER_SKILLS[2], personality, 7, 2.5);
    driver.update(1 / 60, feedback(5, 5), []);
    const slow = driver.lookahead.braking;
    driver.update(1 / 60, feedback(5, 20), []);
    expect(driver.lookahead.braking).toBeGreaterThan(slow);
    expect(driver.road.segments.some(s => s.corner?.direction === 'right')).toBe(true);
  });

  it('steers inward and slows when a lane-centred route approaches the road edge', () => {
    const lane = straight.map(point => ({ ...point, width: 6.2, roadOffset: 1.5 }));
    const driver = new AIDriver(lane, DRIVER_SKILLS[3], personality, 7, 2.5);
    const centered = driver.update(1 / 60, feedback(20, 20), []);
    driver.reset();
    const edge = driver.update(1 / 60, { ...feedback(20, 20), position: { x: .65, y: 0, z: 20 } }, []);
    expect(edge.steer).toBeLessThan(centered.steer);
    expect(edge.brake).toBeGreaterThan(0);
    expect(driver.road.segments[4].rightBoundary[0].x).toBeCloseTo(1.6, 1);
  });
});
