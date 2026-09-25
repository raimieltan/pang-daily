import { NO_MODIFIERS, resolveVehicleStats, type StatModifiers } from '../../game-core/vehicles/vehicleStats';
import type { VehicleCondition, VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import type { HandlingConfig } from '../vehicles/handling/HandlingConfig';

/**
 * Only three readable arcade effects. Always derive from the pristine preset, never compound.
 * Part `modifiers` (wheels) ride along: added weight costs acceleration by power-to-weight.
 */
export function conditionHandling(base: HandlingConfig, definition: VehicleDefinition, condition: VehicleCondition,
  modifiers: StatModifiers = NO_MODIFIERS): HandlingConfig {
  const healthy = resolveVehicleStats(definition), worn = resolveVehicleStats(definition, condition, modifiers);
  const power = (worn.powerHp / healthy.powerHp) * (healthy.weightKg / worn.weightKg) * worn.acceleration;
  const grip = worn.tireGrip / healthy.tireGrip;
  return { ...base,
    drive: { ...base.drive, accelerationMps2: base.drive.accelerationMps2 * power,
      reverseAccelerationMps2: base.drive.reverseAccelerationMps2 * power },
    tires: { ...base.tires, frontGrip: base.tires.frontGrip * grip, rearGrip: base.tires.rearGrip * grip },
    brakes: { ...base.brakes, decelerationMps2: base.brakes.decelerationMps2 * worn.brakeDecelerationMps2 / healthy.brakeDecelerationMps2 },
  };
}
