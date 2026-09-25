/**
 * Game → React event channel.
 *
 * Carries derived, low-frequency state only (see TECH_ARCHITECTURE §4–5).
 * Never emit per-frame physics or transform data through here.
 */
import type { GraphicsSettings } from "../rendering/LightingConfig";
import type { SceneId } from "../scenes";
import type { GameCommandName } from "./GameCommands";
import type {
  DialogueId,
  FrameCost,
  LocationChange,
  RaceResult,
  RaceStanding,
  RenderStats,
  SpawnPointId,
  VehicleDebugInfo,
  VehicleSummary,
  VehicleTelemetry,
} from "./types";

export type GameEventMap = {
  ready: void;
  error: { message: string };
  paused: { paused: boolean };
  statsUpdated: { fps: number };
  sceneLoading: { sceneId: SceneId };
  sceneReady: { sceneId: SceneId };
  /** A command was refused (unknown id, wrong scene, already running, ...). */
  commandRejected: { command: GameCommandName; reason: string };
  playerSpawned: { spawnPointId: SpawnPointId };
  /** Throttled and change-only; see SummaryPublisher. */
  vehicleStateUpdated: VehicleSummary;
  /** Handling debug readout, ~10 Hz while a car is driving. */
  vehicleTelemetry: VehicleTelemetry;
  vehicleDebugInfo: VehicleDebugInfo;
  /** Entered or left a hub location's area. */
  locationEntered: LocationChange;
  locationExited: LocationChange;
  /** The car left the playable area (or fell through) and was put back on the road. */
  playerReturned: LocationChange;
  /** Current graphics settings; sent on scene setup and after every change. */
  graphicsState: GraphicsSettings;
  /** ~1 Hz frame cost readout while a night scene runs. */
  renderStats: RenderStats;
  /** Result of `runGraphicsBenchmark`: frame cost with post effects off vs the current settings. */
  graphicsBenchmark: {
    settings: GraphicsSettings;
    off: FrameCost;
    on: FrameCost;
    postCostMs: number;
    postGpuCostMs: number | null;
  };
  raceStarted: RaceStanding;
  /** Emitted when the player's position changes, not every frame. */
  raceStandingChanged: RaceStanding;
  raceFinished: RaceResult;
  dialogueTriggered: { dialogueId: DialogueId };
};

export type GameEventName = keyof GameEventMap;

export type GameEventListener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

export type EmitArgs<K extends GameEventName> = GameEventMap[K] extends void ? [] : [GameEventMap[K]];

/** Subscribe-only view handed to React, so the UI can never fake game events. */
export interface GameEventSource {
  on<K extends GameEventName>(event: K, listener: GameEventListener<K>): () => void;
}

export class GameEvents implements GameEventSource {
  private listeners = new Map<GameEventName, Set<GameEventListener<never>>>();

  on<K extends GameEventName>(event: K, listener: GameEventListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends GameEventName>(event: K, ...args: EmitArgs<K>): void {
    const set = this.listeners.get(event) as Set<GameEventListener<K>> | undefined;
    set?.forEach((listener) => listener(args[0] as GameEventMap[K]));
  }

  clear(): void {
    this.listeners.clear();
  }
}
