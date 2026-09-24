/**
 * Public entry point of the game runtime. React imports only from here
 * (dynamically, so Babylon never loads during SSR).
 */
import { GameRuntime } from "./engine/GameRuntime";
import type { GameCommands, GameEventSource } from "./bridge";

export type GameHandle = {
  events: GameEventSource;
  commands: GameCommands;
  start(): void;
  dispose(): void;
};

export function createGame(canvas: HTMLCanvasElement): GameHandle {
  return new GameRuntime(canvas);
}

export type {
  GameCommands,
  GameEventMap,
  GameEventName,
  GameEventSource,
  RaceResult,
  RaceStanding,
  VehicleSummary,
} from "./bridge";
export type { SceneId } from "./scenes";
