import { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { GameEvents, type GameCommands } from "../bridge";
import { createBootScene } from "../world/createBootScene";

const STATS_INTERVAL_MS = 500;

/**
 * Owns the Babylon engine, active scene, and render loop.
 * All frame-level state lives here; React only sees `events` and `commands`.
 */
export class GameRuntime {
  readonly events = new GameEvents();
  readonly commands: GameCommands;

  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly resizeObserver: ResizeObserver;
  private paused = false;
  private lastStatsAt = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" }, true);
    this.scene = createBootScene(this.engine, canvas);

    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);

    this.commands = {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
    };
  }

  start(): void {
    this.engine.runRenderLoop(() => this.frame());
    this.events.emit("ready");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
    this.events.clear();
  }

  private frame(): void {
    if (!this.paused) this.scene.render();

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
