import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";
import { DEFAULT_CHASE_CAMERA, type ChaseCameraConfig, type SpeedRange } from "./ChaseCameraConfig";

const DEG = Math.PI / 180;

export type ChaseTarget = {
  readonly position: Vector3;
  /** Car forward axis in world space. */
  readonly forward: Vector3;
  /** Signed forward speed, m/s. */
  readonly speed: number;
};

export interface ChaseCameraInput {
  /** −1..1 look-around. */
  readonly lookX: number;
}

/**
 * Arcade chase camera, tuned by `ChaseCameraConfig`.
 *
 * Horizontally it is locked to the car, so the car never jitters in frame. Everything else is
 * smoothed separately: heading (with a capped lag, so slides and understeer read as the car
 * turning against the frame), height (swallows bumps), road pitch (follows slopes, not kerbs),
 * and the speed-driven distance / FOV / look-ahead (a gentle pull-back as the car gets going).
 */
export class ChaseCamera implements GameSystem {
  readonly name = "chaseCamera";
  readonly camera: UniversalCamera;
  private config: ChaseCameraConfig;
  private yaw = 0;
  private pitch = 0;
  private focusY = 0;
  private speedBlend = 0;
  private look = 0;
  private readonly aim = new Vector3();

  constructor(
    scene: Scene,
    private readonly target: ChaseTarget,
    config: ChaseCameraConfig = DEFAULT_CHASE_CAMERA,
    private readonly input?: ChaseCameraInput,
  ) {
    this.config = config;
    this.camera = new UniversalCamera("chaseCamera", Vector3.Zero(), scene);
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
    this.snap();
  }

  setConfig(config: ChaseCameraConfig): void {
    this.config = config;
  }

  /** Jump straight to the settled pose behind the target (spawn, reset, recover). */
  snap(): void {
    this.recenter();
    this.pitch = this.targetPitch();
    this.focusY = this.target.position.y;
    this.speedBlend = this.targetSpeedBlend();
    this.place();
  }

  /** Swing straight back behind the car and drop any look-around; the rest keeps its smoothing. */
  recenter(): void {
    this.yaw = this.targetYaw();
    this.look = 0;
  }

  update(dt: number): void {
    const c = this.config;
    const p = this.target.position;

    this.speedBlend += (this.targetSpeedBlend() - this.speedBlend) * follow(c.speedFollow, dt);
    const s = this.speedBlend;

    const maxLag = c.maxHeadingLagDeg * DEG;
    const lag = wrapAngle(this.targetYaw() - this.yaw);
    const remaining = lag * (1 - follow(blend(c.headingFollow, s), dt));
    this.yaw = this.targetYaw() - clamp(remaining, -maxLag, maxLag);

    this.pitch += (this.targetPitch() - this.pitch) * follow(c.slopeFollow, dt);
    this.focusY += (p.y - this.focusY) * follow(c.verticalFollow, dt);
    this.focusY = clamp(this.focusY, p.y - c.maxVerticalLag, p.y + c.maxVerticalLag);

    const lookTarget = clamp(this.input?.lookX ?? 0, -1, 1) * c.lookYawDeg * DEG;
    this.look += (lookTarget - this.look) * follow(c.lookFollow, dt);

    this.place();
  }

  dispose(): void {
    this.camera.dispose();
  }

  private place(): void {
    const c = this.config;
    const s = this.speedBlend;
    const p = this.target.position;
    const pitch = this.pitch * c.slopeInfluence;
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    const yaw = this.yaw + this.look;
    const distance = blend(c.distance, s);
    this.camera.position.set(
      p.x - Math.sin(yaw) * cosPitch * distance,
      this.focusY - sinPitch * distance + blend(c.height, s),
      p.z - Math.cos(yaw) * cosPitch * distance,
    );

    const aimYaw = yaw + wrapAngle(this.targetYaw() - this.yaw) * c.cornerLead;
    const ahead = blend(c.lookAhead, s);
    this.aim.set(
      p.x + Math.sin(aimYaw) * cosPitch * ahead,
      this.focusY + sinPitch * ahead + c.lookHeight,
      p.z + Math.cos(aimYaw) * cosPitch * ahead,
    );
    this.camera.setTarget(this.aim);

    this.camera.fov = blend(c.fovDeg, s) * DEG;
    this.camera.minZ = c.nearClip;
    this.camera.maxZ = c.farClip;
  }

  /** Heading on the ground plane. Keeps the last heading while the car points straight up or down. */
  private targetYaw(): number {
    const f = this.target.forward;
    return f.x * f.x + f.z * f.z > 1e-6 ? Math.atan2(f.x, f.z) : this.yaw;
  }

  /** Nose-up angle of the car, i.e. the road's slope along its heading. */
  private targetPitch(): number {
    return Math.asin(clamp(this.target.forward.y, -1, 1));
  }

  /** 0..1, eased so the low-speed end (parking, pulling away) barely moves the camera. */
  private targetSpeedBlend(): number {
    const t = clamp(Math.abs(this.target.speed) / this.config.topSpeed, 0, 1);
    return t * t * (3 - 2 * t);
  }
}

/** Share of the remaining gap to close this frame for a per-second `rate`. */
function follow(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

function blend(range: SpeedRange, s: number): number {
  return range.slow + (range.fast - range.slow) * s;
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
