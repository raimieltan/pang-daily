import { NO_MODIFIERS, type StatModifiers } from '../../game-core/vehicles/vehicleStats';
import { calculateVehiclePerformance, type PerformanceStats } from '../../game-core/performance/calculator';
import type { VehicleCondition, VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import type { HandlingConfig } from '../vehicles/handling/HandlingConfig';

/**
 * Only three readable arcade effects. Always derive from the pristine preset, never compound.
 * Part `modifiers` (wheels) ride along: added weight costs acceleration by power-to-weight.
 */
export function conditionHandling(base: HandlingConfig, definition: VehicleDefinition, condition: VehicleCondition,
  modifiers: StatModifiers = NO_MODIFIERS): HandlingConfig {
  return performanceHandling(base, calculateVehiclePerformance(definition).stats,
    calculateVehiclePerformance(definition, [], condition, { modifiers }).stats);
}

/** Controller boundary: final numbers only, no installed part definitions. */
export function performanceHandling(base: HandlingConfig, healthy: PerformanceStats, worn: PerformanceStats): HandlingConfig {
  const power = (worn.powerHp / healthy.powerHp) * (healthy.weightKg / worn.weightKg) * worn.acceleration;
  const grip = worn.tireGrip / healthy.tireGrip;
  return { ...base,
    chassis: { ...base.chassis, massKg: base.chassis.massKg * worn.weightKg / healthy.weightKg },
    ...(base.mechanical ? { mechanical: { ...base.mechanical,
      engine: { ...base.mechanical.engine,
        torqueNm: base.mechanical.engine.torqueNm * worn.torqueNm / healthy.torqueNm * worn.acceleration,
        clutchTorqueNm: base.mechanical.engine.clutchTorqueNm * worn.clutchCapacityNm / healthy.clutchCapacityNm,
        gearRatios: worn.mechanical?.gearRatios ?? base.mechanical.engine.gearRatios },
      differential: worn.mechanical?.differential ?? base.mechanical.differential,
      steering: { ...base.mechanical.steering, ...worn.mechanical?.steering },
      suspension: { ...base.mechanical.suspension, ...worn.mechanical?.suspension },
    } } : {}),
    pedals: { ...base.pedals, throttleRise: base.pedals.throttleRise * worn.throttleResponse / (1 + worn.turboLagSeconds) },
    drive: { ...base.drive, accelerationMps2: base.drive.accelerationMps2 * power,
      reverseAccelerationMps2: base.drive.reverseAccelerationMps2 * power },
    tires: { ...base.tires, frontGrip: base.tires.frontGrip * grip, rearGrip: base.tires.rearGrip * grip },
    brakes: { ...base.brakes, decelerationMps2: base.brakes.decelerationMps2 * worn.brakeDecelerationMps2 / healthy.brakeDecelerationMps2 },
  };
}
