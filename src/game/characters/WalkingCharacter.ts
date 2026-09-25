import type { Material } from "@babylonjs/core/Materials/material";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
  type CharacterSurfaceInfo,
} from "@babylonjs/core/Physics/v2/characterController";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";
import { CollisionGroup, type PhysicsWorld } from "../physics/PhysicsWorld";
import type { VehiclePose } from "../vehicles/VehicleBody";
import { DEFAULT_WALK, type WalkConfig } from "./WalkConfig";
import { CharacterVisual } from "./CharacterVisual";

const DEG = Math.PI / 180;
const DOWN = new Vector3(0, -1, 0);
const GROUND_PROBE = { collideWith: CollisionGroup.STATIC };
/** Ground search above/below a requested placement, like `VehicleBody.place`. */
const PLACE_PROBE_HEIGHT = 3;
const PLACE_PROBE_DEPTH = 30;
/** Gap left under the feet on placement; the controller settles it on the first steps. */
const PLACE_CLEARANCE = 0.05;

/** What moves the character: −1..1 camera-relative stick, and the camera's heading. */
export type WalkIntent = {
  readonly moveX: number;
  readonly moveY: number;
};
export type WalkView = { readonly yaw: number };

/**
 * The player on foot: a Havok character controller (capsule, collides with chunk colliders
 * and the parked car, walks up kerbs) plus an articulated low-poly figure.
 *
 * The controller and its physics body only exist while the player is walking: `spawn` builds
 * them, `despawn` disposes them, so getting in and out of the car any number of times never
 * leaves a stray body behind. The figure is built once and hidden while driving.
 *
 * Movement is stepped in the physics world's fixed step, reading `intent` and `view` directly,
 * so this frame's stick moves this frame's character.
 */
export class WalkingCharacter implements GameSystem {
  readonly name = "walkingCharacter";
  readonly mesh: Mesh;
  /** Feet, on the ground. Valid while spawned; the last position otherwise. */
  readonly position = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  private controller: PhysicsCharacterController | null = null;
  private heading = 0;
  private config: WalkConfig;
  private readonly releaseStep: () => void;
  private readonly velocity = new Vector3();
  private readonly beforeMove = new Vector3();
  private readonly visual: CharacterVisual;
  private travelSpeed = 0;
  private readonly surface: CharacterSurfaceInfo = {
    isSurfaceDynamic: false,
    supportedState: CharacterSupportedState.UNSUPPORTED,
    averageSurfaceNormal: new Vector3(),
    averageSurfaceVelocity: new Vector3(),
    averageAngularSurfaceVelocity: new Vector3(),
  };

  constructor(
    private readonly scene: Scene,
    private readonly world: PhysicsWorld,
    material: Material,
    private readonly intent: WalkIntent,
    private readonly view: WalkView,
    config: WalkConfig = DEFAULT_WALK,
  ) {
    this.config = config;
    this.visual = new CharacterVisual(scene, material, config.capsuleHeight);
    this.mesh = this.visual.root;
    this.mesh.setEnabled(false);
    this.releaseStep = world.onBeforeStep((dt) => this.step(dt));
  }

  get active(): boolean {
    return this.controller !== null;
  }

  get capsuleRadius(): number {
    return this.config.capsuleRadius;
  }

  get capsuleHeight(): number {
    return this.config.capsuleHeight;
  }

  /** Ground speed, m/s. */
  get speed(): number {
    return this.controller ? this.travelSpeed : 0;
  }

  setConfig(config: WalkConfig): void {
    this.config = config;
    if (this.controller) configure(this.controller, config);
  }

  /**
   * Stands the character on the ground under `pose`, facing its heading. Builds the controller
   * if needed. Returns false (and changes nothing) when there is no ground there.
   */
  spawn(pose: VehiclePose): boolean {
    const feet = this.groundUnder(pose.position);
    if (!feet) return false;
    const centre = feet.clone();
    centre.y += this.config.capsuleHeight / 2 + PLACE_CLEARANCE;
    if (this.controller) {
      this.controller.setPosition(centre);
    } else {
      this.controller = new PhysicsCharacterController(
        centre,
        { capsuleHeight: this.config.capsuleHeight, capsuleRadius: this.config.capsuleRadius },
        this.scene,
      );
      configure(this.controller, this.config);
    }
    this.controller.setVelocity(Vector3.ZeroReadOnly);
    this.velocity.setAll(0);
    this.travelSpeed = 0;
    this.visual.reset();
    this.heading = pose.headingRad;
    this.sync();
    this.mesh.setEnabled(true);
    return true;
  }

  /** Same as `spawn`; named for `HubLocations`, which puts the player back on the map. */
  placeAt(pose: VehiclePose): boolean {
    return this.spawn(pose);
  }

  /** Removes the controller and its body, and hides the figure (the player got in the car). */
  despawn(): void {
    this.controller?.dispose();
    this.controller = null;
    this.velocity.setAll(0);
    this.travelSpeed = 0;
    this.visual.reset();
    this.mesh.setEnabled(false);
  }

  update(dt: number): void {
    if (this.controller) {
      this.sync();
      this.visual.update(dt, this.travelSpeed, this.surface.supportedState !== CharacterSupportedState.UNSUPPORTED);
    }
  }

  dispose(): void {
    this.releaseStep();
    this.despawn();
    this.mesh.dispose();
  }

  private step(dt: number): void {
    const cc = this.controller;
    if (!cc) return;
    const { walkSpeed, acceleration, turnSpeedDeg } = this.config;

    // Stick → world direction, relative to the camera. Diagonals don't go faster.
    let mx = this.intent.moveX;
    let my = this.intent.moveY;
    const length = Math.hypot(mx, my);
    if (length > 1) [mx, my] = [mx / length, my / length];
    const sin = Math.sin(this.view.yaw);
    const cos = Math.cos(this.view.yaw);
    const wantX = (sin * my + cos * mx) * walkSpeed;
    const wantZ = (cos * my - sin * mx) * walkSpeed;

    if (length < 0.001) {
      // Neutral input means stop, including the solver's previous horizontal momentum.
      // Exponential deceleration alone leaves a long tail of unwanted movement.
      this.velocity.x = this.velocity.z = 0;
    } else {
      const k = 1 - Math.exp(-acceleration * dt);
      this.velocity.x += (wantX - this.velocity.x) * k;
      this.velocity.z += (wantZ - this.velocity.z) * k;
    }

    if (Math.hypot(wantX, wantZ) > 0.05) {
      const maxTurn = turnSpeedDeg * DEG * dt;
      const delta = wrapAngle(Math.atan2(wantX, wantZ) - this.heading);
      this.heading += Math.max(-maxTurn, Math.min(maxTurn, delta));
    }

    cc.checkSupportToRef(dt, DOWN, this.surface);
    const velocity = cc.getVelocity();
    if (this.surface.supportedState === CharacterSupportedState.SUPPORTED) {
      // Walk along the ground: vertical speed follows the surface, so slopes don't launch or float.
      const n = this.surface.averageSurfaceNormal;
      const along = n.y > 1e-3 ? -(n.x * this.velocity.x + n.z * this.velocity.z) / n.y : 0;
      velocity.set(this.velocity.x, along, this.velocity.z);
    } else {
      velocity.set(this.velocity.x, velocity.y + this.world.gravity.y * dt, this.velocity.z);
    }
    cc.setVelocity(velocity);
    this.beforeMove.copyFrom(cc.getPosition());
    cc.integrate(dt, this.surface, this.world.gravity);
    const afterMove = cc.getPosition();
    this.travelSpeed = Math.hypot(afterMove.x - this.beforeMove.x, afterMove.z - this.beforeMove.z) / dt;
  }

  /** Controller → public position/forward and the figure. */
  private sync(): void {
    const cc = this.controller!;
    this.position.copyFrom(cc.getPosition());
    this.position.y -= this.config.capsuleHeight / 2;
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.mesh.position.copyFrom(this.position);
    this.mesh.rotation.y = this.heading;
  }

  private groundUnder(at: Vector3): Vector3 | null {
    const from = new Vector3(at.x, at.y + PLACE_PROBE_HEIGHT, at.z);
    const to = new Vector3(at.x, at.y - PLACE_PROBE_DEPTH, at.z);
    return this.world.raycast(from, to, GROUND_PROBE)?.hitPointWorld.clone() ?? null;
  }
}

function configure(cc: PhysicsCharacterController, config: WalkConfig): void {
  cc.maxStepHeight = config.maxStepHeight;
  cc.maxSlopeCosine = Math.cos(config.maxSlopeDeg * DEG);
  cc.maxCharacterSpeedForSolver = config.walkSpeed * 3;
  // A person never shoves a parked car around.
  cc.characterStrength = 0;
  cc.characterMass = 0;
  cc.shape.filterMembershipMask = CollisionGroup.CHARACTER;
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}
