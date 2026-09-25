import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { RuntimePort } from "../bridge";
import type { VehicleSession } from "../../game-core/maintenance/VehicleSession";
import type { JobSession } from "../../game-core/jobs/JobSession";

/**
 * A unit of frame-level logic that lives inside one scene
 * (vehicles, traffic, chunk streaming, cameras, ...).
 * Systems update in the order they were added and dispose in reverse.
 */
export interface GameSystem {
  readonly name: string;
  /** Called once per frame while the scene is active and the game is not paused. */
  update?(dtSeconds: number): void;
  /** Called when the owning scene is torn down. Release anything not owned by the Scene. */
  dispose?(): void;
}

/** Handed to a scene's `setup`. The Scene itself is created and disposed by the SceneManager. */
export interface SceneContext {
  readonly engine: AbstractEngine;
  readonly scene: Scene;
  /** Aborted when this scene is superseded or the runtime is disposed. Pass to async loaders. */
  readonly signal: AbortSignal;
  /** Scene-scoped bridge access: command handlers registered here are removed on teardown. */
  readonly bridge: RuntimePort;
  readonly session: VehicleSession;
  readonly jobs: JobSession;
  addSystem<T extends GameSystem>(system: T): T;
}

export interface SceneDefinition {
  /** Populate `ctx.scene` and register systems. May be async (asset loading). */
  setup(ctx: SceneContext): void | Promise<void>;
}
