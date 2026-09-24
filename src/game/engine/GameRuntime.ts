import { Engine } from "@babylonjs/core/Engines/engine";
import { GameEvents, type GameCommands } from "../bridge";
import { INITIAL_SCENE, scenes, type SceneId } from "../scenes";
import { SceneManager } from "./SceneManager";

const STATS_INTERVAL_MS = 500;
/** Clamp so a backgrounded tab doesn't produce one giant simulation step on return. */
const MAX_FRAME_DT_SECONDS = 0.1;

export type GameRuntimeOptions = {
  initialScene?: SceneId;
};

/**
 * Owns the Babylon engine, resize handling, render loop, and scene manager.
 * All frame-level state lives here; React only sees `events` and `commands`.
 *
 * Lifecycle: constructor (engine + resize) → start() (loop + initial scene) → dispose().
 */
export class GameRuntime {
  readonly events = new GameEvents();
  readonly commands: GameCommands;

  private readonly engine: Engine;
  private readonly scenes: SceneManager<SceneId>;
  private readonly resizeObserver: ResizeObserver;
  private readonly initialScene: SceneId;
  private paused = false;
  private lastStatsAt = 0;
  private started = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: GameRuntimeOptions = {}) {
    this.initialScene = options.initialScene ?? INITIAL_SCENE;
    this.engine = new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" }, true);

    this.scenes = new SceneManager(this.engine, scenes, {
      onLoading: (sceneId) => this.events.emit("sceneLoading", { sceneId }),
      onReady: (sceneId) => this.events.emit("sceneReady", { sceneId }),
      onError: (sceneId, error) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.events.emit("error", { message: `Scene "${sceneId}" failed: ${reason}` });
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);

    this.commands = {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      switchScene: (sceneId) => void this.scenes.switchTo(sceneId),
    };
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.engine.runRenderLoop(() => this.frame());
    this.events.emit("ready");
    void this.scenes.switchTo(this.initialScene);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop();
    this.scenes.dispose();
    this.engine.dispose();
    this.events.clear();
  }

  private frame(): void {
    if (!this.paused) {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, MAX_FRAME_DT_SECONDS);
      this.scenes.update(dt);
    }
    // Keep rendering while paused so resizes and camera orbit still draw; systems stay frozen.
    this.scenes.render();

    const now = performance.now();
    if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = now;
      this.events.emit("statsUpdated", { fps: Math.round(this.engine.getFps()) });
    }
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.events.emit("paused", { paused });
  }
}
