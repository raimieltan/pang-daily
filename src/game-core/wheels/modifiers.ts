import type { VehicleDefinition } from "../vehicles/VehicleDefinition";
import { NO_MODIFIERS, type StatModifiers } from "../vehicles/vehicleStats";
import type { WheelPart } from "./WheelPart";

/** A fully bent/out-of-round set loses this share of grip. */
export const BENT_RIM_GRIP_LOSS = 0.08;

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
