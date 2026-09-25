/**
 * React → Game command surface.
 *
 * React calls intents on `GameCommands`; they are routed through a `CommandBus`
 * to whichever runtime system registered a handler. Commands are fire-and-forget:
 * outcomes come back as events (`commandRejected`, `raceStarted`, ...), so React
 * never depends on engine internals or synchronous return values.
 */
import type { GraphicsSettings, TimeOfDay } from "../rendering/LightingConfig";
import type { SceneId } from "../scenes";
import type { RaceId, SpawnPointId } from "./types";

export type GameCommandMap = {
  pause: void;
  resume: void;
  /** Tears down the current scene and builds `sceneId` (re-creates it if already active). */
  switchScene: { sceneId: SceneId };
  spawnAt: { spawnPointId: SpawnPointId };
  startRace: { raceId: RaceId };
  /** Put the player car back on its current spawn point, at rest. */
  resetVehicle: void;
  setHandlingPreset: { presetId: string };
  /** Applies `quality`'s preset (if given), then any individual overrides. */
  setGraphics: Partial<GraphicsSettings>;
  /** Measures frame cost with post effects off, then on, for `seconds` each (default 4). */
  runGraphicsBenchmark: { seconds?: number };
  /** Switches the lighting mood (morning, afternoon, night). */
  setTimeOfDay: { time: TimeOfDay };
};

export type GameCommandName = keyof GameCommandMap;

type CommandArgs<K extends GameCommandName> = GameCommandMap[K] extends void ? [] : [GameCommandMap[K]];

/** Return `{ rejected }` to refuse a command; returning nothing means it was accepted. */
export type CommandOutcome = void | { rejected: string };

export type CommandHandler<K extends GameCommandName> = (payload: GameCommandMap[K]) => CommandOutcome;

export type DispatchResult = { ok: true } | { ok: false; reason: string };

/**
 * Routes each command to at most one handler. Systems own their commands:
 * the race system handles `startRace`, the scene handles `spawnAt`, and so on.
 */
export class CommandBus {
  private handlers = new Map<GameCommandName, CommandHandler<never>>();

  handle<K extends GameCommandName>(command: K, handler: CommandHandler<K>): () => void {
    if (this.handlers.has(command)) throw new Error(`Command "${command}" already has a handler`);
    this.handlers.set(command, handler);
    return () => {
      if (this.handlers.get(command) === handler) this.handlers.delete(command);
    };
  }

  dispatch<K extends GameCommandName>(command: K, ...args: CommandArgs<K>): DispatchResult {
    const handler = this.handlers.get(command) as CommandHandler<K> | undefined;
    if (!handler) return { ok: false, reason: `"${command}" is not available right now` };
    try {
      const outcome = handler(args[0] as GameCommandMap[K]);
      return outcome ? { ok: false, reason: outcome.rejected } : { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** The ergonomic, React-facing form of `GameCommandMap`. */
export interface GameCommands {
  pause(): void;
  resume(): void;
  switchScene(sceneId: SceneId): void;
  spawnAt(spawnPointId: SpawnPointId): void;
  startRace(raceId: RaceId): void;
  resetVehicle(): void;
  setHandlingPreset(presetId: string): void;
  setGraphics(settings: Partial<GraphicsSettings>): void;
  runGraphicsBenchmark(seconds?: number): void;
  setTimeOfDay(time: TimeOfDay): void;
}

type Dispatch = <K extends GameCommandName>(command: K, ...args: CommandArgs<K>) => void;

export function createGameCommands(dispatch: Dispatch): GameCommands {
  return {
    pause: () => dispatch("pause"),
    resume: () => dispatch("resume"),
    switchScene: (sceneId) => dispatch("switchScene", { sceneId }),
    spawnAt: (spawnPointId) => dispatch("spawnAt", { spawnPointId }),
    startRace: (raceId) => dispatch("startRace", { raceId }),
    resetVehicle: () => dispatch("resetVehicle"),
    setHandlingPreset: (presetId) => dispatch("setHandlingPreset", { presetId }),
    setGraphics: (settings) => dispatch("setGraphics", settings),
    runGraphicsBenchmark: (seconds) => dispatch("runGraphicsBenchmark", { seconds }),
    setTimeOfDay: (time) => dispatch("setTimeOfDay", { time }),
  };
}
