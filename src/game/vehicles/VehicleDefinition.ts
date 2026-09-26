import { BANWA_DALAGAN_1996, type VehicleDefinition } from "@/game-core/vehicles";
import type { HandlingPresetId } from "./handling/presets";

/**
 * Physics representation of a car, in car space (+z forward, +x right, y = 0 at the
 * ground contact). Deliberately independent of the visual mesh so the model can be
 * swapped without touching handling, and the collision can be tuned without Blender.
 */
export type VehicleCollisionConfig = {
  /** Body box. Its bottom sits above the ground; the wheel spheres carry the car. */
  body: { width: number; height: number; length: number; bottomY: number; centerZ: number };
  /**
   * One sphere per wheel. Spheres roll over mesh seams and slope changes smoothly,
   * where a box corner would catch.
   */
  wheels: { halfTrack: number; frontZ: number; rearZ: number; radius: number };
  /**
   * Low, so kerbs and landings don't tip the car. `z` should sit where the handling
   * config's `frontWeight` puts the CG: the physics body yaws about this point.
   */
  centerOfMass: { y: number; z: number };
  /** Multiplies pitch/roll inertia. The handling model owns yaw; pitch/roll only need to look plausible. */
  tipInertiaScale: number;
  angularDamping: number;
  /** How far below a wheel's contact point the ground still counts as touching. */
  suspensionTravel: number;
};

/**
 * A game-core `VehicleDefinition` (identity, specs, model contract, condition hooks) bound to
 * the Babylon runtime's tuning: handling preset, collision shapes, HUD gearing.
 */
export type VehicleRuntimeDefinition = {
  spec: VehicleDefinition;
  handlingPreset: HandlingPresetId;
  collision: VehicleCollisionConfig;
  /** HUD-only gear readout: gear = number of thresholds passed. */
  gearThresholdsKmh: readonly number[];
};

export const STARTER_SEDAN: VehicleRuntimeDefinition = {
  spec: BANWA_DALAGAN_1996,
  handlingPreset: "fwd_worn_sedan",
  collision: {
    // Matches banwa_dalagan_1996_modular.glb: body 1.69 × 4.33 m, roof at 1.40 m, wheels r 0.30 at ±0.728.
    body: { width: 1.66, height: 1.1, length: 4.3, bottomY: 0.25, centerZ: 0 },
    wheels: { halfTrack: 0.728, frontZ: 1.28, rearZ: -1.22, radius: 0.3 },
    // 62% front weight on a 2.50 m wheelbase.
    centerOfMass: { y: 0.35, z: 0.33 },
    tipInertiaScale: 3,
    angularDamping: 0.5,
    suspensionTravel: 0.2,
  },
  gearThresholdsKmh: [1, 30, 55, 85, 120],
};
