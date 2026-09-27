/** Shared rewards and deterministic rival finish thresholds for authored M2/M3 races. */
export const RACE_ECONOMY = [
  {
    "id": "barangay_sprint",
    "prizePhp": 400,
    "checkpoints": 3,
    "rivalTimeMs": 19465,
    "minimumTimeMs": 2577,
    "npcId": "casey",
    "rivalVehicleId": "casey_daily"
  },
  {
    "id": "kyo_block_lap",
    "prizePhp": 400,
    "checkpoints": 4,
    "rivalTimeMs": 44787,
    "minimumTimeMs": 5987,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "terrace_sprint",
    "prizePhp": 700,
    "checkpoints": 3,
    "rivalTimeMs": 141605,
    "minimumTimeMs": 21576,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "pahuway_descent",
    "prizePhp": 1100,
    "checkpoints": 3,
    "rivalTimeMs": 93336,
    "minimumTimeMs": 19572,
    "npcId": "casey",
    "rivalVehicleId": "casey_daily"
  },
  {
    "id": "the_wall",
    "prizePhp": 1600,
    "checkpoints": 5,
    "rivalTimeMs": 160417,
    "minimumTimeMs": 27428,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "midnight_run",
    "prizePhp": 3000,
    "checkpoints": 6,
    "rivalTimeMs": 323069,
    "minimumTimeMs": 62193,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "alimodian_maasin",
    "prizePhp": 0,
    "checkpoints": 5,
    "rivalTimeMs": 384462,
    "minimumTimeMs": 59675,
    "npcId": null,
    "rivalVehicleId": null
  },
  {
    "id": "maasin_alimodian",
    "prizePhp": 0,
    "checkpoints": 5,
    "rivalTimeMs": 384673,
    "minimumTimeMs": 59721,
    "npcId": null,
    "rivalVehicleId": null
  }
] as const;
export const raceEconomy = (id: string) => RACE_ECONOMY.find(race => race.id === id);
