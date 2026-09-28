import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import { CarTires } from "./CarTires";
import {
  CORNER_IDS, CORNER_NAMES, applyTireService, tireServiceLines, type TireServiceLine, TIRE_SPECS, isFlat, isLowPressure, loadTireSession, nextCornerStep, performStep,
  pressureRatio, puncture, stepLabel, type CornerId, type FailureState, type TireAssembly,
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
export type TireShopState = { lines: TireServiceLine[]; walletPhp: number; rejection: string | null; receipt: string | null };
/** Wallet the talyer charges; the same `VehicleSession` the repair bench uses. */
export type TireShopWallet = {
  spend(amountPhp: number, source: { kind: string; description: string; source: string; relatedEntityId?: string | null }): { rejected: string } | object;
  summary(definition: PlayerVehicle["definition"]["spec"]): { walletPhp: number };
  readonly persistent?: boolean;
};
export type TireEventPayload = {
  corner: CornerId | null;
  kind: "puncture" | "blowout" | "flat" | "destroyed" | "low_pressure" | "rim_damage" | "overspeed" | "service";
  text: string;
};
export type TireTelemetry = {
  corners: {
    corner: CornerId; spec: string; failure: FailureState; pressureKpa: number; health: number; /** Tread left (maintenance `tires` condition); donuts are always 1. */ tread: number; rimDamage: number;
    surface: TireSurface; grip: number; slipScale: number; rollingResistance: number; installed: boolean; raised: boolean;
    grounded: boolean; normalLoadN: number; fx: number; fy: number; slipAngleDeg: number; slipRatio: number;
    wheelSpeed: number; driveN: number; brakeN: number; rollingN: number;
  }[];
};

const TELEMETRY_INTERVAL = 0.2;
const SAVE_INTERVAL = 5;
/** How far the jack raises the body at its corner, and how far that wheel then hangs clear. */
const JACK_LIFT_M = 0.09;
const WHEEL_CLEAR_M = 0.045;
/** Seconds to crank the jack all the way up (or down). */
const JACK_SECONDS = 1.2;
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
  readonly sim: CarTires;
  private get surfaces() { return this.sim.surfaces; }
  private telemetryAge = 0;
  private saveAge = 0;
  private dirty = false;
  private lastStatus = "";
  private readonly overspeed = [false, false, false, false];
  private readonly releases: (() => void)[] = [];
  private readonly tmp = new Vector3();
  private jackMesh?: Mesh;
  /** 0 = down, 1 = fully raised; animates toward the saved jack state. */
  private jackProgress = 0;
  private jackCorner: number | null = null;

  constructor(
    private readonly bridge: RuntimePort,
    private readonly player: PlayerVehicle,
    /** On-foot modes for wheel-change prompts and blocking the driver's seat; absent in the test track. */
    private readonly modes: PlayerModes | undefined,
    surfaceAt: (x: number, z: number) => TireSurface,
    storage?: StoragePort | TireSession,
    seed = 0x7123,
  ) {
    this.session = storage && "vehicle" in storage ? storage : loadTireSession(storage as StoragePort | undefined);
    this.sim = new CarTires(this.session, () => player.id, player.body, player.controller.model, surfaceAt, seed, () => player.tireSetup);
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

  /** Opens tire service at the talyer. `rejection` says why it isn't available here (null = at the bench). */
  useShop(wallet: TireShopWallet, rejection: () => string | null): void {
    const publish = (receipt: string | null = null) => {
      const blocked = rejection();
      this.bridge.emit("tireShopState", { lines: blocked ? [] : tireServiceLines(this.session, this.player.id),
        walletPhp: wallet.summary(this.player.definition.spec).walletPhp, rejection: blocked, receipt });
    };
    this.releases.push(this.bridge.handle("quoteTireService", () => publish()));
    this.releases.push(this.bridge.handle("buyTireService", ({ lineId }) => {
      const blocked = rejection();
      if (blocked) return { rejected: blocked };
      if (this.session.persistent) {
        // Server saves: the talyer prices and charges on the server; the confirmed tires come back.
        const line = tireServiceLines(this.session, this.player.id).find((l) => l.id === lineId);
        if (!line) { publish(); return { rejected: "That service is no longer needed" }; }
        return this.session.service(this.player.id, lineId).then(() => {
          this.apply();
          this.bridge.emit("tireEvent", { corner: null, kind: "service", text: line.label });
          publish(`Paid ₱${line.costPhp.toLocaleString("en-PH")}: ${line.label}`);
        }, (error: unknown) => { publish(); return { rejected: error instanceof Error ? error.message : String(error) }; });
      }
      const result = applyTireService(this.session, this.player.id, lineId, (line) => {
        const paid = wallet.spend(line.costPhp, { kind: "tire_service", source: "talyer", description: line.label, relatedEntityId: this.player.id });
        return "rejected" in paid ? { rejected: String(paid.rejected) } : undefined;
      });
      if ("rejected" in result) { publish(); return { rejected: result.rejected }; }
      this.apply();
      this.bridge.emit("tireEvent", { corner: null, kind: "service", text: result.line.label });
      publish(`Paid ₱${result.line.costPhp.toLocaleString("en-PH")}: ${result.line.label}`);
    }));
  }

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
    let changed = false;
    for (const { corner, tire, events } of this.sim.step(dt)) changed = this.report(corner, tire, events) || changed;
    this.dirty ||= this.player.speedKmh > 0.2 || CORNER_IDS.some((c) => (this.session.mounted(this.player.id, c)?.leakKpaPerMin ?? 0) > 0);
    this.apply();
    this.animateJack(dt);
    this.saveAge += dt;
    if (changed || (this.dirty && this.saveAge >= SAVE_INTERVAL)) { this.session.save({ urgent: changed }); this.saveAge = 0; this.dirty = false; }
    this.publishStatus();
    this.telemetryAge += dt;
    if (this.telemetryAge >= TELEMETRY_INTERVAL) { this.telemetryAge = 0; this.bridge.emit("tireTelemetry", this.telemetry()); }
  }

  /** Pushes every corner's tire to the handling model and the visuals. */
  private apply() {
    this.sim.apply();
    this.sim.showWheels(this.player.visual.model.wheels);
  }

  /**
   * Cranks the body up at the jacked corner: the chassis pivots about the opposite wheel, the
   * jacked wheel hangs clear, and the jack grows under the sill. Physics stays level; the handling
   * model already treats that corner as ungrounded.
   */
  private animateJack(dt: number) {
    const jacked = this.car.jacked;
    const target = jacked ? 1 : 0;
    if (jacked) {
      const i = CORNER_IDS.indexOf(jacked);
      // Moving the jack to another corner lowers the car first.
      if (this.jackCorner !== null && this.jackCorner !== i && this.jackProgress > 0) this.jackProgress = Math.max(0, this.jackProgress - dt / JACK_SECONDS);
      else { this.jackCorner = i; this.jackProgress = Math.min(1, this.jackProgress + dt / JACK_SECONDS); }
    } else this.jackProgress = Math.max(0, this.jackProgress - dt / JACK_SECONDS);
    if (this.jackCorner === null) return;
    const model = this.player.visual.model;
    const hubs = CORNER_IDS.map((_, k) => model.wheels.find((w) => w.id === this.player.body.wheels[k].id)?.hub.position);
    const i = this.jackCorner, eased = this.jackProgress * this.jackProgress * (3 - 2 * this.jackProgress);
    const pose = jackPose(hubs, i, JACK_LIFT_M * eased);
    if (pose) model.setJackPose(eased > 0 ? pose.rotation : null, pose.offset);
    const socket = model.wheels.find((w) => w.id === this.player.body.wheels[i].id)?.socket;
    if (socket) socket.position.y = WHEEL_CLEAR_M * eased;
    this.placeJack(i, eased);
    if (this.jackProgress === 0 && target === 0) { this.jackCorner = null; model.setJackPose(null); }
  }

  private placeJack(i: number, eased: number) {
    if (eased <= 0) { this.jackMesh?.setEnabled(false); return; }
    const scene = this.player.visual.model.root.getScene();
    if (!this.jackMesh) {
      this.jackMesh = MeshBuilder.CreateBox("tire-jack", { width: 0.18, height: 1, depth: 0.28 }, scene);
      const material = new StandardMaterial("tire-jack", scene);
      material.diffuseColor = new Color3(0.75, 0.12, 0.08);
      this.jackMesh.material = material;
      this.jackMesh.isPickable = false;
    }
    const height = 0.12 + JACK_LIFT_M * eased;
    const local = this.player.body.wheels[i].local;
    this.player.body.toWorld(new Vector3(local.x * 0.7, 0, local.z * 0.82), this.tmp);
    this.jackMesh.scaling.y = height;
    this.jackMesh.position.set(this.tmp.x, this.tmp.y - this.player.definition.collision.wheels.radius + height / 2, this.tmp.z);
    this.jackMesh.rotationQuaternion = this.player.body.node.rotationQuaternion?.clone() ?? null;
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
    const hit = this.sim.impact(strength, point);
    if (hit) this.fail(hit.corner, hit.failure);
  }

  private fail(corner: CornerId, failure: "SLOW_LEAK" | "RAPID_LEAK" | "BLOWOUT") {
    const tire = this.session.mounted(this.player.id, corner);
    if (!tire) return { rejected: "No wheel on that corner" };
    const events = puncture(tire, failure);
    if (events.length) { this.report(corner, tire, events); this.session.save({ urgent: true }); }
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
    // Tread is the road set's wear (maintenance condition); health is the carcass (flats, blowouts).
    const treadLeft = tire.spec === "standard" ? this.player.tireSetup.tread : 1;
    const tread = tire.health <= 0.3 ? "torn sidewall" : treadLeft < 0.25 ? "nearly bald" : treadLeft < 0.6 ? "worn tread" : "good tread";
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
          health: tire?.health ?? 0, tread: tire?.spec === "standard" ? this.player.tireSetup.tread : 1, rimDamage: tire?.rimDamage ?? 0, surface: this.surfaces[i], grip: input.grip,
          slipScale: input.slipScale, rollingResistance: input.rollingResistance, installed: input.installed, raised: input.raised,
          grounded: out.grounded, normalLoadN: out.normalLoadN, fx: out.fx, fy: out.fy, slipAngleDeg: out.slipAngle * 180 / Math.PI,
          slipRatio: out.slipRatio, wheelSpeed: out.wheelSpeed, driveN: out.driveN, brakeN: out.brakeN, rollingN: out.rollingN,
        };
      }),
    };
  }

  dispose(): void {
    this.session.save();
    void this.session.flush().catch(() => { /* ServerPersistence reports it. */ });
    this.releases.forEach((release) => release());
    this.jackMesh?.material?.dispose();
    this.jackMesh?.dispose();
  }
}

/**
 * Chassis tilt that lifts corner `i` by `lift` metres while the diagonally opposite wheel stays
 * planted: a rotation about the axis through that wheel, parallel to the line between the other
 * two. The two neighbours rise by half as much, as a sprung body does on a single jack.
 */
export function jackPose(hubs: readonly (Vector3 | undefined)[], i: number, lift: number) {
  const opposite = 3 - i;
  const [a, b] = [0, 1, 2, 3].filter((k) => k !== i && k !== opposite);
  const J = hubs[i], O = hubs[opposite], A = hubs[a], B = hubs[b];
  if (!J || !O || !A || !B) return null;
  const axis = new Vector3(A.x - B.x, 0, A.z - B.z).normalize();
  const arm = new Vector3(J.x - O.x, 0, J.z - O.z);
  const reach = Math.abs(axis.x * arm.z - axis.z * arm.x);
  if (reach < 1e-3) return null;
  let rotation = Quaternion.RotationAxis(axis, lift / reach);
  const rise = (q: Quaternion) => arm.applyRotationQuaternion(q).y;
  if (rise(rotation) < 0) rotation = Quaternion.RotationAxis(axis, -lift / reach);
  const pivot = new Vector3(O.x, 0, O.z);
  return { rotation, offset: pivot.subtract(pivot.applyRotationQuaternion(rotation)) };
}
