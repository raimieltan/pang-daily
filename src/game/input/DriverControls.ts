import type { ChaseCameraInput } from "../cameras/ChaseCamera";
import type { GameSystem } from "../engine/types";
import type { DriverInput } from "../vehicles/handling/ArcadeHandlingModel";
import type { DriverInputSource } from "../vehicles/VehicleController";
import type { InputManager } from "./InputManager";

/** Nobody at the wheel: pedals up, handbrake on. */
const PARKED: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: true };

export type DriverControlsOptions = {
  onHorn?(): void;
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
 * While disabled (the player is on foot) it holds the car parked and reads nothing.
 */
export class DriverControls implements GameSystem, DriverInputSource, ChaseCameraInput {
  readonly name = "driverControls";
  private readonly current: DriverInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  lookX = 0;
  /** `enterExit` went down this frame. The player mode system decides whether that gets you out. */
  enterExitPressed = false;
  enabled = true;

  constructor(
    private readonly input: InputManager,
    private readonly options: DriverControlsOptions = {},
  ) {}

  read(): DriverInput {
    return this.enabled ? this.current : PARKED;
  }

  update(): void {
    const { input, options } = this;
    if (!this.enabled) {
      Object.assign(this.current, PARKED);
      this.lookX = 0;
      this.enterExitPressed = false;
      return;
    }
    this.current.throttle = input.axis("throttle");
    this.current.brake = input.axis("brake");
    this.current.steer = input.axis("steer");
    this.current.handbrake = input.held("handbrake");
    this.lookX = input.axis("lookX");
    this.enterExitPressed = input.pressed("enterExit");

    if (input.pressed("recover")) options.onRecover?.();
    if (input.pressed("horn")) options.onHorn?.();
    if (input.pressed("resetToSpawn")) options.onResetToSpawn?.();
    if (input.pressed("recenterCamera")) options.onRecenterCamera?.();
  }
}
