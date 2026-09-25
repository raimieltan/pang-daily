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

const G = 9.81;
const DEG = 180 / Math.PI;
const TELEMETRY_INTERVAL_SECONDS = 0.1;

export type PlayerVehicleOptions = {
  definition: VehicleRuntimeDefinition;
  spawnPoints: Readonly<Record<SpawnPointId, VehiclePose>>;
  initialSpawn: SpawnPointId;
  /** Overrides the definition's preset (e.g. from `?handling=`). */
  presetId?: HandlingPresetId;
};

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

  private constructor(
    private readonly bridge: RuntimePort,
    private readonly options: PlayerVehicleOptions,
    readonly body: VehicleBody,
    readonly controller: VehicleController,
    readonly visual: VehicleVisual,
    presetId: HandlingPresetId,
  ) {
    this.presetId = presetId;
    this.spawnId = options.initialSpawn;
    this.hud = new SummaryPublisher((summary) => bridge.emit("vehicleStateUpdated", summary));
    this.telemetry = new SummaryPublisher(
      (sample) => bridge.emit("vehicleTelemetry", sample),
      TELEMETRY_INTERVAL_SECONDS,
    );

    bridge.handle("spawnAt", ({ spawnPointId }) => {
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
    this.controller.reset();
    const placed = this.body.place(this.options.spawnPoints[this.spawnId]);
    if (placed) this.onPlaced?.();
    return placed;
  }

  /** At rest at an arbitrary pose (e.g. a hub return point), in drive. The spawn point is unchanged. */
  placeAt(pose: VehiclePose): boolean {
    this.controller.reset();
    const placed = this.body.place(pose);
    if (placed) this.onPlaced?.();
    return placed;
  }

  /**
   * Back on its wheels where it is (rolled, beached, stuck on a wall), facing the same way.
   * Falls back to the spawn point when there is no road underneath.
   */
  recover(): boolean {
    const { position, forward } = this.body;
    const pose: VehiclePose = { position: position.clone(), headingRad: Math.atan2(forward.x, forward.z) };
    this.controller.reset();
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

  update(dt: number): void {
    const { state } = this.controller.model;
    this.visual.update(dt, state.steerAngle, state.vx);
    this.hud.tick(dt, () => this.summarize());
    this.telemetry.tick(dt, () => this.sample());
  }

  dispose(): void {
    this.controller.dispose();
    this.body.dispose();
  }

  private applyPreset(presetId: HandlingPresetId): void {
    const config = resolveHandlingPreset(HANDLING_PRESETS, presetId);
    this.presetId = presetId;
    this.controller.setConfig(config);
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
