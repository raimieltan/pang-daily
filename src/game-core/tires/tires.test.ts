import { describe, expect, it } from 'vitest';
import {
  FLAT_KPA, TireSession, impactPuncture, isLowPressure, newAssembly, nextCornerStep, performStep, puncture,
  stepAssembly, tireResponse, type ServiceContext,
} from '.';

const STOPPED: ServiceContext = { speedKmh: 0 };
const run = (tire: ReturnType<typeof newAssembly>, seconds: number, speed: number) => {
  const events = [];
  for (let t = 0; t < seconds; t += .1) events.push(...stepAssembly(tire, .1, speed, 'asphalt'));
  return events;
};

describe('tire assembly', () => {
  it('a slow leak drains over minutes, warns once, then goes flat', () => {
    const tire = newAssembly('a');
    puncture(tire, 'SLOW_LEAK', 5);
    const early = run(tire, 60, 15);
    expect(tire.pressureKpa).toBeCloseTo(215, 0);
    expect(early.some(e => e.kind === 'low_pressure')).toBe(false);
    const later = run(tire, 60 * 12, 15);
    expect(later.filter(e => e.kind === 'low_pressure')).toHaveLength(1);
    expect(isLowPressure(tire)).toBe(true);
    run(tire, 60 * 30, 0);
    expect(tire.failure).toBe('FLAT');
    expect(tire.pressureKpa).toBeLessThanOrEqual(FLAT_KPA);
    expect(tireResponse(tire, 'asphalt').grip).toBeLessThan(tireResponse(newAssembly('b'), 'asphalt').grip);
  });

  it('driving on a flat destroys the tire, then damages the rim; faster is worse', () => {
    const slow = newAssembly('s'), fast = newAssembly('f');
    puncture(slow, 'BLOWOUT'); puncture(fast, 'BLOWOUT');
    run(slow, 5, 4);
    const events = run(fast, 5, 20);
    expect(fast.health).toBeLessThan(slow.health);
    events.push(...run(fast, 120, 20));
    expect(fast.failure).toBe('DESTROYED');
    expect(fast.rimDamage).toBeGreaterThan(0);
    expect(events.some(e => e.kind === 'state' && e.to === 'DESTROYED')).toBe(true);
    const rim = tireResponse(fast, 'asphalt');
    expect(rim.grip).toBeLessThan(.4);
    expect(rim.rollingResistance).toBeGreaterThan(.05);
  });

  it('milder failures never override worse ones; impacts are deterministic per roll', () => {
    const tire = newAssembly('a');
    puncture(tire, 'RAPID_LEAK');
    expect(puncture(tire, 'SLOW_LEAK')).toEqual([]);
    expect(tire.failure).toBe('RAPID_LEAK');
    expect(impactPuncture(newAssembly('b'), .3, 0)).toBeNull();
    expect(impactPuncture(newAssembly('b'), 1, .01)).toBe('BLOWOUT');
    expect(impactPuncture(newAssembly('b'), 1, .99)).toBeNull();
  });

  it('the donut spare is weaker and wears fast above its advisory speed without capping it', () => {
    const donut = newAssembly('d', 'donut');
    expect(tireResponse(donut, 'asphalt').grip).toBeLessThan(1);
    const cruise = newAssembly('c', 'donut');
    run(cruise, 60, 70 / 3.6);
    const events = run(donut, 60, 120 / 3.6);
    expect(cruise.health).toBe(1);
    expect(donut.health).toBeLessThan(.97);
    expect(events.some(e => e.kind === 'overspeed')).toBe(true);
  });
});

describe('wheel change', () => {
  it('runs the whole procedure with readable rejections', () => {
    const tires = new TireSession();
    const car = tires.vehicle('car');
    const flatId = car.corners.RR!, spareId = car.spare!;
    puncture(tires.assembly(flatId)!, 'RAPID_LEAK');
    expect(performStep(tires, 'car', 'loosen', 'RR', { speedKmh: 20 })).toEqual({ rejected: 'Stop the car first' });
    expect(performStep(tires, 'car', 'remove', 'RR', STOPPED)).toEqual({ rejected: 'Jack up the rear-right corner first' });
    performStep(tires, 'car', 'loosen', 'RR', STOPPED);
    expect(performStep(tires, 'car', 'raise', 'RR', { speedKmh: 0, softGround: true })).toEqual({ rejected: 'The jack sinks here. Move to firmer ground' });
    performStep(tires, 'car', 'raise', 'RR', STOPPED);
    expect(performStep(tires, 'car', 'raise', 'FL', STOPPED)).toEqual({ rejected: 'The jack is already under the rear-right' });
    performStep(tires, 'car', 'take_spare', null, STOPPED);
    expect(performStep(tires, 'car', 'remove', 'RR', STOPPED)).toEqual({ rejected: 'Your hands are full' });
    performStep(tires, 'car', 'stow', null, STOPPED);
    performStep(tires, 'car', 'remove', 'RR', STOPPED);
    expect(performStep(tires, 'car', 'lower', null, STOPPED)).toEqual({ rejected: 'Mount a wheel before lowering' });
    expect(tires.driveBlock('car')).toMatch(/jack/);
    // Spare well holds the donut; the flat goes to the trunk, then the donut comes out.
    performStep(tires, 'car', 'stow', null, STOPPED);
    expect(tires.vehicle('car').trunk).toContain(flatId);
    performStep(tires, 'car', 'take_spare', null, STOPPED);
    expect(tires.vehicle('car').held).toBe(spareId);
    expect(nextCornerStep(tires, 'car', 'RR')).toBe('install');
    performStep(tires, 'car', 'install', 'RR', STOPPED);
    expect(tires.vehicle('car').corners.RR).toBe(spareId);
    expect(tires.mounted('car', 'RR')!.spec).toBe('donut');
    expect(performStep(tires, 'car', 'tighten', 'RR', STOPPED)).toEqual({ rejected: 'Lower the car first, or the wheel just spins' });
    performStep(tires, 'car', 'lower', null, STOPPED);
    expect(tires.driveBlock('car')).toMatch(/Tighten the rear-right/);
    expect(nextCornerStep(tires, 'car', 'RR')).toBe('tighten');
    performStep(tires, 'car', 'tighten', 'RR', STOPPED);
    expect(tires.driveBlock('car')).toBeNull();
    expect(tires.locate(flatId)).toEqual({ vehicleId: 'car', place: 'trunk' });
  });

  it('needs the jack and the wrench', () => {
    const tires = new TireSession();
    tires.mutate('car', c => { c.wrench = false; c.jack = false; });
    expect(performStep(tires, 'car', 'loosen', 'FL', STOPPED)).toEqual({ rejected: 'You need a lug wrench' });
    expect(performStep(tires, 'car', 'raise', 'FL', STOPPED)).toEqual({ rejected: 'You need a jack' });
    tires.mutate('car', c => { c.spare = null; });
    expect(performStep(tires, 'car', 'take_spare', null, STOPPED)).toEqual({ rejected: 'No spare in the trunk' });
  });

  it('persists every corner, the spare and a job in progress; loading never heals', () => {
    let saved: unknown = null;
    const tires = new TireSession(null, s => { saved = s; });
    const car = tires.vehicle('car');
    const tire = tires.assembly(car.corners.FL)!;
    puncture(tire, 'SLOW_LEAK', 5);
    stepAssembly(tire, 60, 10, 'asphalt');
    performStep(tires, 'car', 'loosen', 'FR', STOPPED);
    performStep(tires, 'car', 'raise', 'FR', STOPPED);
    tires.save();
    const loaded = new TireSession(JSON.parse(JSON.stringify(saved)));
    const again = loaded.vehicle('car');
    expect(again.corners).toEqual(car.corners);
    expect(again.spare).toBe(car.spare);
    expect(again.jacked).toBe('FR');
    expect(again.loosened).toEqual(['FR']);
    expect(loaded.mounted('car', 'FL')).toEqual(tire);
    expect(loaded.mounted('car', 'FL')!.failure).toBe('SLOW_LEAK');
    expect(loaded.driveBlock('car')).toMatch(/jack/);
  });
});
