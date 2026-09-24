import { z } from "zod";

/**
 * Data-driven tuning for the arcade handling model (TECH_ARCHITECTURE §9–10).
 *
 * Pure data: no Babylon, no meshes, no UI. Parts/upgrades/condition can later
 * produce a modified copy of a config before it reaches the controller.
 * Units are chosen for tuning readability (km/h, degrees, m/s²); the model
 * converts internally. See docs/HANDLING_TUNING.md for the baseline rationale.
 */

const unit = z.number().min(0).max(1);
const positive = z.number().positive();
const nonNegative = z.number().min(0);

export const handlingConfigSchema = z.strictObject({
  chassis: z.strictObject({
    massKg: positive,
    wheelbaseM: positive,
    /** Static share of weight on the front axle. FWD sedans sit around 0.6. */
    frontWeight: z.number().min(0.3).max(0.75),
    /** Only scales how much load moves between axles; not used for rollover. */
    cgHeightM: positive,
    /** Multiplies the default yaw inertia (m·a·b). Higher = lazier, heavier-feeling rotation. */
    yawInertiaScale: positive,
  }),

  steering: z.strictObject({
    /** Road-wheel lock at parking speeds. */
    maxAngleDeg: z.number().min(5).max(45),
    /** Lock never shrinks below this at very high speed. */
    minAngleDeg: z.number().min(0.5).max(45),
    /**
     * Speed-sensitive steering: lock is limited so full lock asks for this much lateral g.
     * Above the tire grip (~1.0) full lock overdrives the front and the car visibly pushes wide;
     * at or below it, full lock can never exceed the tires.
     */
    fullLockLateralG: positive,
    /** Seconds to wind from centre to the current full lock. Same feel at every speed. */
    turnInSeconds: positive,
    /** Seconds to unwind from full lock back to centre (or toward the other side). */
    unwindSeconds: positive,
  }),

  drive: z.strictObject({
    drivetrain: z.enum(["FWD", "RWD", "AWD"]),
    /** Peak forward acceleration from a standstill, before drag and traction limits. */
    accelerationMps2: positive,
    /** Speed at which the engine stops pulling. Drag keeps the real top speed slightly lower. */
    topSpeedKmh: positive,
    reverseAccelerationMps2: positive,
    reverseTopSpeedKmh: positive,
    /** Deceleration with the throttle closed. Also drives lift-off weight transfer. */
    engineBrakingMps2: nonNegative,
    rollingResistanceMps2: nonNegative,
    /** Deceleration per (m/s)². */
    aeroDrag: nonNegative,
  }),

  brakes: z.strictObject({
    /** Full-pedal deceleration on dry grip. Axle grip caps it (built-in arcade ABS). */
    decelerationMps2: positive,
    /** Share of braking on the front axle. Lower values make trail-braking rotate more. */
    frontBias: unit,
  }),

  tires: z.strictObject({
    /** Friction coefficient per axle. Front below rear = stable, understeer-biased car. */
    frontGrip: positive,
    rearGrip: positive,
    /** Slip angle where each axle peaks. Lower = sharper, more immediate response. */
    frontPeakSlipDeg: positive,
    rearPeakSlipDeg: positive,
  }),

  balance: z.strictObject({
    /**
     * How much front grip falls away once the front is overdriven past its peak slip
     * (0 = holds peak, 1 = loses half). This is what makes "too fast, too much lock" plough wide.
     */
    understeer: unit,
    /** Same falloff for the rear. Keep low: a high value makes slides snap rather than build. */
    rearSlideFalloff: unit,
    /** Scales longitudinal load transfer (brake → nose heavy, throttle → tail heavy). */
    weightTransfer: unit,
    /** Per-second rate load transfer settles at. Lower = slower, more telegraphed pitch. */
    weightTransferRate: positive,
    /**
     * Rear grip lost at full lift-off (front gains half of it). The FWD "lift to tuck the nose"
     * tool: the effect builds and releases over time so it rewards timing, not luck.
     */
    liftOffRotation: unit,
    liftOffMinSpeedKmh: nonNegative,
    /** Per-second build/release rates of the lift-off effect. */
    liftOffBuildRate: positive,
    liftOffReleaseRate: positive,
  }),

  assists: z.strictObject({
    /** Trims drive force so the driven axle keeps grip for cornering (0 = off, 1 = cornering always wins). */
    traction: unit,
    /** Counter-yaw once the rear axle slides past `stabilityThresholdDeg` (0 = off). */
    stability: unit,
    stabilityThresholdDeg: positive,
  }),

  lowSpeed: z.strictObject({
    /**
     * Below `kinematicBelowKmh` the car follows its wheels exactly (no tire slip),
     * blending to the full tire model by `dynamicAboveKmh`. This is what keeps parking,
     * launches, and reversing calm.
     */
    kinematicBelowKmh: nonNegative,
    dynamicAboveKmh: positive,
    /** With no throttle, the car is held still below this speed (auto-hold on slopes). */
    holdBelowKmh: nonNegative,
    /** Holding brake below this speed selects reverse. Throttle below it selects drive again. */
    reverseEngageBelowKmh: positive,
    /** How long the car must sit stopped with the brake held before reverse engages. */
    reverseDelaySeconds: nonNegative,
  }),

  pedals: z.strictObject({
    /** Per-second ramp rates, so digital keyboard input still gives progressive transitions. */
    throttleRise: positive,
    throttleFall: positive,
    brakeRise: positive,
    brakeFall: positive,
  }),
});

export type HandlingConfig = z.infer<typeof handlingConfigSchema>;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type HandlingOverrides = DeepPartial<HandlingConfig>;

/** A full base config, or a variant expressed as overrides on another preset. */
export type HandlingPreset = {
  name: string;
  description: string;
} & ({ config: HandlingConfig } | { extends: string; overrides: HandlingOverrides });

/** Throws with the offending path when a config is out of range or has unknown keys. */
export function validateHandlingConfig(config: unknown): HandlingConfig {
  return handlingConfigSchema.parse(config);
}

/** Applies partial overrides (e.g. a preset variant, a part, tire wear) to a config, then validates. */
export function applyHandlingOverrides(base: HandlingConfig, overrides: HandlingOverrides): HandlingConfig {
  return validateHandlingConfig(deepMerge(base, overrides));
}

export function resolveHandlingPreset(presets: Readonly<Record<string, HandlingPreset>>, id: string): HandlingConfig {
  const seen = new Set<string>();
  const resolve = (presetId: string): HandlingConfig => {
    const preset = presets[presetId];
    if (!preset) throw new Error(`Unknown handling preset "${presetId}"`);
    if (seen.has(presetId)) throw new Error(`Handling preset "${presetId}" extends itself`);
    seen.add(presetId);
    return "config" in preset
      ? validateHandlingConfig(preset.config)
      : applyHandlingOverrides(resolve(preset.extends), preset.overrides);
  };
  return resolve(id);
}

function deepMerge<T extends object>(base: T, overrides: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      typeof value === "object" && value !== null && typeof current === "object" && current !== null
        ? deepMerge(current, value)
        : value;
  }
  return out as T;
}
