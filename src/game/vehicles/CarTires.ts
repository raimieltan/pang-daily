import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ArcadeHandlingModel } from "./handling/ArcadeHandlingModel";
import {
  CORNER_IDS, STOCK_SETUP, SURFACE_TIRE, impactPuncture, isFlat, newAssembly, pressureRatio, stepAssembly, tireResponse,
  type WheelSetup, type CornerId, type TireAssembly, type TireEvent, type TireSession, type TireSurface,
} from "@/game-core/tires";

const SURFACE_INTERVAL = 0.1;
/** Impacts farther than this from every wheel centre can't reach a tire. */
const WHEEL_REACH_M = 1.1;

type Body = { readonly wheels: readonly { readonly id: string; readonly local: Vector3 }[]; toWorld(local: Vector3, out: Vector3): Vector3 };
type WheelVisual = { readonly id: string; readonly socket: TransformNode };

/**
 * One car's four simulated tires: the ground under each wheel, pressure and damage stepping, the
 * per-corner feed to the handling model, impact punctures and the flat/donut wheel look. Shared by
 * the player car (`TireSystem`, persisted) and race rivals (in-memory sessions).
 */
export class CarTires {
  readonly surfaces: TireSurface[] = ["asphalt", "asphalt", "asphalt", "asphalt"];
  private surfaceAge = Infinity;
  private readonly fittedIds: (string | null)[] = [null, null, null, null];
  private readonly tmp = new Vector3();

  constructor(
    readonly session: TireSession,
    private readonly vehicleId: () => string,
    private readonly body: Body,
    private readonly model: ArcadeHandlingModel,
    private readonly surfaceAt: (x: number, z: number) => TireSurface,
    private seed = 0x7123,
    /** The road wheel set and tread on this car (aftermarket rims, maintenance tire wear). */
    private readonly setup: () => WheelSetup = () => STOCK_SETUP,
  ) {}

  get car() { return this.session.vehicle(this.vehicleId()); }
  mounted(corner: CornerId) { return this.session.mounted(this.vehicleId(), corner); }

  /** Steps every mounted assembly by `dt`; returns the corners that produced events. */
  step(dt: number): { corner: CornerId; tire: TireAssembly; events: TireEvent[] }[] {
    this.surfaceAge += dt;
    if (this.surfaceAge >= SURFACE_INTERVAL) {
      this.surfaceAge = 0;
      this.body.wheels.forEach((wheel, i) => {
        this.body.toWorld(wheel.local, this.tmp);
        this.surfaces[i] = this.surfaceAt(this.tmp.x, this.tmp.z);
      });
    }
    const out: { corner: CornerId; tire: TireAssembly; events: TireEvent[] }[] = [];
    CORNER_IDS.forEach((corner, i) => {
      const tire = this.mounted(corner);
      if (!tire) return;
      if (this.model.config.mechanical) {
        const state = this.model.mechanics.wheels[i];
        tire.temperatureC = state.temperature;
        tire.thermalWear = state.wear;
      }
      const speed = this.model.corners[i].grounded ? this.model.corners[i].wheelSpeed : 0;
      const events = stepAssembly(tire, dt, speed, this.surfaces[i], this.random());
      if (events.length) out.push({ corner, tire, events });
    });
    this.apply();
    return out;
  }

  /** Pushes every corner's tire to the handling model. */
  apply() {
    const car = this.car;
    CORNER_IDS.forEach((corner, i) => {
      const tire = this.session.assembly(car.corners[corner]);
      const input = this.model.tires[i];
      input.installed = !!tire;
      input.raised = car.jacked === corner;
      if (tire) {
        Object.assign(input, tireResponse(tire, this.surfaces[i], this.setup()), {
          surfaceGrip: SURFACE_TIRE[this.surfaces[i]].grip, pressurePsi: tire.pressureKpa / 6.89476,
        });
        if (this.fittedIds[i] !== tire.id && this.model.config.mechanical) {
          const state = this.model.mechanics.wheels[i];
          state.temperature = tire.temperatureC ?? this.model.config.mechanical.tire.ambientC;
          state.wear = tire.thermalWear ?? 0;
        }
      }
      this.fittedIds[i] = tire?.id ?? null;
    });
  }

  /** A hard hit: the nearest wheel may puncture. Returns the corner and failure it caused. */
  impact(strength: number, point: Vector3 | null | undefined) {
    let corner: CornerId = CORNER_IDS[0], best = Infinity;
    this.body.wheels.forEach((wheel, i) => {
      this.body.toWorld(wheel.local, this.tmp);
      const d = point ? Vector3.DistanceSquared(point, this.tmp) : i;
      if (d < best) { best = d; corner = CORNER_IDS[i]; }
    });
    if (point && best > WHEEL_REACH_M ** 2) return null;
    const tire = this.mounted(corner);
    const failure = tire && impactPuncture(tire, strength, this.random());
    return failure ? { corner, failure } : null;
  }

  /**
   * Grip the driver can count on against what a fresh set of this car's own wheels gives on
   * asphalt (its line was planned for that): the weakest axle's average. 1 = as planned.
   */
  usableGrip(): number {
    const t = this.model.tires;
    const planned = tireResponse(newAssembly("planned"), "asphalt", { ...this.setup(), tread: 1, rimWear: 0 }).grip;
    const axle = (a: number, b: number) => ((t[a].installed ? t[a].grip : 0) + (t[b].installed ? t[b].grip : 0)) / 2;
    return Math.min(axle(0, 1), axle(2, 3)) / planned;
  }

  /** Squashes flats, shrinks donuts and hides empty hubs. */
  showWheels(wheels: readonly WheelVisual[]) {
    CORNER_IDS.forEach((corner, i) => {
      const wheel = wheels.find((w) => w.id === this.body.wheels[i].id);
      if (!wheel) return;
      const tire = this.mounted(corner);
      wheel.socket.setEnabled(!!tire);
      const squash = !tire ? 1 : isFlat(tire) ? 0.84 : 1 - 0.1 * Math.max(0, 0.8 - pressureRatio(tire));
      const donut = tire?.spec === "donut";
      const treadRadius = 1 - (tire?.thermalWear ?? 0) * .015;
      wheel.socket.scaling.set(donut ? 0.6 : 1, squash * (donut ? 0.86 : treadRadius), donut ? 0.86 : treadRadius);
    });
  }

  /** Mulberry32: deterministic hazard and impact rolls. */
  random() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
