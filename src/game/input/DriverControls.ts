import type { ChaseCameraInput } from "../cameras/ChaseCamera";
import type { GameSystem } from "../engine/types";
import type { DriverInput } from "../vehicles/handling/ArcadeHandlingModel";
import type { DriverInputSource } from "../vehicles/VehicleController";
import type { InputManager } from "./InputManager";

export type DriverControlsOptions = {
  onRecover?(): void;
  onResetToSpawn?(): void;
  onRecenterCamera?(): void;
};

/**
 * The driving context of the input layer: named actions → `DriverInput` for the handling
 * model, the camera look axis, and one-shot vehicle/camera actions. Pedals and steering pass
 * through unsmoothed; the handling model's ramps make digital keys progressive.
 *
 * Add after `InputManager` and before physics, so each frame's physics steps see this frame's sample.
 */
export class DriverControls implements GameSystem, DriverInputSource, ChaseCameraInput {
  readonly name = "driverControls";
  private readonly current: DriverInput = { throttle: 0, brake: 0, steer: 0 };
  lookX = 0;

  constructor(
    private readonly input: InputManager,
    private readonly options: DriverControlsOptions = {},
  ) {}

  read(): DriverInput {
    return this.current;
  }

  update(): void {
    const { input, options } = this;
    this.current.throttle = input.axis("throttle");
    this.current.brake = input.axis("brake");
    this.current.steer = input.axis("steer");
    this.lookX = input.axis("lookX");

    if (input.pressed("recover")) options.onRecover?.();
    if (input.pressed("resetToSpawn")) options.onResetToSpawn?.();
    if (input.pressed("recenterCamera")) options.onRecenterCamera?.();
  }
}
