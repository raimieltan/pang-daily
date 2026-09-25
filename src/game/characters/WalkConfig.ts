/**
 * On-foot feel, as data. Metres, seconds, degrees. Rates are per second and frame-rate
 * independent (after 1/rate seconds ~63% of a change has been followed).
 *
 * Walking exists to get from the parked car to a counter or a bench: one speed, no sprint,
 * no jump, no stamina (TECH_ARCHITECTURE §16).
 */
export type WalkConfig = {
  /** Full-stick speed. */
  walkSpeed: number;
  /** How quickly speed follows the stick, both speeding up and stopping. */
  acceleration: number;
  /** How fast the body turns to face where it is going. */
  turnSpeedDeg: number;

  capsuleHeight: number;
  capsuleRadius: number;
  /** Kerbs and single steps are walked up; anything taller blocks. */
  maxStepHeight: number;
  /** Steepest walkable slope. */
  maxSlopeDeg: number;
};

export type WalkCameraConfig = {
  /** Camera to player, along the ground. */
  distance: number;
  /** Camera above the player's feet. */
  height: number;
  /** Aim point above the player's feet. */
  lookHeight: number;
  fovDeg: number;
  /** Full right stick / Q-E orbit speed. */
  orbitSpeedDeg: number;
  /** How quickly the camera follows the player. High enough that the player never drifts in frame. */
  follow: number;
  /** Gap kept between the camera and a wall it gets pushed in by. */
  wallPadding: number;
  /** Never pulled in closer than this, so a wall behind never puts the camera inside the head. */
  minDistance: number;
};

export const DEFAULT_WALK: WalkConfig = {
  walkSpeed: 3.2,
  acceleration: 12,
  turnSpeedDeg: 540,

  capsuleHeight: 1.7,
  capsuleRadius: 0.3,
  maxStepHeight: 0.3,
  maxSlopeDeg: 45,
};

export const DEFAULT_WALK_CAMERA: WalkCameraConfig = {
  distance: 4.2,
  height: 2.3,
  lookHeight: 1.4,
  fovDeg: 55,
  orbitSpeedDeg: 150,
  follow: 14,
  wallPadding: 0.25,
  minDistance: 0.8,
};
