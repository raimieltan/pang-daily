import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { ArcadeHandlingModel, type DriverInput } from "./handling/ArcadeHandlingModel";
import type { HandlingConfig } from "./handling/HandlingConfig";
import type { VehicleBody } from "./VehicleBody";

/** Per-second pull back to the spot the car was held at. Soaks up solver drift on slopes. */
const HOLD_ANCHOR_RATE = 10;

/** Anything that can say what the driver wants this step (keyboard/gamepad, AI, replay, tests). */
export interface DriverInputSource {
  read(): DriverInput;
}

/**
 * Glue between the handling model and the rigid body, run before every fixed physics step:
 *
 *   body velocity → car frame → model.syncMotion → model.step → back to world → Havok step
 *
 * The model owns planar velocity and yaw; Havok keeps the velocity along the car's up axis
 * (gravity, bumps, landings), pitch/roll, and everything that happens in collisions,
 * which the next sync then picks up.
 */
export class VehicleController {
  readonly model: ArcadeHandlingModel;
  private readonly release: () => void;
  private readonly linear = new Vector3();
  private readonly angular = new Vector3();
  private readonly tmp = new Vector3();
  private readonly spin = new Quaternion();
  private readonly nextForward = new Vector3();
  private readonly nextRight = new Vector3();
  private holdAnchor: Vector3 | null = null;

  constructor(
    world: PhysicsWorld,
    readonly vehicle: VehicleBody,
    config: HandlingConfig,
    private readonly input: DriverInputSource,
  ) {
    this.model = new ArcadeHandlingModel(config);
    this.release = world.onBeforeStep((dt) => this.step(dt, world.gravity));
  }

  private step(dt: number, gravity: Vector3): void {
    const { vehicle, model, linear, angular } = this;
    const { body, forward, right, up } = vehicle;

    vehicle.updateAxes();
    vehicle.updateContacts();
    body.getLinearVelocityToRef(linear);
    body.getAngularVelocityToRef(angular);

    const vUp = Vector3.Dot(linear, up);
    model.syncMotion(Vector3.Dot(linear, forward), Vector3.Dot(linear, right), Vector3.Dot(angular, up));
    model.step(dt, this.input.read(), vehicle.contact);
    const { vx, vy, yawRate } = model.state;

    // The model integrates in the car's frame, which Havok is about to rotate by yawRate·dt.
    // Write the planar velocity against the post-step axes, or the turn would be counted twice.
    Quaternion.RotationAxisToRef(up, yawRate * dt, this.spin);
    forward.rotateByQuaternionToRef(this.spin, this.nextForward);
    right.rotateByQuaternionToRef(this.spin, this.nextRight);
    linear.copyFrom(up).scaleInPlace(vUp);
    linear.addInPlace(this.nextForward.scaleInPlace(vx)).addInPlace(this.nextRight.scaleInPlace(vy));

    if (model.diagnostics.held) {
      // Havok is about to add gravity; pre-cancel the part along the road, then pull back
      // any leftover solver drift, so a car parked on a slope doesn't creep.
      const along = this.tmp.copyFrom(gravity).subtractInPlace(up.scale(Vector3.Dot(gravity, up)));
      linear.subtractInPlace(along.scaleInPlace(dt));
      this.holdAnchor ??= vehicle.position.clone();
      const drift = this.tmp.copyFrom(this.holdAnchor).subtractInPlace(vehicle.position);
      drift.subtractInPlace(up.scale(Vector3.Dot(drift, up)));
      linear.addInPlace(drift.scaleInPlace(HOLD_ANCHOR_RATE));
    } else {
      this.holdAnchor = null;
    }
    body.setLinearVelocity(linear);

    // Keep Havok's pitch/roll, replace yaw.
    angular.subtractInPlace(up.scale(Vector3.Dot(angular, up))).addInPlace(up.scale(yawRate));
    body.setAngularVelocity(angular);
  }

  setConfig(config: HandlingConfig): void {
    this.model.setConfig(config);
  }

  /** Clears handling state (gear, pedals, lift-off). Pair with `VehicleBody.place`. */
  reset(): void {
    this.model.reset();
    this.holdAnchor = null;
  }

  dispose(): void {
    this.release();
  }
}
