import { describe, expect, it } from 'vitest';
import { BANWA_DALAGAN_1996 as car, PRISTINE_CONDITION } from '../vehicles';
import { applyConditionLoss, drivingWear, impactWear, repairLines, SERVICE_COMPONENTS, type WearSample } from './condition';
import { VehicleSession } from './VehicleSession';

const cruise: WearSample = { speedMps: 20, throttle: .5, brake: 0, slip: 0, handbrake: 0, grounded: true, racing: false };
describe('lightweight wear and repairs', () => {
  it('wears all five systems with distance; hard use and racing cost more', () => {
    const normal = drivingWear(cruise, 60);
    const hard = drivingWear({ ...cruise, throttle: 1, brake: 1, slip: 1, handbrake: 1, racing: true }, 60);
    for (const key of SERVICE_COMPONENTS) { expect(normal[key]).toBeGreaterThan(0); expect(hard[key]).toBeGreaterThan(normal[key]); }
    const healthy = applyConditionLoss(PRISTINE_CONDITION, normal);
    expect(healthy.engine).toBeLessThan(1);
    expect(healthy.body).toBe(1); expect(healthy.electrical).toBe(1);
  });
  it('is independent of frame rate and does not wear while stopped or airborne', () => {
    const full = drivingWear(cruise, 1), frame = drivingWear(cruise, 1 / 60);
    for (const key of SERVICE_COMPONENTS) expect(frame[key] * 60).toBeCloseTo(full[key], 12);
    for (const sample of [{ ...cruise, speedMps: 0 }, { ...cruise, grounded: false }])
      expect(Object.values(drivingWear(sample, 60)).every(v => v === 0)).toBe(true);
    expect(drivingWear({ ...cruise, speedMps: -20 }, 1)).toEqual(full);
  });
  it('clamps impacts and wear without healing or corrupting condition', () => {
    expect(impactWear(10)).toEqual(impactWear(1)); expect(impactWear(-1).engine).toBe(0);
    expect(impactWear(NaN).engine).toBe(0);
    let condition = { ...PRISTINE_CONDITION };
    for (let i = 0; i < 100; i++) condition = applyConditionLoss(condition, impactWear(1));
    for (const key of SERVICE_COMPONENTS) expect(condition[key]).toBe(0);
    expect(repairLines(car, PRISTINE_CONDITION).every(line => line.costPhp === 0)).toBe(true);
  });
  it('charges the exact quote once, restores only selected components and records the transaction', () => {
    const session = new VehicleSession(), before = session.summary(car), quote = session.quote(car);
    const cost = quote.lines.find(line => line.component === 'tires')!.costPhp;
    const result = session.repair(car, quote, ['tires', 'tires']);
    expect(result).toMatchObject({ costPhp: cost, components: ['tires'], walletPhp: before.walletPhp - cost });
    const after = session.summary(car);
    expect(after.condition.tires).toBe(1); expect(after.condition.engine).toBe(before.condition.engine);
    expect(session.snapshot().transactions.at(-1)).toMatchObject({ kind: 'repair', amountPhp: -cost });
    const saved = session.snapshot();
    expect(session.repair(car, quote, ['tires'])).toHaveProperty('rejected');
    expect(session.snapshot()).toEqual(saved);
  });
  it('rejects insufficient funds, invalid choices and stale inspections atomically', () => {
    const session = new VehicleSession(); session.ensureVehicle(car);
    const save = session.snapshot(); save.walletPhp = 0;
    const poor = new VehicleSession(save), quote = poor.quote(car), before = poor.snapshot();
    expect(poor.repair(car, quote, ['engine'])).toHaveProperty('rejected'); expect(poor.snapshot()).toEqual(before);
    expect(poor.repair(car, quote, [])).toHaveProperty('rejected');
    expect(poor.repair(car, quote, ['not_a_part' as never])).toHaveProperty('rejected');
    poor.wear(car, impactWear(.5));
    expect(poor.repair(car, quote, ['tires'])).toMatchObject({ rejected: expect.stringContaining('Condition changed') });
  });
  it('restores session state and does not charge for healthy parts', () => {
    const session = new VehicleSession(); const quote = session.quote(car);
    session.repair(car, quote, ['brakes']);
    const restored = new VehicleSession(session.snapshot());
    expect(restored.summary(car)).toEqual(session.summary(car));
    expect(restored.repair(car, restored.quote(car), ['brakes'])).toHaveProperty('rejected');
    const corrupt = new VehicleSession({ ...session.snapshot(), walletPhp: -500 });
    expect(corrupt.summary(car).walletPhp).toBe(5000);
  });
});
