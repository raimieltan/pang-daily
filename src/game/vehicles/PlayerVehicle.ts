import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import {
  SummaryPublisher,
  type RuntimePort,
  type SpawnPointId,
  type VehicleSummary,
  type VehicleTelemetry,
} from "../bridge";
import type { ChaseTarget } from "../cameras/ChaseCamera";
import type { GameSystem } from "../engine/types";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { resolveHandlingPreset } from "./handling/HandlingConfig";
import { HANDLING_PRESETS, isHandlingPresetId, type HandlingPresetId } from "./handling/presets";
import { VehicleBody, type VehiclePose } from "./VehicleBody";
import { VehicleController, type DriverInputSource } from "./VehicleController";
import type { VehicleRuntimeDefinition } from "./VehicleDefinition";
import { VehicleVisual } from "./VehicleVisual";
import { combineModifiers, NO_MODIFIERS, PRISTINE_CONDITION, type StatModifiers } from "../../game-core/vehicles/vehicleStats";
import { exteriorEffects, NO_EXTERIOR_EFFECTS, resolveBodyPartLook, type BodyPart, type ExteriorEffects, type FittedBodyPart, type PaintFinish } from "../../game-core/exterior";
import type { ExteriorSlot } from "../../game-core/vehicles/VehicleDefinition";
import { BodyPartSwapper, type BodyPartAssetSource } from "./BodyPartSwapper";
import { calculateFitment, wheelModifiers, type Fitment, type WheelPart } from "../../game-core/wheels";
import { WheelSwapper, type WheelAssetSource } from "./WheelSwapper";
import type { VehicleCondition } from "../../game-core/vehicles/VehicleDefinition";
import type { WearSample } from "../../game-core/maintenance/condition";
import { conditionHandling } from "../maintenance/conditionHandling";
import type { HandlingConfig } from "./handling/HandlingConfig";

const G = 9.81;
const DEG = 180 / Math.PI;
const TELEMETRY_INTERVAL_SECONDS = 0.1;

export type PlayerVehicleOptions = {
  definition: VehicleRuntimeDefinition;
  spawnPoints: Readonly<Record<SpawnPointId, VehiclePose>>;
  initialSpawn: SpawnPointId;
  /** Overrides the definition's preset (e.g. from `?handling=`). */
  presetId?: HandlingPresetId;
  /** Overrides where wheel GLBs load from (file bytes in tests). */
  wheelSource?: WheelAssetSource;
  /** Overrides where body part GLBs load from (file bytes in tests). */
  bodyPartSource?: BodyPartAssetSource;
};

/** An owned body part as the car should wear it: the template plus the copy's condition and finish. */
export type BodyPartFitting = { part: BodyPart; condition: number | null; finish: PaintFinish | null };

const PRESET_INFO = Object.entries(HANDLING_PRESETS).map(([id, { name, description }]) => ({ id, name, description }));

/**
 * The player's car inside a scene: physics body + handling controller + visual, plus
 * the bridge surface for driving (`spawnAt`, `resetVehicle`, `setHandlingPreset`) and
 * the throttled HUD summary / tuning telemetry. Physics state never leaves this system;
 * React only ever sees the published summaries.
 */
export class PlayerVehicle implements GameSystem, ChaseTarget {
  readonly name = "playerVehicle";
  private presetId: HandlingPresetId;
  private spawnId: SpawnPointId;
  private readonly hud: SummaryPublisher<VehicleSummary>;
  private readonly telemetry: SummaryPublisher<VehicleTelemetry>;
  /** Runs after `place`, e.g. to snap the camera. */
  onPlaced?: () => void;
  /** Runs after a wheel or body part swap, e.g. to re-light the new meshes. */
  onVisualsChanged?: () => void;
  canReposition?: () => boolean;
  impactSerial = 0;
  impactStrength = 0;
  private impactCooldown = 0;
  private releaseImpact: () => void;
  private baseConfig: HandlingConfig;
  private condition: VehicleCondition = { ...PRISTINE_CONDITION };
  private wheelEffects: StatModifiers = NO_MODIFIERS;
  private bodyEffects: ExteriorEffects = NO_EXTERIOR_EFFECTS;
  readonly wheels: WheelSwapper;
  readonly bodyParts: BodyPartSwapper;

  private constructor(
    private readonly bridge: RuntimePort,
    private readonly options: PlayerVehicleOptions,
    readonly body: VehicleBody,
    readonly controller: VehicleController,
    readonly visual: VehicleVisual,
    presetId: HandlingPresetId,
  ) {
    this.wheels = new WheelSwapper(visual.model.root.getScene(), visual.model, options.wheelSource);
    this.bodyParts = new BodyPartSwapper(visual.model.root.getScene(), visual.model, options.bodyPartSource);
    this.presetId = presetId;
    this.baseConfig = controller.model.config;
    this.spawnId = options.initialSpawn;
    body.body.setCollisionCallbackEnabled(true);
    const impacts = body.body.getCollisionObservable();
    const observer = impacts.add((event) => {
      // Impulse / mass is a velocity change. Ground support and ordinary braking stay quiet.
      const deltaV = Math.abs(event.impulse) / controller.model.config.chassis.massKg;
      if (deltaV < 2.4 || this.impactCooldown > 0) return;
      this.impactStrength = Math.min(1, (deltaV - 2.4) / 7 + 0.2);
        this.impactSerial++;
        bridge.emit("vehicleImpact", { strength: this.impactStrength });
      this.impactCooldown = 0.32;
    });
    this.releaseImpact = () => impacts.remove(observer);
    this.hud = new SummaryPublisher((summary) => bridge.emit("vehicleStateUpdated", summary));
    this.telemetry = new SummaryPublisher(
      (sample) => bridge.emit("vehicleTelemetry", sample),
      TELEMETRY_INTERVAL_SECONDS,
    );

    bridge.handle("spawnAt", ({ spawnPointId }) => {
      if (this.canReposition?.() === false) return { rejected: "Reset the race before teleporting" };
      if (!(spawnPointId in options.spawnPoints)) return { rejected: `Unknown spawn point "${spawnPointId}"` };
      this.spawnId = spawnPointId;
      if (!this.reset()) return { rejected: `No road under spawn point "${spawnPointId}"` };
      bridge.emit("playerSpawned", { spawnPointId });
    });
    bridge.handle("resetVehicle", () => {
      if (!this.reset()) return { rejected: "No road under the spawn point" };
    });
    bridge.handle("setHandlingPreset", ({ presetId }) => {
      if (!isHandlingPresetId(presetId)) return { rejected: `Unknown handling preset "${presetId}"` };
      this.applyPreset(presetId);
      this.publishDebugInfo();
    });
  }

  static async create(
    scene: Scene,
    world: PhysicsWorld,
    input: DriverInputSource,
    bridge: RuntimePort,
    options: PlayerVehicleOptions,
  ): Promise<PlayerVehicle> {
    const { definition } = options;
    const presetId = options.presetId ?? definition.handlingPreset;
    const config = resolveHandlingPreset(HANDLING_PRESETS, presetId);
    const body = new VehicleBody(world, definition.collision, config.chassis.massKg, definition.spec.id);
    const controller = new VehicleController(world, body, config, input);
    try {
      const visual = await VehicleVisual.load(scene, definition.spec, body.node);
      const vehicle = new PlayerVehicle(bridge, options, body, controller, visual, presetId);
      vehicle.reset();
      vehicle.publishDebugInfo();
      return vehicle;
    } catch (error) {
      controller.dispose();
      body.dispose();
      throw error;
    }
  }

  /** Back to the current spawn point, at rest, in drive. */
  reset(): boolean {
    if (this.canReposition?.() === false) return false;
    this.controller.reset();
    this.impactCooldown = 0.4;
    const placed = this.body.place(this.options.spawnPoints[this.spawnId]);
    if (placed) this.onPlaced?.();
    return placed;
  }

  /** At rest at an arbitrary pose (e.g. a hub return point), in drive. The spawn point is unchanged. */
  placeAt(pose: VehiclePose): boolean {
    this.controller.reset();
    this.impactCooldown = 0.4;
    const placed = this.body.place(pose);
    if (placed) this.onPlaced?.();
    return placed;
  }

  /**
   * Back on its wheels where it is (rolled, beached, stuck on a wall), facing the same way.
   * Falls back to the spawn point when there is no road underneath.
   */
  recover(): boolean {
    if (this.canReposition?.() === false) return false;
    const { position, forward } = this.body;
    const pose: VehiclePose = { position: position.clone(), headingRad: Math.atan2(forward.x, forward.z) };
    this.controller.reset();
    this.impactCooldown = 0.4;
    if (!this.body.place(pose)) return this.reset();
    this.onPlaced?.();
    return true;
  }

  /** The owned car's id (its spec id until the garage can hold more than one). */
  get id(): string {
    return this.options.definition.spec.id;
  }

  get definition(): VehicleRuntimeDefinition {
    return this.options.definition;
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get forward(): Vector3 {
    return this.body.forward;
  }

  get speed(): number {
    return this.controller.model.state.vx;
  }

  get speedKmh(): number { return Math.abs(this.speed) * 3.6; }
  get gear(): number {
    return this.controller.model.state.reversing ? -1 : this.options.definition.gearThresholdsKmh.filter(kmh => this.speedKmh >= kmh).length;
  }
  /** Presentation RPM estimate: this arcade drivetrain has no simulated engine RPM. */
  get recordingMotion(): { rpm: number; suspension: number } {
    const thresholds = this.options.definition.gearThresholdsKmh;
    const lower = thresholds[Math.max(0, this.gear - 1)] ?? 0;
    const upper = thresholds[this.gear] ?? lower + 45;
    const revs = Math.max(0, Math.min(1, (this.speedKmh - lower) / Math.max(1, upper - lower)));
    return { rpm: 850 + revs * 4800 + this.controller.model.state.throttle * 400, suspension: this.controller.model.state.loadShift };
  }

  update(dt: number): void {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const { state } = this.controller.model;
    this.visual.update(dt, state.steerAngle, state.vx);
    this.hud.tick(dt, () => this.summarize());
    this.telemetry.tick(dt, () => this.sample());
  }

  setFuelAvailable(available: boolean): void { this.controller.fuelAvailable = available; }

  setHoodOpen(open: boolean): void { this.visual.model.setHoodOpen(open); }

  setStockSpoilerVisible(visible: boolean): void { this.visual.model.setStockSpoilerVisible(visible); }

  setCondition(condition: VehicleCondition): void {
    this.condition = { ...condition };
    this.controller.setConfig(conditionHandling(this.baseConfig, this.definition.spec, this.condition,
      combineModifiers(this.wheelEffects, this.bodyEffects.modifiers)));
  }

  /** The wheel part on the car (null = stock wheels). */
  get wheelPart(): WheelPart | null {
    return this.wheels.equipped;
  }

  /** Stance of the wheels on the car at the current visual ride height. */
  get fitment(): Fitment {
    const { model } = this.visual;
    return calculateFitment(this.definition.spec, model.wheels[0].fit, model.rideHeight);
  }

  /**
   * Swaps the wheel visuals on all four sockets and re-derives handling from the part's modifiers
   * and this copy's `condition`. Physics collision is untouched. Resolves false if superseded.
   */
  async equipWheels(part: WheelPart | null, condition: number | null = 1): Promise<boolean> {
    if (!(await this.wheels.equip(part))) return false;
    this.wheelEffects = wheelModifiers(this.definition.spec, part, condition);
    this.setCondition(this.condition);
    this.onVisualsChanged?.();
    return true;
  }

  /** Body parts on the car, with the look each is wearing. */
  get exterior(): FittedBodyPart[] {
    return this.bodyParts.equipped;
  }

  get paint(): string { return this.visual.model.paint; }

  setAppearance(value: import('@/game-core/exterior').VehicleAppearance): void {
    this.visual.model.setPaint(value.paint);
    this.visual.model.setRideHeight(value.rideHeightM);
    this.onVisualsChanged?.();
  }

  /** What the fitted body parts do: stat modifiers plus drag, cooling, reputation and repair cost. */
  get exteriorEffects(): ExteriorEffects {
    return this.bodyEffects;
  }

  /**
   * Replaces the part on `socket` (null = back to stock): loads and attaches its GLB, dresses it
   * in its finish (body colour follows the car's paint), wear and fit, then re-derives handling
   * and the exterior effects. Resolves false if superseded.
   */
  async equipBodyPart(socket: ExteriorSlot, fitting: BodyPartFitting | null): Promise<boolean> {
    const { spec } = this.definition;
    const fitted = fitting && {
      part: fitting.part,
      look: resolveBodyPartLook(fitting.part, {
        condition: fitting.condition, finish: fitting.finish, bodyColor: this.visual.model.paint, vehicleTags: spec.tags,
      }),
    };
    if (!(await this.bodyParts.equip(socket, fitted))) return false;
    this.bodyEffects = exteriorEffects(this.bodyParts.equipped);
    this.setCondition(this.condition);
    this.onVisualsChanged?.();
    return true;
  }

  maintenanceSample(racing: boolean): WearSample {
    const { state, diagnostics } = this.controller.model;
    return { speedMps: state.vx, throttle: state.throttle, brake: state.brake,
      slip: Math.min(1, Math.abs(diagnostics.bodySlip) / .35), handbrake: diagnostics.handbrakeEffect,
      grounded: this.body.groundedWheels > 0 && !diagnostics.held, racing };
  }

  dispose(): void {
    this.wheels.dispose();
    this.bodyParts.dispose();
    this.releaseImpact();
    this.controller.dispose();
    this.body.dispose();
  }

  private applyPreset(presetId: HandlingPresetId): void {
    const config = resolveHandlingPreset(HANDLING_PRESETS, presetId);
    this.presetId = presetId;
    this.baseConfig = config;
    this.setCondition(this.condition);
    this.body.setMass(config.chassis.massKg);
  }

  private publishDebugInfo(): void {
    this.bridge.emit("vehicleDebugInfo", {
      presetId: this.presetId,
      presets: PRESET_INFO,
      spawnPoints: Object.keys(this.options.spawnPoints),
    });
  }

  private summarize(): VehicleSummary {
    const { state } = this.controller.model;
    const speedKmh = Math.round(Math.abs(state.vx) * 3.6);
    if (state.reversing) return { speedKmh, gear: -1 };
    return { speedKmh, gear: this.options.definition.gearThresholdsKmh.filter((kmh) => speedKmh >= kmh).length };
  }

  private sample(): VehicleTelemetry {
    const { state: s, diagnostics: d } = this.controller.model;
    return {
      speedKmh: round(Math.abs(s.vx) * 3.6, 0),
      steerDeg: round(s.steerAngle * DEG, 1),
      maxSteerDeg: round(d.maxSteerAngle * DEG, 1),
      throttle: round(s.throttle, 2),
      brake: round(s.brake, 2),
      reversing: s.reversing,
      understeer: round(d.understeer, 2),
      bodySlipDeg: round(d.bodySlip * DEG, 1),
      frontSlipDeg: round(d.frontSlip * DEG, 1),
      rearSlipDeg: round(d.rearSlip * DEG, 1),
      frontGripUse: round(d.frontGripUse, 2),
      rearGripUse: round(d.rearGripUse, 2),
      liftOff: round(s.liftOff, 2),
      loadShift: round(s.loadShift, 3),
      tractionCut: round(d.tractionCut, 2),
      stabilityYaw: round(d.stabilityYaw, 2),
      handbrake: round(d.handbrakeEffect, 2),
      longAccelG: round(s.longAccel / G, 2),
      latAccelG: round(s.latAccel / G, 2),
      groundedWheels: this.body.groundedWheels,
      held: d.held,
    };
  }
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  // `+ 0` turns -0 into 0 so the change-only publisher doesn't see a spurious difference.
  return Math.round(x * f) / f + 0;
}
