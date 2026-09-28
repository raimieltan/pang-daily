import { expect, it } from 'vitest';
import { BANWA_DALAGAN_1996, PRISTINE_CONDITION } from '../../game-core/vehicles';
import { conditionHandling } from './conditionHandling';
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
