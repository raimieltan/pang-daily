import type { VehicleDefinition } from "../vehicles/VehicleDefinition";
import { NO_MODIFIERS, type StatModifiers } from "../vehicles/vehicleStats";
import type { WheelPart } from "./WheelPart";

import { BENT_RIM_GRIP_LOSS, type WheelSetup } from "../tires/assembly";
export { BENT_RIM_GRIP_LOSS };

/**
 * What a wheel set does to the car's stats: its own grip/braking/acceleration modifiers, the
 * weight of four wheels against stock, and a little lost grip for a battered set. `null` part =
 * stock wheels; `condition` is the owned copy's (null = parts that don't wear, treated as 1).
 */
export function wheelModifiers(definition: VehicleDefinition, part: WheelPart | null, condition: number | null = 1): StatModifiers {
  if (!part) return NO_MODIFIERS;
  const health = condition === null ? 1 : Math.min(1, Math.max(0, condition));
  const { grip, braking, acceleration } = part.modifiers;
  return {
    grip: (1 + grip) * (1 - BENT_RIM_GRIP_LOSS * (1 - health)),
    braking: 1 + braking,
    acceleration: 1 + acceleration,
    addedWeightKg: 4 * (part.massKg - definition.wheels.stock.massKg),
  };
}

/**
 * The same set as tire-simulation parameters, for the physics. Its grip, braking bias and rim wear
 * act per corner through each road tire, so `physicalWheelModifiers` drops them from the car stats.
 */
export function wheelSetup(part: WheelPart | null, condition: number | null = 1): Omit<WheelSetup, "tread" | "treadGripLoss"> {
  if (!part) return { gripScale: 1, longitudinalScale: 1, rimWear: 0 };
  const health = condition === null ? 1 : Math.min(1, Math.max(0, condition));
  return { gripScale: 1 + part.modifiers.grip, longitudinalScale: 1 + part.modifiers.braking, rimWear: 1 - health };
}

/** Wheel modifiers the chassis still feels: weight and the rolling-radius (gearing) effect on acceleration. */
export function physicalWheelModifiers(modifiers: StatModifiers): StatModifiers {
  return { ...modifiers, grip: 1, braking: 1 };
}
