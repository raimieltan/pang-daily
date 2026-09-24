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

export type RaceStanding = {
  raceId: RaceId;
  /** 1-based. */
  position: number;
  racers: number;
};

export type RaceResult = RaceStanding & {
  timeMs: number;
};
