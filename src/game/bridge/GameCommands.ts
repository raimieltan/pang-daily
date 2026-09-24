/**
 * React → Game command surface.
 *
 * React calls these intents; the runtime decides how to apply them.
 * Gameplay commands (spawnAt, startRace, enterVehicle, ...) get added here
 * as their systems land.
 */
import type { SceneId } from "../scenes";

export interface GameCommands {
  pause(): void;
  resume(): void;
  /** Tears down the current scene and builds `sceneId` (re-creates it if already active). */
  switchScene(sceneId: SceneId): void;
}
