import type { HandlingPreset } from "./HandlingConfig";

/**
 * Starter handling presets. Swapping presets is a data change: pick an id
 * (vehicle definition, `?handling=` URL param, or the debug panel).
 * Rationale for every baseline number lives in docs/HANDLING_TUNING.md.
 */
export const HANDLING_PRESETS = {
  fwd_worn_sedan: {
    name: "Worn '90s FWD sedan",
    description: "Tired 1.5L hatch/sedan on mismatched tires. Understeers when rushed, rotates on a lift.",
    config: {
      chassis: {
        massKg: 1080,
        wheelbaseM: 2.5,
        frontWeight: 0.62,
        cgHeightM: 0.52,
        yawInertiaScale: 1.1,
      },
      steering: {
        maxAngleDeg: 32,
        minAngleDeg: 2,
        fullLockLateralG: 1.25,
        turnInSeconds: 0.2,
        unwindSeconds: 0.12,
      },
      drive: {
        drivetrain: "FWD",
        accelerationMps2: 3.8,
        topSpeedKmh: 180,
        reverseAccelerationMps2: 2.5,
        reverseTopSpeedKmh: 25,
        engineBrakingMps2: 1.2,
        rollingResistanceMps2: 0.15,
        aeroDrag: 0.00035,
      },
      brakes: {
        decelerationMps2: 8,
        frontBias: 0.68,
      },
      tires: {
        frontGrip: 0.95,
        rearGrip: 1.0,
        frontPeakSlipDeg: 7,
        rearPeakSlipDeg: 6,
      },
      balance: {
        understeer: 0.45,
        rearSlideFalloff: 0.1,
        weightTransfer: 0.6,
        weightTransferRate: 5,
        liftOffRotation: 0.08,
        liftOffMinSpeedKmh: 35,
        liftOffBuildRate: 3,
        liftOffReleaseRate: 6,
      },
      assists: {
        traction: 0.35,
        stability: 0.5,
        stabilityThresholdDeg: 5,
      },
      lowSpeed: {
        kinematicBelowKmh: 5,
        dynamicAboveKmh: 12,
        holdBelowKmh: 1.5,
        reverseEngageBelowKmh: 3,
        reverseDelaySeconds: 0.35,
      },
      pedals: {
        throttleRise: 6,
        throttleFall: 8,
        brakeRise: 7,
        brakeFall: 10,
      },
    },
  },

  fwd_worn_sedan_fresh_tires: {
    name: "Worn sedan, fresh tires",
    description: "Same car after the vulcanizing shop: more grip everywhere, less push, calmer lift-off.",
    extends: "fwd_worn_sedan",
    overrides: {
      tires: { frontGrip: 1.08, rearGrip: 1.12 },
      balance: { understeer: 0.35 },
    },
  },

  fwd_worn_sedan_bald_rears: {
    name: "Worn sedan, bald rears",
    description: "The good tires went on the front. Lively lift-off rotation; needs throttle to stay tidy.",
    extends: "fwd_worn_sedan",
    overrides: {
      tires: { rearGrip: 0.9 },
      balance: { liftOffRotation: 0.16, rearSlideFalloff: 0.2 },
    },
  },

  fwd_worn_sedan_no_assists: {
    name: "Worn sedan, assists off",
    description: "Baseline with traction and stability assists disabled, for tuning the raw balance.",
    extends: "fwd_worn_sedan",
    overrides: {
      assists: { traction: 0, stability: 0 },
    },
  },
} satisfies Record<string, HandlingPreset>;

export type HandlingPresetId = keyof typeof HANDLING_PRESETS;

export const DEFAULT_HANDLING_PRESET: HandlingPresetId = "fwd_worn_sedan";

export function isHandlingPresetId(id: string): id is HandlingPresetId {
  return Object.hasOwn(HANDLING_PRESETS, id);
}
