import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSystem } from "../engine/types";

const DEG = Math.PI / 180;

export type GarageTarget = {
  /** Car origin at road level. */
  readonly position: Vector3;
  /** Car forward axis in world space. */
  readonly forward: Vector3;
};

/** First static hit between two points, or null. Keeps the camera out of walls and roofs. */
export type GarageRaycast = (from: Vector3, to: Vector3) => Vector3 | null;

/** Orbit around the car: yaw 0 looks at its nose, 90° at its right side; pitch is elevation. */
type Shot = { yaw: number; pitch: number; distance: number; aimHeight: number; spin?: number };

/** One framing per Talyer tab, so the part being edited is in view. */
const SHOTS: Record<string, Shot> = {
  repairs: { yaw: 35 * DEG, pitch: 12 * DEG, distance: 6.2, aimHeight: .75 },
  suspension: { yaw: 90 * DEG, pitch: 3 * DEG, distance: 5.4, aimHeight: .45 },
  tires: { yaw: 90 * DEG, pitch: 3 * DEG, distance: 5.4, aimHeight: .45 },
  exterior: { yaw: 150 * DEG, pitch: 14 * DEG, distance: 6.4, aimHeight: .8 },
  paint: { yaw: 45 * DEG, pitch: 10 * DEG, distance: 6.5, aimHeight: .7, spin: 12 * DEG },
  performance: { yaw: 25 * DEG, pitch: 20 * DEG, distance: 5.8, aimHeight: .8 },
  tuning: { yaw: 25 * DEG, pitch: 20 * DEG, distance: 5.8, aimHeight: .8 },
};

/** The Talyer panel's width plus margin, in CSS pixels; the car is framed in the space left of it. */
const PANEL_PX = 432;
const MIN_DISTANCE = 3;
const MAX_DISTANCE = 12;

/**
 * Showroom framing while the Talyer panel is open, layered over the walking camera like
 * ChapterCamera. Each tab has a shot; dragging orbits and scrolling zooms until the tab changes.
 */
export class GarageCamera implements GameSystem {
  readonly name = "garageCamera";
  private section = "repairs";
  private weight = 0;
  private yaw = SHOTS.repairs.yaw;
  private pitch = SHOTS.repairs.pitch;
  private distance = SHOTS.repairs.distance;
  private aimHeight = SHOTS.repairs.aimHeight;
  /** Set once the player drags or zooms; the tab's shot resumes on the next tab change. */
  private manual = false;
  private spin = 0;
  private snapNext = true;
  private dragging = false;
  private readonly aim = new Vector3();
  private readonly eye = new Vector3();
  private readonly release: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly camera: UniversalCamera,
    private readonly car: GarageTarget,
    private readonly raycast: GarageRaycast,
    private readonly open: () => boolean,
    private readonly reducedMotion: () => boolean,
  ) {
    const observer = scene.onPointerObservable.add((info) => {
      if (!this.open()) { this.dragging = false; return; }
      const event = info.event as PointerEvent & WheelEvent;
      if (info.type === PointerEventTypes.POINTERDOWN) this.dragging = true;
      else if (info.type === PointerEventTypes.POINTERUP) this.dragging = false;
      else if (info.type === PointerEventTypes.POINTERMOVE && this.dragging) this.drag(event.movementX ?? 0, event.movementY ?? 0);
      else if (info.type === PointerEventTypes.POINTERWHEEL) this.zoom(event.deltaY ?? 0);
    });
    this.release = () => scene.onPointerObservable.remove(observer);
  }

  /** Talyer tab now open; resets any dragged view to that tab's shot. */
  setSection(section: string): void {
    this.section = SHOTS[section] ? section : "repairs";
    this.manual = false;
    this.spin = 0;
  }

  /** Orbit by a pointer movement, in pixels. */
  drag(dx: number, dy: number): void {
    this.takeOver();
    this.yaw -= dx * .008;
    this.pitch = Math.max(-2 * DEG, Math.min(60 * DEG, this.pitch + dy * .006));
  }

  /** Zoom by a wheel delta; positive moves away. */
  zoom(delta: number): void {
    this.takeOver();
    this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.distance * Math.exp(delta * .001)));
  }

  update(dt: number): void {
    const open = this.open(), still = this.reducedMotion();
    if (!open && this.weight === 0) { this.snapNext = true; return; }
    this.weight = still ? (open ? 1 : 0) : this.weight + ((open ? 1 : 0) - this.weight) * (1 - Math.exp(-5 * dt));
    if (!open && this.weight < .002) { this.weight = 0; this.snapNext = true; return; }

    if (!this.manual) {
      const shot = SHOTS[this.section];
      if (shot.spin && !still) this.spin += shot.spin * dt;
      const targetYaw = shot.yaw + this.spin;
      // Glide between shots the short way round; cut when opening or under reduced motion.
      const blend = this.snapNext || still ? 1 : 1 - Math.exp(-4 * dt);
      const turn = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
      this.yaw += turn * blend;
      this.pitch += (shot.pitch - this.pitch) * blend;
      this.distance += (shot.distance - this.distance) * blend;
      this.aimHeight += (shot.aimHeight - this.aimHeight) * blend;
    }
    this.snapNext = false;
    this.frame();
  }

  private takeOver(): void {
    this.manual = true;
    this.snapNext = false;
  }

  /** Places the eye on the orbit, clear of walls, with the car left of the panel. */
  private frame(): void {
    const { position, forward } = this.car;
    const f = new Vector3(forward.x, 0, forward.z).normalize();
    const right = new Vector3(f.z, 0, -f.x);
    const around = f.scale(Math.cos(this.yaw)).addInPlace(right.scale(Math.sin(this.yaw)));
    this.aim.set(position.x, position.y + this.aimHeight, position.z);
    const offset = around.scale(this.distance * Math.cos(this.pitch)).addInPlace(new Vector3(0, this.distance * Math.sin(this.pitch), 0));
    this.eye.copyFrom(this.aim).addInPlace(offset);
    const hit = this.raycast(this.aim, this.eye);
    if (hit) {
      const clear = hit.subtract(this.aim);
      const length = clear.length();
      this.eye.copyFrom(this.aim).addInPlace(clear.scaleInPlace(Math.max(1.5, length - .3) / Math.max(length, 1e-6)));
    }
    // Aim to the right of the car by the panel's share of the view, so the car sits in the open space.
    const view = this.aim.subtract(this.eye).normalize();
    const screenRight = new Vector3(view.z, 0, -view.x).normalize();
    const canvas = this.scene.getEngine().getRenderingCanvas();
    const width = canvas?.clientWidth ?? 0;
    const share = width > 900 ? PANEL_PX / width : 0;
    const halfWidth = Math.tan(this.camera.fov / 2) * this.scene.getEngine().getAspectRatio(this.camera) * Vector3.Distance(this.eye, this.aim);
    const aim = this.aim.add(screenRight.scaleInPlace(halfWidth * share));

    const w = this.weight;
    Vector3.LerpToRef(this.camera.position, this.eye, w, this.camera.position);
    const live = this.camera.getTarget();
    this.camera.setTarget(Vector3.Lerp(live, aim, w));
    this.camera.fov = this.camera.fov * (1 - w) + .8 * w;
  }

  dispose(): void {
    this.release();
  }
}
