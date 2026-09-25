import { expect, it } from 'vitest';
import { BANWA_DALAGAN_1996, PRISTINE_CONDITION } from '../../game-core/vehicles';
import { conditionHandling } from './conditionHandling';
import { resolveHandlingPreset } from '../vehicles/handling/HandlingConfig';
import { HANDLING_PRESETS } from '../vehicles/handling/presets';
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
