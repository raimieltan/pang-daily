import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Scene } from "@babylonjs/core/scene";
import type { RuntimePort } from "../bridge";
import type { GameSystem, SceneContext, SceneDefinition } from "./types";
import { VehicleSession } from "../../game-core/maintenance/VehicleSession";
import { JobSession } from "../../game-core/jobs/JobSession";
import { HUB_JOBS } from "../jobs/hubJobs";

export type SceneManagerHooks<Id extends string> = {
  onLoading?(id: Id): void;
  onReady?(id: Id): void;
  onError?(id: Id, error: unknown): void;
};

type SceneSlot<Id extends string> = {
  id: Id;
  scene: Scene;
  systems: GameSystem[];
  /** Command handler registrations to undo on teardown. */
  releases: (() => void)[];
  controller: AbortController;
  ready: boolean;
};

/**
 * Creates, switches, updates, and disposes scenes. At most one scene is alive:
 * switching tears down the current scene (aborting it if still loading) before
 * building the next, so browser memory never holds two worlds at once.
 */
export class SceneManager<Id extends string> {
  private current: SceneSlot<Id> | null = null;
  private disposed = false;

  constructor(
    private readonly engine: AbstractEngine,
    private readonly definitions: Readonly<Record<Id, SceneDefinition>>,
    private readonly bridge: RuntimePort,
    private readonly hooks: SceneManagerHooks<Id> = {},
    private readonly session = new VehicleSession(),
    private readonly jobs = new JobSession(session, HUB_JOBS),
    private readonly market: SceneContext["market"] = { useWorkshop: () => () => {} },
  ) {}

  get activeId(): Id | null {
    return this.current?.ready ? this.current.id : null;
  }

  get activeScene(): Scene | null {
    return this.current?.ready ? this.current.scene : null;
  }

  /** Resolves once the scene is ready, superseded, or failed. Failures are reported via `onError`. */
  async switchTo(id: Id): Promise<void> {
    if (this.disposed) return;
    this.teardown();

    const slot: SceneSlot<Id> = {
      id,
      scene: new Scene(this.engine),
      systems: [],
      releases: [],
      controller: new AbortController(),
      ready: false,
    };
    this.current = slot;
    this.hooks.onLoading?.(id);

    const ctx: SceneContext = {
      engine: this.engine,
      scene: slot.scene,
      signal: slot.controller.signal,
      session: this.session,
      jobs: this.jobs,
      market: {
        useWorkshop: (workshop) => {
          const release = this.market.useWorkshop(workshop);
          slot.releases.push(release);
          return release;
        },
      },
      bridge: {
        // A superseded scene (e.g. still finishing async setup) must not leak events.
        emit: (event, ...args) => {
          if (this.current === slot) this.bridge.emit(event, ...args);
        },
        handle: (command, handler) => {
          // Nor may it claim commands after teardown: nothing would ever release them.
          if (this.current !== slot) return () => {};
          const release = this.bridge.handle(command, handler);
          slot.releases.push(release);
          return release;
        },
      },
      addSystem: (system) => {
        slot.systems.push(system);
        return system;
      },
    };

    try {
      await this.definitions[id].setup(ctx);
      if (this.current !== slot) return;
      await slot.scene.whenReadyAsync();
    } catch (error) {
      if (this.current !== slot) return;
      this.teardown();
      this.hooks.onError?.(id, error);
      return;
    }

    if (this.current !== slot) return;
    slot.ready = true;
    this.hooks.onReady?.(id);
  }

  update(dtSeconds: number): void {
    if (!this.current?.ready) return;
    for (const system of this.current.systems) system.update?.(dtSeconds);
  }

  render(): void {
    if (this.current?.ready) this.current.scene.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
  }

  private teardown(): void {
    const slot = this.current;
    if (!slot) return;
    this.current = null;
    slot.controller.abort();
    for (const release of slot.releases) release();
    for (let i = slot.systems.length - 1; i >= 0; i--) slot.systems[i].dispose?.();
    slot.scene.dispose();
  }
}
