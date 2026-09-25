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
  FrameCost,
  GameCommands,
  GameEventMap,
  GameEventName,
  GameEventSource,
  HandlingPresetInfo,
  LocationChange,
  RaceResult,
  RaceStanding,
  RenderStats,
  VehicleDebugInfo,
  VehicleSummary,
  VehicleTelemetry,
} from "./bridge";
export type { SceneId } from "./scenes";
export type { GraphicsQuality, GraphicsSettings, TimeOfDay } from "./rendering/LightingConfig";
export { TIMES_OF_DAY } from "./rendering/LightingConfig";
