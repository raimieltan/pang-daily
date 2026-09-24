import { SummaryPublisher, type DialogueId, type RaceId, type RuntimePort, type VehicleSummary } from "../bridge";
import type { GameSystem } from "../engine/types";

export type SprintDefinition = {
  lengthMeters: number;
  rivalSpeedsMps: readonly number[];
  startDialogue: DialogueId;
  finishDialogue: DialogueId;
};

export const DEBUG_SPRINTS: Readonly<Record<RaceId, SprintDefinition>> = {
  debug_sprint: {
    lengthMeters: 400,
    rivalSpeedsMps: [24, 27, 31],
    startDialogue: "debug_sprint_start",
    finishDialogue: "debug_sprint_finish",
  },
};

const TOP_SPEED_MPS = 45;
const ACCELERATION_MPS2 = 9;
const COAST_DECELERATION_MPS2 = 6;
/** Upshift points in km/h; gear = number of thresholds passed. */
const GEAR_THRESHOLDS_KMH = [1, 35, 65, 95, 125, 150];

type RunningSprint = {
  raceId: RaceId;
  definition: SprintDefinition;
  distance: number;
  rivalDistances: number[];
  position: number;
  elapsed: number;
};

export type DebugSprintSystem = GameSystem & {
  readonly speedMps: number;
  readonly racing: boolean;
};

/**
 * Stand-in for the real vehicle controller + race systems: fakes a car
 * accelerating down a straight against constant-speed rivals.
 * Exists to exercise the bridge end to end — `startRace` in, derived
 * vehicle/race/dialogue events out — without any Babylon dependency.
 */
export function createDebugSprintSystem(
  bridge: RuntimePort,
  sprints: Readonly<Record<RaceId, SprintDefinition>> = DEBUG_SPRINTS,
): DebugSprintSystem {
  let speed = 0;
  let race: RunningSprint | null = null;
  const vehicle = new SummaryPublisher<VehicleSummary>((summary) => bridge.emit("vehicleStateUpdated", summary));

  const summarize = (): VehicleSummary => {
    const speedKmh = Math.round(speed * 3.6);
    return { speedKmh, gear: GEAR_THRESHOLDS_KMH.filter((kmh) => speedKmh >= kmh).length };
  };

  const standing = (r: RunningSprint) => ({
    raceId: r.raceId,
    position: r.position,
    racers: r.rivalDistances.length + 1,
  });

  bridge.handle("startRace", ({ raceId }) => {
    const definition = sprints[raceId];
    if (!definition) return { rejected: `Unknown race "${raceId}"` };
    if (race) return { rejected: `Already racing "${race.raceId}"` };

    race = {
      raceId,
      definition,
      distance: 0,
      rivalDistances: definition.rivalSpeedsMps.map(() => 0),
      position: 1,
      elapsed: 0,
    };
    bridge.emit("raceStarted", standing(race));
    bridge.emit("dialogueTriggered", { dialogueId: definition.startDialogue });
  });

  function finish(r: RunningSprint): void {
    race = null;
    bridge.emit("raceFinished", { ...standing(r), timeMs: Math.round(r.elapsed * 1000) });
    bridge.emit("dialogueTriggered", { dialogueId: r.definition.finishDialogue });
  }

  return {
    name: "debugSprint",
    get speedMps() {
      return speed;
    },
    get racing() {
      return race !== null;
    },
    update(dt) {
      if (race) {
        speed = Math.min(TOP_SPEED_MPS, speed + ACCELERATION_MPS2 * (1 - speed / TOP_SPEED_MPS) * dt);
        race.elapsed += dt;
        race.distance += speed * dt;
        const { rivalSpeedsMps } = race.definition;
        race.rivalDistances = race.rivalDistances.map((d, i) => d + rivalSpeedsMps[i] * dt);

        const player = race.distance;
        const position = 1 + race.rivalDistances.filter((d) => d > player).length;
        if (position !== race.position) {
          race.position = position;
          bridge.emit("raceStandingChanged", standing(race));
        }
        if (race.distance >= race.definition.lengthMeters) finish(race);
      } else {
        speed = Math.max(0, speed - COAST_DECELERATION_MPS2 * dt);
      }
      vehicle.tick(dt, summarize);
    },
  };
}
