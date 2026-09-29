import { STOCK_MECHANICAL } from "./MechanicalConfig";
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
        trackWidthM: 1.456,
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
        frontLoadSensitivity: 0.3,
        rearLoadSensitivity: 0.25,
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
      handbrake: {
        enabled: true,
        minEffectiveSpeedKmh: 18,
        fullEffectSpeedKmh: 45,
        rearGripMultiplier: 0.55,
        frontGripMultiplier: 0.95,
        rearBrakeMps2: 5,
        engageSmoothing: 12,
        releaseSmoothing: 8,
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

  fwd_hatch: {
    name: "'90s FWD hot hatch",
    description: "Lighter, longer wheelbase, rear discs and a rev-happy 1.6. Less push, more lift-off bite.",
    extends: "fwd_worn_sedan",
    overrides: {
      chassis: { massKg: 1030, wheelbaseM: 2.62, frontWeight: 0.61, cgHeightM: 0.5 },
      drive: { accelerationMps2: 4.3, topSpeedKmh: 195 },
      brakes: { decelerationMps2: 8.5, frontBias: 0.66 },
      tires: { frontGrip: 1.0, rearGrip: 1.04 },
      balance: { understeer: 0.38, liftOffRotation: 0.11 },
    },
  },
  fwd_worn_sedan_drift: {
    name: "Worn sedan · drift tune",
    description: "Looser rear, stronger handbrake and less stability control. Swings the tail on a lift.",
    extends: "fwd_worn_sedan",
    overrides: {
      tires: { rearGrip: .94 },
      balance: { understeer: .36, rearSlideFalloff: .2, liftOffRotation: .2 },
      assists: { stability: .15 },
      handbrake: { rearGripMultiplier: .38, rearBrakeMps2: 6.5 },
    },
  },
  fwd_hatch_drift: {
    name: "'90s FWD hot hatch · drift tune",
    description: "Looser rear, stronger handbrake and less stability control. Rotates hard on a lift.",
    extends: "fwd_hatch",
    overrides: {
      tires: { rearGrip: .97 },
      balance: { understeer: .3, rearSlideFalloff: .22, liftOffRotation: .24 },
      assists: { stability: .15 },
      handbrake: { rearGripMultiplier: .38, rearBrakeMps2: 6.5 },
    },
  },
  rwd_box_turbo: {
    name: "'80s RWD turbo sedan · street tune",
    description: "Longitudinal turbo four and a live rear axle. Feathered throttle and light TCS keep it planted; slides only on request.",
    extends: "fwd_worn_sedan",
    overrides: {
      mechanical: { ...STOCK_MECHANICAL, engine: { ...STOCK_MECHANICAL.engine, boostRpm: 2600 }, tcs: 'sport', throttleFeather: .45 },
      pedals: { throttleRise: 3.8, throttleFall: 6, brakeRise: 7, brakeFall: 9 },
      chassis: { massKg: 1090, wheelbaseM: 2.5, frontWeight: .53, cgHeightM: .49, trackWidthM: 1.456, yawInertiaScale: 1.05 },
      drive: { drivetrain: "RWD", accelerationMps2: 5.2, topSpeedKmh: 190, engineBrakingMps2: 1.1 },
      brakes: { decelerationMps2: 8.2, frontBias: .64 },
      tires: { frontGrip: .9, rearGrip: 1, frontPeakSlipDeg: 10, rearPeakSlipDeg: 6 },
      balance: { understeer: .12, rearSlideFalloff: .18, liftOffRotation: .04 },
      assists: { traction: 0, stability: 0 },
    },
  },
  rwd_box_drift: {
    name: "'80s RWD turbo sedan · drift tune",
    description: "Same engine; clutch-type diff, extra lock, TCS off and a sharp throttle. Holds angle on the gas.",
    extends: "rwd_box_turbo",
    overrides: {
      mechanical: { tcs: 'off', throttleFeather: 0, differential: { type: 'lsd', lock: .45, preloadNm: 35 },
        steering: { roadAngleDeg: 36, driftAngleDeg: 48 } },
      pedals: { throttleRise: 5.5 },
    },
  },
  rwd_street: {
    name: 'RWD street / LSD', description: '250 hp, street LSD and 42-degree steering.', extends: 'rwd_box_drift',
    overrides: { mechanical: { engine: { torqueNm: 350, clutchTorqueNm: 500 }, differential: { type: 'lsd', lock: .4, preloadNm: 40 },
      steering: { roadAngleDeg: 38, driftAngleDeg: 42 } } },
  },
  rwd_drift: {
    name: 'RWD drift build', description: '380 hp, high-lock LSD and 55-degree angle kit.', extends: 'rwd_street',
    overrides: { mechanical: { engine: { torqueNm: 510, clutchTorqueNm: 700 }, differential: { type: 'lsd', lock: .7, preloadNm: 70 },
      steering: { roadAngleDeg: 34, driftAngleDeg: 55 }, suspension: { rearSpring: 32000, rearAntiRoll: 14000 } } },
  },
  rwd_high_power: {
    name: 'RWD high power / welded', description: '550+ hp, welded diff; throttle discipline matters.', extends: 'rwd_drift',
    overrides: { mechanical: { engine: { torqueNm: 750, clutchTorqueNm: 950 }, differential: { type: 'welded', lock: 1 } } },
  },
} satisfies Record<string, HandlingPreset>;

export type HandlingPresetId = keyof typeof HANDLING_PRESETS;

export const DEFAULT_HANDLING_PRESET: HandlingPresetId = "fwd_worn_sedan";

export function isHandlingPresetId(id: string): id is HandlingPresetId {
  return Object.hasOwn(HANDLING_PRESETS, id);
}
