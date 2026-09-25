import {
  CONDITION_COMPONENTS,
  type ConditionStat,
  type VehicleCondition,
  type VehicleDefinition,
} from "./VehicleDefinition";

/** A car's numbers after condition is applied. Same units as the definition. */
export type VehicleStats = {
  powerHp: number;
  torqueNm: number;
  weightKg: number;
  tireGrip: number;
  brakeDecelerationMps2: number;
  reliability: number;
  /** Launch/pull multiplier from parts (gearing, tire character); 1 = stock. Weight is separate. */
  acceleration: number;
};

/**
 * Lightweight part effects on top of condition (wheels today). Multipliers, 1 = no change;
 * `addedWeightKg` adds to curb weight. Deliberately few, so the handling stays readable.
 */
export type StatModifiers = { grip: number; braking: number; acceleration: number; addedWeightKg: number };

export const NO_MODIFIERS: StatModifiers = { grip: 1, braking: 1, acceleration: 1, addedWeightKg: 0 };

/** Every component in perfect health. */
export const PRISTINE_CONDITION: VehicleCondition = Object.fromEntries(
  CONDITION_COMPONENTS.map((c) => [c, 1]),
) as VehicleCondition;

/**
 * Applies the definition's condition hooks: each effect scales its stat by
 * `1 - maxLoss * (1 - condition[component])`, and effects on the same stat multiply.
 * Part `modifiers` then apply on top.
 * Pure, so the backend can price repairs and validate race results with the same numbers.
 */
export function resolveVehicleStats(
  definition: VehicleDefinition,
  condition: VehicleCondition = PRISTINE_CONDITION,
  modifiers: StatModifiers = NO_MODIFIERS,
): VehicleStats {
  const factor: Record<ConditionStat, number> = { power: 1, grip: 1, braking: 1, reliability: 1 };
  for (const { component, stat, maxLoss } of definition.condition.effects) {
    const health = Math.min(1, Math.max(0, condition[component]));
    factor[stat] *= 1 - maxLoss * (1 - health);
  }
  return {
    powerHp: definition.power.peakPowerHp * factor.power,
    torqueNm: definition.power.peakTorqueNm * factor.power,
    weightKg: definition.weight.curbKg + modifiers.addedWeightKg,
    tireGrip: definition.grip.tireGrip * factor.grip * modifiers.grip,
    brakeDecelerationMps2: definition.braking.decelerationMps2 * factor.braking * modifiers.braking,
    reliability: definition.reliability.baseline * factor.reliability,
    acceleration: modifiers.acceleration,
  };
}
