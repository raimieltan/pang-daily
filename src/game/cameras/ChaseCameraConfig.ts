/**
 * Chase camera feel, as data. Rates are per second and frame-rate independent
 * (exponential smoothing: after 1/rate seconds ~63% of a change has been followed).
 * Distances in metres, angles in degrees.
 */

/** A value that blends from `slow` at a standstill to `fast` at `ChaseCameraConfig.topSpeed`. */
export type SpeedRange = { slow: number; fast: number };

export type ChaseCameraConfig = {
  /** m/s at which every `SpeedRange` reaches `fast`. */
  topSpeed: number;
  /** How quickly the speed-driven values chase the car's speed. Low = a gentle pull-back on launch, no pumping on lift-off. */
  speedFollow: number;

  /** Camera to car, along the ground. */
  distance: SpeedRange;
  /** Camera above the car's origin. */
  height: SpeedRange;
  /** Vertical field of view. Keep the range small: a big swing reads as a lens effect, not speed. */
  fovDeg: SpeedRange;
  /** Aim point above the car's origin. */
  lookHeight: number;
  /** Aim this far ahead of the car, so the road ahead fills the frame at speed. */
  lookAhead: SpeedRange;

  /**
   * How quickly the camera swings in behind the car. Lower = more of a slide stays visible.
   * Faster at speed so quick direction changes don't leave the camera looking at the verge.
   */
  headingFollow: SpeedRange;
  /** The camera never trails the car's heading by more than this, so spins and 180s stay readable. */
  maxHeadingLagDeg: number;
  /**
   * 0..1: how much the aim point leans from the camera's heading toward the car's.
   * The camera lags behind a turn; this points the view into the corner (toward the exit) instead of the outside wall.
   */
  cornerLead: number;

  /** How quickly the camera follows the car up and down. Low enough to swallow kerbs and bumps. */
  verticalFollow: number;
  /** Hard limit on that vertical lag, so drops and jumps never lose the car. */
  maxVerticalLag: number;
  /** How quickly the camera tilts with the road's pitch. Slow, so bumps and landings don't nod the view. */
  slopeFollow: number;
  /** 0..1 share of the road's pitch the camera tilts with. 0 = always level; 1 = rides the slope exactly. */
  slopeInfluence: number;

  /** Full right-stick look turns the camera this far around the car. */
  lookYawDeg: number;
  /** How quickly look-around moves and springs back. */
  lookFollow: number;

  nearClip: number;
  farClip: number;
};

export const DEFAULT_CHASE_CAMERA: ChaseCameraConfig = {
  topSpeed: 45,
  speedFollow: 1.8,

  distance: { slow: 5.6, fast: 6.8 },
  height: { slow: 2.0, fast: 1.75 },
  fovDeg: { slow: 52, fast: 60 },
  lookHeight: 1.0,
  lookAhead: { slow: 2.5, fast: 6 },

  headingFollow: { slow: 3.5, fast: 5 },
  maxHeadingLagDeg: 40,
  cornerLead: 0.35,

  verticalFollow: 6,
  maxVerticalLag: 1.2,
  slopeFollow: 2.5,
  slopeInfluence: 0.6,

  lookYawDeg: 120,
  lookFollow: 8,

  nearClip: 0.1,
  farClip: 2000,
};
