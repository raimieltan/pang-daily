import { SuspensionDebugVisual } from "./SuspensionDebugVisual";
import { SuspensionSolver } from "@/game-core/suspension/solver";
import { damageCorner } from "@/game-core/suspension/service";
import type { SavedSuspension } from "@/game-core/suspension/schema";
import { assistanceProfileSchema } from "./handling/MechanicalConfig";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import type { TuneId } from "../../game-core/tuning/tunes";
import { VehicleBody, type VehiclePose } from "./VehicleBody";
import { VehicleController, type DriverInputSource } from "./VehicleController";
import type { VehicleRuntimeDefinition } from "./VehicleDefinition";
import { VehicleVisual } from "./VehicleVisual";
import { VehicleEffects } from "./VehicleEffects";
import { combineModifiers, NO_MODIFIERS, PRISTINE_CONDITION, type StatModifiers } from "../../game-core/vehicles/vehicleStats";
import { exteriorEffects, NO_EXTERIOR_EFFECTS, resolveBodyPartLook, type BodyPart, type ExteriorEffects, type FittedBodyPart, type PaintFinish } from "../../game-core/exterior";
import type { ExteriorSlot } from "../../game-core/vehicles/VehicleDefinition";
import { BodyPartSwapper, type BodyPartAssetSource } from "./BodyPartSwapper";
import { calculateFitment, physicalWheelModifiers, wheelModifiers, wheelSetup, type Fitment, type WheelPart } from "../../game-core/wheels";
import { treadGripLoss, type WheelSetup } from "../../game-core/tires";
import { WheelSwapper, type WheelAssetSource } from "./WheelSwapper";
import type { VehicleCondition } from "../../game-core/vehicles/VehicleDefinition";
import type { WearSample } from "../../game-core/maintenance/condition";
import { calculateVehiclePerformance, type PerformanceStats } from '../../game-core/performance/calculator';
import type { InstalledPerformancePart } from '../../game-core/performance/schema';
import { performanceFailureRisks } from '../../game-core/performance/failures';
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
  private telemetryAge = 0;
  private readonly suspensionDebug: SuspensionDebugVisual;
  private previewSolver: SuspensionSolver | null = null;
  private previewMode = 'off';
  private previewTime = 0;
  get suspension() { return this.controller.suspension.solver; }
  setSuspension(saved: SavedSuspension): void {
    this.controller.suspension.setSaved(saved);
    const setup = saved.setup;
    const p = this.controller.model.config.mechanical!;
    p.steering.roadAngleDeg = setup.maxLock * 180 / Math.PI;
    p.steering.driftAngleDeg = setup.maxLock * 180 / Math.PI;
    p.steering.rackRate = 7 * 16 / setup.steeringRatio;
    p.steering.returnRate = 3 + setup.corners[0].caster * 180 / Math.PI * .4;
    p.suspension.casterDeg = setup.corners[0].caster * 180 / Math.PI;
    if (this.previewMode !== 'off') this.previewSuspension(this.previewMode);
  }
  previewSuspension(mode: string): void {
    this.previewMode = mode; this.previewTime = 0;
    this.previewSolver = mode === 'off' ? null : new SuspensionSolver(this.suspension.baseline, structuredClone(this.suspension.saved));
    if (this.previewSolver) for (let i = 0; i < 240; i++) this.previewSolver.preview(1 / 120);
  }
  get suspensionPreview() { return this.previewMode; }
  get suspensionTelemetry() { return this.previewSolver?.snapshot() ?? this.suspension.snapshot(); }

  /** Runs after `place`, e.g. to snap the camera. */
  onPlaced?: () => void;
  /** Runs after a wheel or body part swap, e.g. to re-light the new meshes. */
  onVisualsChanged?: () => void;
  canReposition?: () => boolean;
  impactSerial = 0;
  impactStrength = 0;
  driftImpactSerial = 0;
  driftImpactStrength = 0;
  private impactCooldown = 0;
  private releaseImpact: () => void;
  private baseConfig: HandlingConfig;
  private condition: VehicleCondition = { ...PRISTINE_CONDITION };
  private performanceParts: InstalledPerformancePart[] = [];
  private calculatedPerformance: PerformanceStats | null = null;
  get performanceStats(): PerformanceStats {
    return this.calculatedPerformance ?? calculateVehiclePerformance(this.definition.spec).stats;
  }
  get performanceWarnings() {
    return performanceFailureRisks(this.performanceStats, this.condition, { throttle: this.controller.model.state.throttle, speedMps: this.speed });
  }
  setPerformanceParts(parts: readonly InstalledPerformancePart[]): void {
    this.performanceParts = parts.map(part => ({ ...part }));
    this.setCondition(this.condition);
  }
  private wheelEffects: StatModifiers = NO_MODIFIERS;
  private wheelSet: Omit<WheelSetup, "tread" | "treadGripLoss"> = wheelSetup(null);
  /** Road wheel set and tread for the tire simulation; see `setCondition`. */
  get tireSetup(): WheelSetup {
    return { ...this.wheelSet, tread: this.condition.tires, treadGripLoss: treadGripLoss(this.definition.spec) };
  }
  private bodyEffects: ExteriorEffects = NO_EXTERIOR_EFFECTS;
  readonly wheels: WheelSwapper;
  private readonly impactListeners = new Set<(strength: number, point: Vector3 | null | undefined) => void>();
  /** Hard hits, with the contact point when Havok reports one. */
  onImpact(listener: (strength: number, point: Vector3 | null | undefined) => void): () => void {
    this.impactListeners.add(listener);
    return () => { this.impactListeners.delete(listener); };
  }
  readonly bodyParts: BodyPartSwapper;
  private readonly effects: VehicleEffects;
  /** Legacy presets do not have the four-wheel suspension solver, but every car still visibly moves on its springs. */

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
    this.effects = new VehicleEffects(visual.model.root.getScene(), body, visual.model,
      (text, intensity) => {
        if (text === 'DRIFT') {
          this.driftImpactSerial++;
          this.driftImpactStrength = intensity;
        }
        bridge.emit('driftCallout', { text, intensity });
      });
    this.suspensionDebug = new SuspensionDebugVisual(visual.model);
    bridge.handle("showSuspensionDebug", ({ enabled }) => { this.suspensionDebug.enabled = enabled; });
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
      // Only side-on hits near a wheel bend its suspension. The body landing on the road is
      // bottoming (the solver handles it), and a bumper hit on the centreline has no corner.
      const localHit = (event.point ?? this.body.position).subtract(this.body.position);
      const lateral = Vector3.Dot(localHit, this.body.right);
      const fromBelow = event.normal ? Math.abs(Vector3.Dot(event.normal, this.body.up)) > .7 : false;
      if (!fromBelow && Math.abs(lateral) > .4 && this.controller.suspension.settling === 0) {
        const side = lateral > 0 ? 1 : 0, axle = Vector3.Dot(localHit, this.body.forward) > 0 ? 0 : 2;
        damageCorner(this.suspension.saved, axle + side, .5 * this.suspension.saved.setup.corners[axle + side].unsprungMass * deltaV * deltaV, side ? 1 : -1);
      }
        bridge.emit("vehicleImpact", { strength: this.impactStrength });
        this.impactListeners.forEach((listener) => listener(this.impactStrength, event.point));
      this.impactCooldown = 0.32;
    });
    this.releaseImpact = () => impacts.remove(observer);
    this.hud = new SummaryPublisher((summary) => bridge.emit("vehicleStateUpdated", summary));


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
    bridge.handle("setDriverAssistance", ({ profile }) => {
      const parsed = assistanceProfileSchema.safeParse(profile);
      if (!parsed.success) return { rejected: "Unknown assistance profile" };
      if (!this.baseConfig.mechanical) return { rejected: "This preset uses legacy handling" };
      this.baseConfig = { ...this.baseConfig, mechanical: { ...this.baseConfig.mechanical, assistance: parsed.data } };
      this.setCondition(this.condition);
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
    const presetId = options.presetId ?? definition.tunes.street;
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
    if (placed) this.effects.clear();
    if (placed) this.onPlaced?.();
    return placed;
  }

  /** At rest at an arbitrary pose (e.g. a hub return point), in drive. The spawn point is unchanged. */
  placeAt(pose: VehiclePose): boolean {
    this.controller.reset();
    this.impactCooldown = 0.4;
    const placed = this.body.place(pose);
    if (placed) this.effects.clear();
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
    this.effects.clear();
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
    if (this.controller.model.config.mechanical) return this.controller.model.state.reversing ? -1 : this.controller.model.mechanics.powertrain.gear;
    return this.controller.model.state.reversing ? -1 : this.options.definition.gearThresholdsKmh.filter(kmh => this.speedKmh >= kmh).length;
  }
  /** Presentation RPM estimate: this arcade drivetrain has no simulated engine RPM. */
  get recordingMotion(): { rpm: number; suspension: number } {
    if (this.controller.model.config.mechanical) return { rpm: this.controller.model.mechanics.powertrain.engineRpm, suspension: this.controller.model.state.loadShift };
    const thresholds = this.options.definition.gearThresholdsKmh;
    const lower = thresholds[Math.max(0, this.gear - 1)] ?? 0;
    const upper = thresholds[this.gear] ?? lower + 45;
    const revs = Math.max(0, Math.min(1, (this.speedKmh - lower) / Math.max(1, upper - lower)));
    return { rpm: 850 + revs * 4800 + this.controller.model.state.throttle * 400, suspension: this.controller.model.state.loadShift };
  }

  update(dt: number): void {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const mechanics = this.controller.model.config.mechanical ? this.controller.model.mechanics : null;
    this.previewTime += dt;
    if (this.previewSolver) {
      const pulse = Math.sin(Math.min(Math.PI, this.previewTime * 1.4));
      this.previewSolver.preview(dt, this.previewMode === 'braking' ? -6 * pulse : this.previewMode === 'acceleration' ? 5 * pulse : 0,
        this.previewMode === 'cornering' ? 6 * pulse : 0, this.previewMode === 'lock' ? this.suspension.saved.setup.maxLock : 0);
      if (this.previewTime > 4) this.previewTime = 0;
    }
    this.visual.updateSuspension(dt, this.previewSolver ?? this.suspension, mechanics?.wheels.map(w => w.angularVelocity) ?? [0, 0, 0, 0], !!this.previewSolver);
    this.suspensionDebug.update(this.previewSolver ?? this.suspension);
    this.effects.update(dt, this.controller.model, this.condition.engine);
    this.hud.tick(dt, () => this.summarize());
    this.telemetryAge += dt;
    if (this.telemetryAge >= TELEMETRY_INTERVAL_SECONDS) {
      this.telemetryAge %= TELEMETRY_INTERVAL_SECONDS;
      this.bridge.emit("vehicleTelemetry", this.sample());
    }
  }

  setFuelAvailable(available: boolean): void { this.controller.fuelAvailable = available; }

  setHoodOpen(open: boolean): void { this.visual.model.setHoodOpen(open); }

  setStockSpoilerVisible(visible: boolean): void { this.visual.model.setStockSpoilerVisible(visible); }

  setCondition(condition: VehicleCondition): void {
    this.condition = { ...condition };
    this.controller.engineOperational = condition.engine > 0;
    this.calculatedPerformance = calculateVehiclePerformance(this.definition.spec, this.performanceParts, this.condition,
      { modifiers: combineModifiers(this.wheelEffects, this.bodyEffects.modifiers) }).stats;
    // The stats sheet keeps tire wear and the wheel set's grip; the physics gets them per corner
    // through the simulated tires (`tireSetup`), so the controller sees them neutral.
    const physics = calculateVehiclePerformance(this.definition.spec, this.performanceParts, { ...this.condition, tires: 1 },
      { modifiers: combineModifiers(physicalWheelModifiers(this.wheelEffects), this.bodyEffects.modifiers) }).stats;
    this.controller.setPerformance(this.baseConfig, calculateVehiclePerformance(this.definition.spec).stats, physics);
    this.controller.suspension.updateMass();
    this.setSuspension(this.suspension.saved);
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
    this.wheelSet = wheelSetup(part, condition);
    this.setCondition(this.condition);
    this.visual.model.wheels.forEach((wheel, i) => { this.suspension.radii[i] = wheel.radius; this.suspension.widths[i] = wheel.fit.widthM;
      this.suspension.offsets[i] = (this.definition.spec.wheels.stock.offsetMm - wheel.fit.offsetMm) / 1000; });
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
      slip: Math.min(1, Math.max(
        Math.abs(diagnostics.bodySlip) / .35,
        Math.abs(diagnostics.frontSlip) / .2 * diagnostics.frontGripUse,
        Math.abs(diagnostics.rearSlip) / .2 * diagnostics.rearGripUse,
      )), handbrake: diagnostics.handbrakeEffect,
      grounded: this.body.groundedWheels > 0 && !diagnostics.held, racing };
  }

  dispose(): void {
    this.suspensionDebug.dispose();
    this.effects.dispose();
    this.wheels.dispose();
    this.bodyParts.dispose();
    this.releaseImpact();
    this.controller.dispose();
    this.body.dispose();
  }

  /** Tito Jun's saved setup. A `?handling=` debug preset keeps priority for testing. */
  useTune(tune: TuneId): void {
    const presetId = this.options.presetId ?? this.definition.tunes[tune];
    if (presetId === this.presetId) return;
    this.applyPreset(presetId);
    this.publishDebugInfo();
  }

  private applyPreset(presetId: HandlingPresetId): void {
    const config = resolveHandlingPreset(HANDLING_PRESETS, presetId);
    this.presetId = presetId;
    this.baseConfig = config;
    this.setCondition(this.condition);
    this.controller.suspension.updateMass();
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
    const pose = { x: this.body.position.x, z: this.body.position.z, headingRad: Math.atan2(this.body.forward.x, this.body.forward.z) };
    if (state.reversing) return { speedKmh, gear: -1, ...pose };
    return { speedKmh, gear: this.gear, ...pose };
  }

  private sample(): VehicleTelemetry {
    const { state: s, diagnostics: d } = this.controller.model;
    return {
      suspension: this.suspensionTelemetry,
      ...(this.controller.model.config.mechanical ? { mechanics: {
        headingDeg: Math.atan2(this.forward.x, this.forward.z) * DEG,
        velocityHeadingDeg: Math.atan2(
          Math.sin(Math.atan2(this.forward.x, this.forward.z) + d.bodySlip),
          Math.cos(Math.atan2(this.forward.x, this.forward.z) + d.bodySlip)) * DEG,
        yawRateDeg: s.yawRate * DEG,
        drifting: this.controller.model.mechanics.detector.drifting,
        controls: { ...this.controller.model.mechanics.assistance.telemetry },
        wheels: this.controller.model.mechanics.wheels.map(w => ({ ...w })),
        ...this.controller.model.mechanics.powertrain,
        tcs: this.controller.model.config.mechanical.tcs, esc: this.controller.model.config.mechanical.esc,
      } } : {}),
      speedKmh: round(Math.hypot(s.vx, s.vy) * 3.6, 0),
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
      lateralLoadShift: round(s.lateralLoadShift, 3),
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
