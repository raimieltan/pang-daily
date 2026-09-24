import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";

export type ChaseTarget = {
  readonly position: Vector3;
  /** Car forward axis in world space. */
  readonly forward: Vector3;
};

export type ChaseCameraOptions = {
  distance: number;
  height: number;
  /** Point looked at, above the car's origin. */
  lookHeight: number;
  /** How far ahead of the car to aim, so the road ahead fills the frame. */
  lookAhead: number;
  /** Per-second rate the camera swings behind the car. Lower = more of the slide stays visible. */
  headingFollow: number;
  positionFollow: number;
  fov: number;
};

const DEFAULTS: ChaseCameraOptions = {
  distance: 6.2,
  height: 2.1,
  lookHeight: 1.1,
  lookAhead: 3,
  headingFollow: 4,
  positionFollow: 12,
  fov: 0.9,
};

/**
 * Arcade chase camera. Follows the car's heading (not its velocity) with a lag, so
 * understeer and lift-off rotation read as the car turning against the frame
 * instead of the camera swinging with it.
 */
export class ChaseCamera implements GameSystem {
  readonly name = "chaseCamera";
  readonly camera: UniversalCamera;
  private readonly options: ChaseCameraOptions;
  private readonly heading = new Vector3(0, 0, 1);
  private readonly desired = new Vector3();
  private readonly look = new Vector3();

  constructor(
    scene: Scene,
    private readonly target: ChaseTarget,
    options: Partial<ChaseCameraOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
    this.camera = new UniversalCamera("chaseCamera", Vector3.Zero(), scene);
    this.camera.fov = this.options.fov;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 2000;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
    this.snap();
  }

  /** Jump straight behind the target (spawn, reset). */
  snap(): void {
    this.flatForward(this.heading);
    this.place(1);
  }

  update(dt: number): void {
    const forward = this.flatForward(this.desired);
    Vector3.LerpToRef(this.heading, forward, 1 - Math.exp(-this.options.headingFollow * dt), this.heading);
    this.heading.normalize();
    this.place(1 - Math.exp(-this.options.positionFollow * dt));
  }

  private place(blend: number): void {
    const { distance, height, lookHeight, lookAhead } = this.options;
    const p = this.target.position;
    this.desired.set(p.x - this.heading.x * distance, p.y + height, p.z - this.heading.z * distance);
    Vector3.LerpToRef(this.camera.position, this.desired, blend, this.camera.position);
    this.look.set(p.x + this.heading.x * lookAhead, p.y + lookHeight, p.z + this.heading.z * lookAhead);
    this.camera.setTarget(this.look);
  }

  /** Target forward on the ground plane, so pitching over crests doesn't bob the camera. */
  private flatForward(result: Vector3): Vector3 {
    const f = this.target.forward;
    result.set(f.x, 0, f.z);
    return result.lengthSquared() > 1e-6 ? result.normalize() : result.copyFrom(this.heading);
  }

  dispose(): void {
    this.camera.dispose();
  }
}
