import { Engine } from "@babylonjs/core/Engines/engine";
import { GameBridge, type GameCommands, type GameEventSource } from "../bridge";
import { INITIAL_SCENE, scenes, type SceneId } from "../scenes";
import { SceneManager } from "./SceneManager";
import { GameAudio } from "../audio/GameAudio";
import { loadVehicleSession } from "../maintenance/sessionStorage";
import { loadJobSession } from "../jobs/jobStorage";
import { HUB_JOBS } from "../jobs/hubJobs";
import { loadInventorySession, loadMarketplaceSession } from "../marketplace/marketStorage";
import { MarketplaceService } from "../marketplace/MarketplaceService";

const STATS_INTERVAL_MS = 500;
/** Clamp so a backgrounded tab doesn't produce one giant simulation step on return. */
const MAX_FRAME_DT_SECONDS = 0.1;
/** `next dev` only: keep the wallet topped up so paid features can be tried freely. */
const DEV_WALLET_PHP = 1_000_000;

export type GameRuntimeOptions = {
  initialScene?: SceneId;
};

/**
 * Owns the Babylon engine, resize handling, render loop, and scene manager.
 * All frame-level state lives here; React only sees the bridge's UI half
 * (`events` to subscribe, `commands` to send intents).
 *
 * Lifecycle: constructor (engine + resize) → start() (loop + initial scene) → dispose().
 */
export class GameRuntime {
  private readonly bridge = new GameBridge();
  readonly events: GameEventSource = this.bridge.ui.events;
  readonly commands: GameCommands = this.bridge.ui.commands;

  private readonly engine: Engine;
  private readonly audio: GameAudio;
  private readonly scenes: SceneManager<SceneId>;
  private readonly market: MarketplaceService;
  private readonly resizeObserver: ResizeObserver;
  private readonly initialScene: SceneId;
  private paused = false;
  private lastStatsAt = 0;
  private started = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: GameRuntimeOptions = {}) {
    this.initialScene = options.initialScene ?? INITIAL_SCENE;
    this.engine = new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" }, true);
    this.audio = new GameAudio(this.events);

    const { emit, handle } = this.bridge.runtime;
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* The runtime still keeps session state in memory. */ }
    const session = loadVehicleSession(storage);
    const devTopUp = DEV_WALLET_PHP - session.snapshot().walletPhp;
    if (process.env.NODE_ENV === "development" && devTopUp > 0) {
      session.earn(Math.round(devTopUp * 100) / 100, { kind: "dev_grant", description: "Dev cash top-up", source: "dev" });
    }

    // The phone outlives scenes, so the marketplace is runtime-wide like pause.
    this.market = new MarketplaceService(this.bridge.runtime, loadMarketplaceSession(session, loadInventorySession(storage), storage));
    this.scenes = new SceneManager(this.engine, scenes, this.bridge.runtime, {
      onLoading: (sceneId) => emit("sceneLoading", { sceneId }),
      onReady: (sceneId) => emit("sceneReady", { sceneId }),
      onError: (sceneId, error) => {
        const reason = error instanceof Error ? error.message : String(error);
        emit("error", { message: `Scene "${sceneId}" failed: ${reason}` });
      },
    }, session, loadJobSession(session, HUB_JOBS, storage), this.market);

    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);

    // Runtime-wide commands; gameplay commands are registered by scene systems.
    handle("pause", () => this.setPaused(true));
    handle("resume", () => this.setPaused(false));
    handle("switchScene", ({ sceneId }) => void this.scenes.switchTo(sceneId));
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.engine.runRenderLoop(() => this.frame());
    this.bridge.runtime.emit("ready");
    void this.scenes.switchTo(this.initialScene);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.audio.dispose();
    this.market.dispose();
    this.engine.stopRenderLoop();
    this.scenes.dispose();
    this.engine.dispose();
    this.bridge.dispose();
  }

  private frame(): void {
    const scene = this.scenes.activeScene;
    if (scene) {
      scene.metadata ??= {};
      scene.metadata.analogPaused = this.paused;
    }
    if (!this.paused) {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, MAX_FRAME_DT_SECONDS);
      this.scenes.update(dt);
      this.market.update(dt);
    }
    // Keep rendering while paused so resizes and camera orbit still draw; systems stay frozen.
    this.scenes.render();

    const now = performance.now();
    if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = now;
      this.bridge.runtime.emit("statsUpdated", { fps: Math.round(this.engine.getFps()) });
    }
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.bridge.runtime.emit("paused", { paused });
  }
}
