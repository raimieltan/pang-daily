import { RACE_REWARDS } from './balance';
/** Deterministic rival thresholds; money is shared with runtime route views. */
export const RACE_ECONOMY = [
  {
    "id": "barangay_sprint",
    "checkpoints": 3,
    "rivalTimeMs": 19465,
    "minimumTimeMs": 2577,
    "npcId": "casey",
    "rivalVehicleId": "casey_daily"
  },
  {
    "id": "kyo_block_lap",
    "checkpoints": 4,
    "rivalTimeMs": 44787,
    "minimumTimeMs": 5987,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "terrace_sprint",
    "checkpoints": 3,
    "rivalTimeMs": 141605,
    "minimumTimeMs": 21576,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "pahuway_descent",
    "checkpoints": 3,
    "rivalTimeMs": 93336,
    "minimumTimeMs": 19572,
    "npcId": "casey",
    "rivalVehicleId": "casey_daily"
  },
  {
    "id": "the_wall",
    "checkpoints": 5,
    "rivalTimeMs": 160417,
    "minimumTimeMs": 27428,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "midnight_run",
    "checkpoints": 6,
    "rivalTimeMs": 323069,
    "minimumTimeMs": 62193,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "alimodian_maasin",
    "checkpoints": 5,
    "rivalTimeMs": 384462,
    "minimumTimeMs": 59675,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "maasin_alimodian",
    "checkpoints": 5,
    "rivalTimeMs": 384673,
    "minimumTimeMs": 59721,
    "npcId": null,
    "rivalVehicleId": null
  }
].map(race => ({ ...race, prizePhp: RACE_REWARDS[race.id as keyof typeof RACE_REWARDS] }));
export const raceEconomy = (id: string) => RACE_ECONOMY.find(race => race.id === id);
/** On-road finish order for physical rivals; the fixed benchmark is legacy fallback. */
export function raceOutcome(finish: boolean, playerElapsedMs: number,
  opponentElapsedMs: number | null | undefined, benchmarkMs: number): 'dnf' | 'win' | 'loss' {
  if (!finish) return 'dnf';
  const rival = opponentElapsedMs === undefined ? benchmarkMs : opponentElapsedMs;
  return rival === null || playerElapsedMs < rival ? 'win' : 'loss';
}
