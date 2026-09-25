/**
 * Shared vocabulary of the bridge. Ids are plain strings because races, spawn
 * points, and dialogue are data-driven content (TECH_ARCHITECTURE §17).
 */
export type RaceId = string;
export type SpawnPointId = string;
export type DialogueId = string;

/** HUD-level vehicle readout. Derived values only — never wheel/suspension/transform data. */
export type VehicleSummary = {
  speedKmh: number;
  /** -1 reverse, 0 neutral, 1+ forward gears. */
  gear: number;
};

/**
 * Handling debug readout for tuning (TECH_ARCHITECTURE §9–10). Throttled like the HUD
 * summary; values are rounded for display, not for replaying the simulation.
 */
export type VehicleTelemetry = {
  speedKmh: number;
  /** Road-wheel angle and the speed-limited lock it can reach right now, degrees. */
  steerDeg: number;
  maxSteerDeg: number;
  /** Pedals as applied (after ramps and reverse remapping), 0..1. */
  throttle: number;
  brake: number;
  reversing: boolean;
  /** 1 - actual/kinematic yaw rate: >0 pushing wide, <0 rotating more than steered. */
  understeer: number;
  bodySlipDeg: number;
  frontSlipDeg: number;
  rearSlipDeg: number;
  /** Share of each axle's grip in use (1 = at the limit). */
  frontGripUse: number;
  rearGripUse: number;
  /** 0..1 lift-off rotation envelope. */
  liftOff: number;
  /** Share of weight moved onto the front axle (negative = rearward). */
  loadShift: number;
  /** Share of requested drive the traction limit/assist removed. */
  tractionCut: number;
  /** Counter-yaw from the stability assist, rad/s². */
  stabilityYaw: number;
  /** 0..1 handbrake effect after the speed window. */
  handbrake: number;
  longAccelG: number;
  latAccelG: number;
  groundedWheels: number;
  held: boolean;
};

export type HandlingPresetInfo = { id: string; name: string; description: string };

/** What a driving scene offers the debug UI. Sent once per scene, and again when the preset changes. */
export type VehicleDebugInfo = {
  presetId: string;
  presets: readonly HandlingPresetInfo[];
  spawnPoints: readonly SpawnPointId[];
};

export type RaceStanding = {
  raceId: RaceId;
  /** 1-based. */
  position: number;
  racers: number;
};

export type RaceResult = RaceStanding & {
  timeMs: number;
};
