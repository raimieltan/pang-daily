import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsRaycastResult, type IRaycastQuery } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";

export type PhysicsWorldOptions = {
  gravity?: Vector3;
  /** Fixed simulation step, seconds. Vehicle handling is tuned against 1/120. */
  fixedStep?: number;
  /** Steps allowed per frame before the simulation drops time instead of spiralling. */
  maxStepsPerFrame?: number;
};

type StepHook = (dt: number) => void;

/** Shape filter bits. Vehicle ground probes query `STATIC` only, so they never hit a car. */
export const CollisionGroup = {
  STATIC: 1 << 0,
  VEHICLE: 1 << 1,
} as const;

const DEFAULT_GRAVITY = new Vector3(0, -9.81, 0);

/**
 * Engine-owned Havok world for one scene, stepped at a fixed rate by the game
 * loop (not by `scene.render`), so it freezes on pause and is frame-rate independent.
 *
 * Per fixed step: `beforeStep` hooks (controllers write velocities) → Havok step →
 * `afterStep` hooks (read contacts, finish teleports).
 */
export class PhysicsWorld implements GameSystem {
  readonly name = "physics";
  readonly fixedStep: number;
  readonly gravity: Vector3;
  private readonly maxSteps: number;
  private readonly engine: PhysicsEngine;
  private readonly before = new Set<StepHook>();
  private readonly after = new Set<StepHook>();
  private readonly rayResult = new PhysicsRaycastResult();
  private accumulator = 0;

  constructor(
    readonly scene: Scene,
    havok: HavokPhysicsWithBindings,
    options: PhysicsWorldOptions = {},
  ) {
    this.fixedStep = options.fixedStep ?? 1 / 120;
    this.maxSteps = options.maxStepsPerFrame ?? 8;
    this.gravity = (options.gravity ?? DEFAULT_GRAVITY).clone();
    scene.enablePhysics(this.gravity, new HavokPlugin(false, havok));
    // Stepped manually from `update`; the scene's own render-time step stays off.
    scene.physicsEnabled = false;
    this.engine = scene.getPhysicsEngine() as PhysicsEngine;
    this.engine.setTimeStep(this.fixedStep);
  }

  onBeforeStep(hook: StepHook): () => void {
    this.before.add(hook);
    return () => this.before.delete(hook);
  }

  onAfterStep(hook: StepHook): () => void {
    this.after.add(hook);
    return () => this.after.delete(hook);
  }

  update(dt: number): void {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxSteps) {
      this.step();
      this.accumulator -= this.fixedStep;
      steps++;
    }
    if (steps === this.maxSteps) this.accumulator = 0;
  }

  /** One fixed step. Exposed for tests and deterministic tooling. */
  step(): void {
    const dt = this.fixedStep;
    for (const hook of this.before) hook(dt);
    this.engine._step(dt);
    for (const hook of this.after) hook(dt);
  }

  /**
   * Closest hit between two points, or null. The result object is reused:
   * copy anything you need before the next raycast.
   */
  raycast(from: Vector3, to: Vector3, query?: IRaycastQuery): PhysicsRaycastResult | null {
    this.engine.raycastToRef(from, to, this.rayResult, query);
    return this.rayResult.hasHit ? this.rayResult : null;
  }

  dispose(): void {
    this.before.clear();
    this.after.clear();
    // The scene disposes the physics engine with itself.
  }
}
