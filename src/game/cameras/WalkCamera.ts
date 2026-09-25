import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DEFAULT_WALK_CAMERA, type WalkCameraConfig } from "../characters/WalkConfig";
import type { GameSystem } from "../engine/types";
import { CollisionGroup, type PhysicsWorld } from "../physics/PhysicsWorld";

const DEG = Math.PI / 180;
const WALLS = { collideWith: CollisionGroup.STATIC };

export type WalkCameraTarget = {
  /** Feet. */
  readonly position: Vector3;
  readonly forward: Vector3;
};

export interface WalkCameraInput {
  /** −1..1 orbit. */
  readonly lookX: number;
}

/**
 * Third-person camera for walking. It drives the scene's one gameplay camera (the chase
 * camera's), so post effects, clip planes and the active camera never change hands.
 *
 * The player steers the orbit (right stick, Q/E); movement is relative to it, so the view
 * never swings by itself. The camera follows the player closely and is pulled in front of
 * any wall between the player's head and where it wants to be.
 *
 * Only updates while `active`; `PlayerModes` switches it with the chase camera.
 */
export class WalkCamera implements GameSystem {
  readonly name = "walkCamera";
  active = false;
  /** Heading the camera looks along. Walking input is relative to this. */
  yaw = 0;
  private config: WalkCameraConfig;
  private readonly focus = new Vector3();
  private readonly desired = new Vector3();
  private readonly head = new Vector3();

  constructor(
    readonly camera: UniversalCamera,
    private readonly target: WalkCameraTarget,
    private readonly world: PhysicsWorld,
    private readonly input?: WalkCameraInput,
    config: WalkCameraConfig = DEFAULT_WALK_CAMERA,
  ) {
    this.config = config;
  }

  setConfig(config: WalkCameraConfig): void {
    this.config = config;
  }

  /** Jump straight behind the player, looking along `yaw` (defaults to where they face). */
  snap(yaw = Math.atan2(this.target.forward.x, this.target.forward.z)): void {
    this.yaw = yaw;
    this.focus.copyFrom(this.target.position);
    this.place();
  }

  update(dt: number): void {
    if (!this.active) return;
    const c = this.config;
    this.yaw = wrapAngle(this.yaw + (this.input?.lookX ?? 0) * c.orbitSpeedDeg * DEG * dt);
    const k = 1 - Math.exp(-c.follow * dt);
    this.focus.addInPlace(this.target.position.subtract(this.focus).scaleInPlace(k));
    this.place();
  }

  private place(): void {
    const c = this.config;
    const { focus, desired, head } = this;
    head.set(focus.x, focus.y + c.lookHeight, focus.z);
    desired.set(
      focus.x - Math.sin(this.yaw) * c.distance,
      focus.y + c.height,
      focus.z - Math.cos(this.yaw) * c.distance,
    );

    const hit = this.world.raycast(head, desired, WALLS);
    if (hit) {
      const full = Vector3.Distance(head, desired);
      const t = Math.max(c.minDistance, hit.hitDistance - c.wallPadding) / full;
      Vector3.LerpToRef(head, desired, Math.min(1, t), desired);
    }

    this.camera.position.copyFrom(desired);
    this.camera.setTarget(head);
    this.camera.fov = c.fovDeg * DEG;
  }
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}
