import { SuspensionRuntime } from "./SuspensionRuntime";
import { physicalConfig } from "./suspensionConfig";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { ArcadeHandlingModel, type DriverInput } from "./handling/ArcadeHandlingModel";
import type { VehicleControlInput } from "./handling/DriverAssistance";
import type { HandlingConfig } from "./handling/HandlingConfig";
import type { VehicleBody } from "./VehicleBody";
import type { PerformanceStats } from '../../game-core/performance/calculator';
import { performanceHandling } from '../maintenance/conditionHandling';

/** Anything that can say what the driver wants this step (keyboard/gamepad, AI, replay, tests). */
/** Per-second pull back to the spot the car was held at. Soaks up solver drift on slopes. */
const HOLD_ANCHOR_RATE = 10;

export interface DriverInputSource {
  read(): DriverInput | VehicleControlInput;
}

/** Fixed-step adapter: sample chassis motion and road, solve suspension/tire forces, then
 * let Havok integrate the chassis. Static parking is the only velocity constraint here. */
export class VehicleController {
  readonly model: ArcadeHandlingModel;
  readonly suspension: SuspensionRuntime;
 fuelAvailable = true;
  engineOperational = true;
  /** Speed supplied by a person pushing from behind, independent of engine power. */
  pushSpeedMps = 0;
  private readonly release: () => void;
  private readonly linear = new Vector3();
  private readonly angular = new Vector3();
  private readonly com = new Vector3();
  private holdAnchor: Vector3 | null = null;
  /** Set by a teleport: the car stays parked, even through its landing, until driven or pushed. */
  private parked = true;

  constructor(
    world: PhysicsWorld,
    readonly vehicle: VehicleBody,
    config: HandlingConfig,
    private readonly input: DriverInputSource,
  ) {
    this.model = new ArcadeHandlingModel(physicalConfig(config));
    this.suspension = new SuspensionRuntime(world, vehicle, this.model);
    this.release = world.onBeforeStep((dt) => this.step(dt, world.gravity));
  }

  private step(dt: number, gravity: Vector3): void {
    const { vehicle, model, linear, angular } = this;
    const { body, forward, right, up } = vehicle;

    vehicle.updateAxes();
    // Suspension probes below determine actual contact.
    body.getLinearVelocityToRef(linear);
    body.getAngularVelocityToRef(angular);

    const vUp = Vector3.Dot(linear, up);
    model.syncMotion(Vector3.Dot(linear, forward), Vector3.Dot(linear, right), Vector3.Dot(angular, up));
    this.suspension.step(dt, linear, angular);
    const raw = this.input.read();
    const controls = 'steering' in raw ? { ...raw, steer: raw.steering } : raw;
    model.step(dt, { ...controls, engineAvailable: this.fuelAvailable && this.engineOperational }, vehicle.contact);
    if (this.pushSpeedMps > 0 && Math.max(vehicle.contact.front, vehicle.contact.rear) > 0) {
      model.state.vx = Math.max(model.state.vx, this.pushSpeedMps);
      model.state.vy = 0;
      model.state.yawRate = 0;
      model.diagnostics.held = false;
    }
    if (vehicle.isTeleporting) { this.parked = true; this.holdAnchor = null; return; }
    // Any drive demand releases it; in reverse the brake pedal is the drive pedal.
    if ((controls.throttle ?? 0) > .01 || model.state.reversing || this.pushSpeedMps > 0) this.parked = false;
    const grounded = vehicle.contact.front + vehicle.contact.rear > 0;

    // The mechanical model predicts planar motion to solve wheel slip, but Havok integrates
    // the actual chassis once from these forces. Never overwrite its yaw/pitch/roll velocities.
    if (this.pushSpeedMps > 0) {
      const along = Vector3.Dot(linear, forward);
      if (along < this.pushSpeedMps) body.applyForce(forward.scale((this.pushSpeedMps - along) * model.config.chassis.massKg * 2), vehicle.position);
    }
    if (grounded && (model.diagnostics.held || this.parked)) {
      // Static brake constraint, as impulses: cancel planar and yaw motion and pull back to
      // the held spot. Velocity writes would leave Havok's reported vertical speed biased.
      // Vertical suspension settling stays free.
      const { mass, centerOfMass, inertia } = body.getMassProperties();
      const com = vehicle.toWorld(centerOfMass!, this.com);
      this.holdAnchor ??= vehicle.position.clone();
      const target = this.holdAnchor.subtract(vehicle.position).scaleInPlace(HOLD_ANCHOR_RATE);
      target.subtractInPlace(up.scale(Vector3.Dot(target, up)));
      const planar = linear.subtract(up.scale(vUp));
      body.applyImpulse(target.subtractInPlace(planar).scaleInPlace(mass!), com);
      const alongGravity = gravity.subtract(up.scale(Vector3.Dot(gravity, up)));
      body.applyForce(alongGravity.scaleInPlace(-mass!), com);
      body.applyAngularImpulse(up.scale(-Vector3.Dot(angular, up) * mass! * inertia!.y));
    } else {
      this.holdAnchor = null;
    }
    this.suspension.applyTireForces();

  }

  setPerformance(base: HandlingConfig, stock: PerformanceStats, final: PerformanceStats): void {
    this.setConfig(performanceHandling(base, stock, final));
  }

  setConfig(config: HandlingConfig): void {
    this.model.setConfig(physicalConfig(config));
    this.suspension.updateMass();
  }

  /** Clears handling state (gear, pedals, lift-off). Pair with `VehicleBody.place`. */
  reset(): void {
    this.model.reset();
    this.suspension.reset();
    this.pushSpeedMps = 0;
    this.holdAnchor = null;
  }

  dispose(): void {
    this.release();
  }
}
