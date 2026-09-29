import { expect, it } from 'vitest';
import { BANWA_DALAGAN_1996, BANWA_SILAK_1983, PRISTINE_CONDITION } from '../../game-core/vehicles';
import { calculateVehiclePerformance } from '../../game-core/performance/calculator';
import { conditionHandling, performanceHandling } from './conditionHandling';
import { resolveHandlingPreset } from '../vehicles/handling/HandlingConfig';
import { HANDLING_PRESETS } from '../vehicles/handling/presets';
import { ArcadeHandlingModel } from '../vehicles/handling/ArcadeHandlingModel';

it('still lets an engined car creep with zero tire and suspension condition', () => {
 const base = resolveHandlingPreset(HANDLING_PRESETS, 'fwd_worn_sedan');
 const handling = conditionHandling(base, BANWA_DALAGAN_1996, {
  ...PRISTINE_CONDITION, tires: 0, suspension: 0,
 });
 const car = new ArcadeHandlingModel(handling);
 for (let frame = 0; frame < 15 * 60; frame++) car.step(1 / 60, { throttle: 1, brake: 0, steer: 0 }, { front: 1, rear: 1 });
 expect(car.state.vx).toBeGreaterThan(0.5);
 expect(car.state.vx).toBeLessThan(7);
});

it('makes failed tires and suspension barely grip and failed brakes provide no service braking', () => {
 const base = resolveHandlingPreset(HANDLING_PRESETS, 'fwd_worn_sedan');
 const failed = conditionHandling(base, BANWA_DALAGAN_1996, {
  ...PRISTINE_CONDITION, tires: 0, suspension: 0, brakes: 0,
 });
 expect(failed.tires.frontGrip).toBeLessThan(base.tires.frontGrip * .11);
 expect(failed.tires.rearGrip).toBeLessThan(base.tires.rearGrip * .11);
 expect(failed.brakes.decelerationMps2).toBe(0);
});
it('scales handling from base tuning and restores healthy performance without compounding', () => {
  const base = resolveHandlingPreset(HANDLING_PRESETS, 'fwd_worn_sedan');
  const original = structuredClone(base);
  const worn = conditionHandling(base, BANWA_DALAGAN_1996, BANWA_DALAGAN_1996.condition.typical);
  expect(worn.drive.accelerationMps2).toBeLessThan(base.drive.accelerationMps2);
  expect(worn.tires.frontGrip).toBeLessThan(base.tires.frontGrip);
  expect(worn.brakes.decelerationMps2).toBeLessThan(base.brakes.decelerationMps2);
  expect(conditionHandling(base, BANWA_DALAGAN_1996, PRISTINE_CONDITION)).toEqual(original);
  expect(base).toEqual(original);
});

it('installed RWD drivetrain hardware reaches the physical torque solver', () => {
  const base = resolveHandlingPreset(HANDLING_PRESETS, 'rwd_box_turbo');
  const healthy = calculateVehiclePerformance(BANWA_SILAK_1983).stats;
  const built = calculateVehiclePerformance(BANWA_SILAK_1983, [
    { id: 'lsd', partId: 'used_lsd', condition: .8 },
    { id: 'box', partId: 'close_ratio_gearbox', condition: 1 },
    { id: 'clutch', partId: 'uprated_clutch', condition: 1 },
    { id: 'exhaust', partId: 'talyer_exhaust', condition: 1 },
  ]);
  expect(built.compatibility.issues).toEqual([]);
  const config = performanceHandling(base, healthy, built.stats);
  expect(config.mechanical!.differential.type).toBe('lsd');
  expect(config.mechanical!.differential.lock).toBeCloseTo(.32);
  expect(config.mechanical!.engine.gearRatios).toEqual([2.8, 1.9, 1.4, 1.12, .92]);
  expect(config.mechanical!.engine.clutchTorqueNm).toBeGreaterThan(base.mechanical!.engine.clutchTorqueNm);
  expect(config.mechanical!.engine.torqueNm).toBeGreaterThan(base.mechanical!.engine.torqueNm);
  expect(config.chassis.massKg).toBeGreaterThan(base.chassis.massKg);
  expect(performanceHandling(base, healthy, healthy)).toEqual(base);
});
