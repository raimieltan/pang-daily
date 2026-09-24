/**
 * React → Game command surface.
 *
 * React calls these intents; the runtime decides how to apply them.
 * Gameplay commands (spawnAt, startRace, enterVehicle, ...) get added here
 * as their systems land.
 */
export interface GameCommands {
  pause(): void;
  resume(): void;
}
