import type { WeatherType } from "../weather/Weather";
/**
 * Game → React event channel.
 *
 * Carries derived, low-frequency state only (see TECH_ARCHITECTURE §4–5).
 * Never emit per-frame physics or transform data through here.
 */
import type { GraphicsSettings, TimeOfDay } from "../rendering/LightingConfig";
import type { SceneId } from "../scenes";
import type { GameCommandName } from "./GameCommands";
import type {
  DialogueId,
  FrameCost,
  InteractionPrompt,
  InteractionTriggered,
  LocationChange,
  PlayerModeChange,
  RaceResult,
  RaceStanding,
  RenderStats,
  SpawnPointId,
  VehicleDebugInfo,
  VehicleSummary,
  VehicleTelemetry,
} from "./types";

export type GameEventMap = {
  fuelPanel: boolean;
  fuelQuote: import('../maintenance/FuelSystem').FuelQuote | null;
  fuelPurchased: import('../maintenance/FuelSystem').FuelReceipt;
  ready: void;
  /** Open job board listings; null closes it. */
  jobBoard: import('../jobs/jobViews').JobBoardView | null;
  /** The job in progress (accepted or active); null when there is none. On change, ~1 Hz while timed. */
  jobState: import('../jobs/jobViews').JobView | null;
  /** A run ended: completed (paid), failed or abandoned. */
  jobEnded: import('../jobs/jobViews').JobResult;
  /** Buy & sell board while the phone app is open; null closes it. Never carries hidden condition. */
  marketplace: import('../../game-core/marketplace/MarketplaceSession').MarketplaceView | null;
  partPurchased: import('../../game-core/marketplace/MarketplaceSession').PartPurchase;
  partInspected: import('../../game-core/marketplace/MarketplaceSession').PartInspection;
  /** Wheels on the player car, their fitment and listed effects. On scene setup and after every swap. */
  wheelsState: import('../vehicles/WheelSystem').WheelsView;
  /** Body parts on the player car, how they look and what they do. On scene setup and after every swap. */
  exteriorState: import('../vehicles/ExteriorSystem').ExteriorView;
  exteriorInventory: import('../vehicles/ExteriorSystem').ExteriorInventoryView;
  customizationState: import('../vehicles/CustomizationSystem').CustomizationView;
  maintenanceState: import('../../game-core/maintenance/VehicleSession').MaintenanceSummary;
  repairQuote: import('../../game-core/maintenance/VehicleSession').RepairQuote | null;
  repairCompleted: import('../../game-core/maintenance/VehicleSession').RepairReceipt;
  /** Ground distance travelled on foot, sampled at 10 Hz for footsteps. */
  footsteps: { distance: number };
  npcSound: import('../traffic/RoadsidePeople').NpcSound;
  vehicleImpact: { strength: number };
  horn: void;
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
  /** Current lighting mood; sent on scene setup and after every change. */
  timeOfDay: { time: TimeOfDay };
  weatherChanged: { weather: WeatherType };
  /** ~1 Hz frame cost readout while a lit scene runs. */
  renderStats: RenderStats;
  /** Result of `runGraphicsBenchmark`: frame cost with post effects off vs the current settings. */
  graphicsBenchmark: {
    settings: GraphicsSettings;
    off: FrameCost;
    on: FrameCost;
    postCostMs: number;
    postGpuCostMs: number | null;
  };
  raceProgress: import("../races/Race").RaceProgress;
  raceIntro: { title: string } | null;
  raceStarted: RaceStanding;
  /** Emitted when the player's position changes, not every frame. */
  raceStandingChanged: RaceStanding;
  raceFinished: RaceResult;
  dialogueTriggered: { dialogueId: DialogueId };
  /** Got in or out of the car. Sent on scene setup and after every change. */
  playerModeChanged: PlayerModeChange;
  /** The on-foot prompt changed; null hides it. Sent on change only. */
  interactionPromptChanged: { prompt: InteractionPrompt | null };
  interactionTriggered: InteractionTriggered;
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
