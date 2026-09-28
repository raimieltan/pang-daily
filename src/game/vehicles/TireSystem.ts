import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { RuntimePort } from "../bridge";
import type { GameSystem } from "../engine/types";
import type { Interactable } from "../interaction/Interaction";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import type { PlayerModes } from "../player/PlayerModes";
import type { PlayerVehicle } from "./PlayerVehicle";
import {
  CORNER_IDS, CORNER_NAMES, TIRE_SPECS, impactPuncture, isFlat, isLowPressure, loadTireSession, nextCornerStep, performStep,
  pressureRatio, puncture, stepAssembly, stepLabel, tireResponse, type CornerId, type FailureState, type TireAssembly,
  type TireEvent, type TireSession, type TireSurface, type WheelChangeStep,
} from "@/game-core/tires";

type StoragePort = Pick<Storage, "getItem" | "setItem">;

export type TireStatus = {
  corners: { corner: CornerId; spec: string; failure: FailureState; pressureRatio: number; low: boolean; flat: boolean; installed: boolean }[];
  spare: string | null;
  jack: boolean;
  wrench: boolean;
  /** Advisory top speed while a donut is fitted (not enforced). */
  advisoryKph: number | null;
  jacked: CornerId | null;
  held: string | null;
  driveBlock: string | null;
};
export type TireEventPayload = {
  corner: CornerId | null;
  kind: "puncture" | "blowout" | "flat" | "destroyed" | "low_pressure" | "rim_damage" | "overspeed" | "service";
  text: string;
};
export type TireTelemetry = {
  corners: {
    corner: CornerId; spec: string; failure: FailureState; pressureKpa: number; health: number; rimDamage: number;
    surface: TireSurface; grip: number; slipScale: number; rollingResistance: number; installed: boolean; raised: boolean;
    grounded: boolean; normalLoadN: number; fx: number; fy: number; slipAngleDeg: number; slipRatio: number;
    wheelSpeed: number; driveN: number; brakeN: number; rollingN: number;
  }[];
};

const SURFACE_INTERVAL = 0.1;
const TELEMETRY_INTERVAL = 0.2;
const SAVE_INTERVAL = 5;
/** Soft ground the jack can't stand on. */
const SOFT: readonly TireSurface[] = ["grass"];

/**
 * The player car's four wheel assemblies at runtime: resolves the ground under each wheel, steps
 * pressure and damage, feeds each corner to the handling model, and runs the roadside wheel change.
 * All tire effects reach the car through per-corner grip, slip and drag: nothing here writes yaw
 * or the global `surfaceGrip`.
 */
export class TireSystem implements GameSystem {
  readonly name = "tires";
  readonly session: TireSession;
  private readonly surfaces: TireSurface[] = ["asphalt", "asphalt", "asphalt", "asphalt"];
  private surfaceAge = Infinity;
  private telemetryAge = 0;
  private saveAge = 0;
  private dirty = false;
  private lastStatus = "";
  private readonly overspeed = [false, false, false, false];
  private seed: number;
  private readonly releases: (() => void)[] = [];
  private readonly tmp = new Vector3();
  private jackMesh?: Mesh;

  constructor(
    private readonly bridge: RuntimePort,
    private readonly player: PlayerVehicle,
    /** On-foot modes for wheel-change prompts and blocking the driver's seat; absent in the test track. */
    private readonly modes: PlayerModes | undefined,
    private readonly surfaceAt: (x: number, z: number) => TireSurface,
    storage?: StoragePort | TireSession,
    seed = 0x7123,
  ) {
    this.session = storage && "vehicle" in storage ? storage : loadTireSession(storage as StoragePort | undefined);
    this.seed = seed;
    this.session.vehicle(player.id);
    this.releases.push(player.onImpact((strength, point) => this.impact(strength, point)));
    this.releases.push(bridge.handle("debugPuncture", ({ corner, failure }) => this.fail(corner, failure)));
    this.releases.push(bridge.handle("debugResetTires", () => this.resetVehicle()));
    if (modes) {
      modes.canEnter = () => this.session.driveBlock(this.player.id);
      this.releases.push(() => { modes.canEnter = undefined; });
    }
    this.apply();
  }

  private get car() { return this.session.vehicle(this.player.id); }

  /** Wheel-change and inspection prompts around the parked car. */
  readonly interactions = (): Interactable[] => {
    if (this.modes?.mode !== "walking" || this.player.speedKmh > 1) return [];
    const id = this.player.id;
    const { body } = this.player;
    const out: Interactable[] = [];
    body.wheels.forEach((wheel, i) => {
      const corner = CORNER_IDS[i];
      body.toWorld(wheel.local, this.tmp);
      const side = wheel.local.x < 0 ? -1 : 1;
      const x = this.tmp.x + body.right.x * side * 0.9, z = this.tmp.z + body.right.z * side * 0.9;
      const step = nextCornerStep(this.session, id, corner);
      const area = { kind: "circle" as const, x, z, radius: 0.85 };
      if (step) out.push({ id: `tire:${corner}:${step}`, action: "wheel_service", label: stepLabel(step, corner), area, priority: 14, target: `${corner}:${step}` });
      out.push({ id: `tire:${corner}:inspect`, action: "inspect_tire", label: `Inspect ${CORNER_NAMES[corner]} wheel`, area, priority: step ? 1 : 3, target: corner });
    });
    const trunkStep = this.trunkStep();
    if (trunkStep) {
      const length = this.player.definition.collision.body.length;
      const x = body.position.x - body.forward.x * (length / 2 + 0.6), z = body.position.z - body.forward.z * (length / 2 + 0.6);
      out.push({ id: `tire:trunk:${trunkStep}`, action: "wheel_service", label: stepLabel(trunkStep, null), area: { kind: "circle", x, z, radius: 1.1 }, priority: 15, target: `trunk:${trunkStep}` });
    }
    return out;
  };

  connect(interactions: InteractionSystem): void {
    this.releases.push(interactions.handle("wheel_service", (target) => {
      const [where, step] = (target.target ?? "").split(":") as [CornerId | "trunk", WheelChangeStep];
      const corner = where === "trunk" ? null : where;
      const outcome = performStep(this.session, this.player.id, step, corner, {
        speedKmh: this.player.speedKmh, softGround: corner ? SOFT.includes(this.surfaces[CORNER_IDS.indexOf(corner)]) : false,
      });
      if (outcome) return outcome;
      this.bridge.emit("tireEvent", { corner, kind: "service", text: stepLabel(step, corner) });
      this.apply();
    }));
    this.releases.push(interactions.handle("inspect_tire", (target) => {
      const corner = target.target as CornerId;
      this.bridge.emit("tireInspection", { corner, text: this.describe(corner) });
    }));
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const model = this.player.controller.model;
    this.surfaceAge += dt;
    if (this.surfaceAge >= SURFACE_INTERVAL) {
      this.surfaceAge = 0;
      this.player.body.wheels.forEach((wheel, i) => {
        this.player.body.toWorld(wheel.local, this.tmp);
        this.surfaces[i] = this.surfaceAt(this.tmp.x, this.tmp.z);
      });
    }
    let changed = false;
    CORNER_IDS.forEach((corner, i) => {
      const tire = this.session.mounted(this.player.id, corner);
      if (!tire) return;
      const speed = model.corners[i].grounded ? model.corners[i].wheelSpeed : 0;
      if (Math.abs(speed) > 0.05 || tire.leakKpaPerMin > 0) this.dirty = true;
      const events = stepAssembly(tire, dt, speed, this.surfaces[i], this.random());
      if (events.length) changed = this.report(corner, tire, events) || changed;
    });
    this.apply();
    this.saveAge += dt;
    if (changed || (this.dirty && this.saveAge >= SAVE_INTERVAL)) { this.session.save(); this.saveAge = 0; this.dirty = false; }
    this.publishStatus();
    this.telemetryAge += dt;
    if (this.telemetryAge >= TELEMETRY_INTERVAL) { this.telemetryAge = 0; this.bridge.emit("tireTelemetry", this.telemetry()); }
  }

  /** Pushes every corner's tire to the handling model and the visuals. */
  private apply() {
    const car = this.car;
    const model = this.player.controller.model;
    CORNER_IDS.forEach((corner, i) => {
      const tire = this.session.assembly(car.corners[corner]);
      const input = model.tires[i];
      input.installed = !!tire;
      input.raised = car.jacked === corner;
      if (tire) Object.assign(input, tireResponse(tire, this.surfaces[i]));
      this.visual(i, tire, input.raised);
    });
  }

  private visual(i: number, tire: TireAssembly | undefined, raised: boolean) {
    const wheel = this.player.visual.model.wheels.find((w) => w.id === this.player.body.wheels[i].id);
    if (wheel) {
      wheel.socket.setEnabled(!!tire);
      const squash = !tire ? 1 : isFlat(tire) ? 0.84 : 1 - 0.1 * Math.max(0, 0.8 - pressureRatio(tire));
      const donut = tire?.spec === "donut";
      wheel.socket.scaling.set(donut ? 0.6 : 1, squash * (donut ? 0.86 : 1), donut ? 0.86 : 1);
    }
    if (!raised) { if (this.jackMesh && this.car.jacked === null) this.jackMesh.setEnabled(false); return; }
    const scene = this.player.visual.model.root.getScene();
    if (!this.jackMesh) {
      this.jackMesh = MeshBuilder.CreateBox("tire-jack", { width: 0.18, height: 0.32, depth: 0.28 }, scene);
      const material = new StandardMaterial("tire-jack", scene);
      material.diffuseColor = new Color3(0.75, 0.12, 0.08);
      this.jackMesh.material = material;
      this.jackMesh.isPickable = false;
    }
    const local = this.player.body.wheels[i].local;
    this.player.body.toWorld(new Vector3(local.x * 0.7, 0.16, local.z), this.tmp);
    this.jackMesh.position.copyFrom(this.tmp);
    this.jackMesh.setEnabled(true);
  }

  private report(corner: CornerId, tire: TireAssembly, events: TireEvent[]): boolean {
    const i = CORNER_IDS.indexOf(corner);
    const name = CORNER_NAMES[corner];
    let stateChanged = false;
    let overspeed = false;
    for (const event of events) {
      if (event.kind === "overspeed") { overspeed = true; continue; }
      if (event.kind === "low_pressure") this.bridge.emit("tireEvent", { corner, kind: "low_pressure", text: `Low pressure: ${name} tire` });
      if (event.kind === "rim_damage") this.bridge.emit("tireEvent", { corner, kind: "rim_damage", text: `The ${name} rim is grinding on the road` });
      if (event.kind === "state") {
        stateChanged = true;
        const kind = event.to === "BLOWOUT" ? "blowout" : event.to === "FLAT" ? "flat" : event.to === "DESTROYED" ? "destroyed" : "puncture";
        const text = kind === "blowout" ? `Blowout! ${name} tire` : kind === "flat" ? `The ${name} tire is flat`
          : kind === "destroyed" ? `The ${name} tire has come apart` : `The ${name} tire is losing air`;
        this.bridge.emit("tireEvent", { corner, kind, text });
      }
    }
    if (overspeed && !this.overspeed[i]) {
      this.bridge.emit("tireEvent", { corner, kind: "overspeed", text: `Spare tire: keep it under ${TIRE_SPECS[tire.spec].recommendedMaxKph} km/h` });
    }
    this.overspeed[i] = overspeed;
    return stateChanged;
  }

  private impact(strength: number, point: Vector3 | null | undefined) {
    const { body } = this.player;
    let corner: CornerId = CORNER_IDS[0], best = Infinity;
    body.wheels.forEach((wheel, i) => {
      body.toWorld(wheel.local, this.tmp);
      const d = point ? Vector3.DistanceSquared(point, this.tmp) : i;
      if (d < best) { best = d; corner = CORNER_IDS[i]; }
    });
    // Only hits near a wheel can reach the tire.
    if (point && best > 1.1 ** 2) return;
    const tire = this.session.mounted(this.player.id, corner);
    const failure = tire && impactPuncture(tire, strength, this.random());
    if (failure) this.fail(corner, failure);
  }

  private fail(corner: CornerId, failure: "SLOW_LEAK" | "RAPID_LEAK" | "BLOWOUT") {
    const tire = this.session.mounted(this.player.id, corner);
    if (!tire) return { rejected: "No wheel on that corner" };
    const events = puncture(tire, failure);
    if (events.length) { this.report(corner, tire, events); this.session.save(); }
    this.apply();
  }

  /** Dev only: every mounted assembly back to a fresh road tire, tools and job cleared. */
  private resetVehicle() {
    this.session.mutate(this.player.id, (car) => {
      for (const corner of CORNER_IDS) {
        const tire = this.session.assembly(car.corners[corner]);
        if (tire) Object.assign(tire, { pressureKpa: TIRE_SPECS.standard.nominalKpa, spec: "standard", health: 1, failure: "HEALTHY", leakKpaPerMin: 0, rimDamage: 0, flatDistanceM: 0 });
      }
      Object.assign(car, { jack: true, wrench: true, jacked: null, loosened: [] });
    });
    this.apply();
  }

  private trunkStep(): WheelChangeStep | null {
    const car = this.car;
    if (car.held) return "stow";
    if (car.jacked && !car.corners[car.jacked] && (car.spare || car.trunk.length)) return "take_spare";
    return null;
  }

  private describe(corner: CornerId): string {
    const tire = this.session.mounted(this.player.id, corner);
    const name = CORNER_NAMES[corner];
    if (!tire) return `The ${name} hub is bare.`;
    const spec = TIRE_SPECS[tire.spec];
    const state: Record<FailureState, string> = {
      HEALTHY: "holding air", SLOW_LEAK: "hissing slowly", RAPID_LEAK: "losing air fast", FLAT: "flat",
      BLOWOUT: "blown out", DESTROYED: "shredded",
    };
    const tread = tire.health > 0.7 ? "good tread" : tire.health > 0.3 ? "worn and scuffed" : "torn sidewall";
    const rim = tire.rimDamage > 0.5 ? " The rim is badly bent." : tire.rimDamage > 0 ? " The rim is scraped." : "";
    const advisory = spec.recommendedMaxKph ? ` Sidewall says max ${spec.recommendedMaxKph} km/h.` : "";
    return `${spec.label}, ${Math.round(tire.pressureKpa)} of ${spec.nominalKpa} kPa, ${state[tire.failure]}, ${tread}.${rim}${advisory}`;
  }

  private publishStatus() {
    const car = this.car;
    const corners = CORNER_IDS.map((corner) => {
      const tire = this.session.assembly(car.corners[corner]);
      return { corner, spec: tire?.spec ?? "none", failure: tire?.failure ?? "DESTROYED", installed: !!tire,
        pressureRatio: tire ? Math.round(pressureRatio(tire) * 50) / 50 : 0, low: !!tire && isLowPressure(tire), flat: !!tire && isFlat(tire) };
    });
    const donut = corners.find((c) => c.spec === "donut");
    const spare = this.session.assembly(car.spare);
    const status: TireStatus = {
      corners, spare: spare ? spare.spec : null, jack: car.jack, wrench: car.wrench,
      advisoryKph: donut ? TIRE_SPECS.donut.recommendedMaxKph : null, jacked: car.jacked,
      held: this.session.assembly(car.held)?.spec ?? null, driveBlock: this.session.driveBlock(this.player.id),
    };
    const key = JSON.stringify(status);
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    this.bridge.emit("tireStatus", status);
  }

  private telemetry(): TireTelemetry {
    const model = this.player.controller.model;
    const car = this.car;
    return {
      corners: CORNER_IDS.map((corner, i) => {
        const tire = this.session.assembly(car.corners[corner]);
        const input = model.tires[i], out = model.corners[i];
        return {
          corner, spec: tire?.spec ?? "none", failure: tire?.failure ?? "DESTROYED", pressureKpa: tire?.pressureKpa ?? 0,
          health: tire?.health ?? 0, rimDamage: tire?.rimDamage ?? 0, surface: this.surfaces[i], grip: input.grip,
          slipScale: input.slipScale, rollingResistance: input.rollingResistance, installed: input.installed, raised: input.raised,
          grounded: out.grounded, normalLoadN: out.normalLoadN, fx: out.fx, fy: out.fy, slipAngleDeg: out.slipAngle * 180 / Math.PI,
          slipRatio: out.slipRatio, wheelSpeed: out.wheelSpeed, driveN: out.driveN, brakeN: out.brakeN, rollingN: out.rollingN,
        };
      }),
    };
  }

  /** Mulberry32: deterministic hazard and impact rolls. */
  private random() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  dispose(): void {
    this.session.save();
    this.releases.forEach((release) => release());
    this.jackMesh?.material?.dispose();
    this.jackMesh?.dispose();
  }
}
