import type { WalkCameraInput } from "../cameras/WalkCamera";
import type { GameSystem } from "../engine/types";
import type { InputManager } from "./InputManager";

/**
 * The on-foot context of the input layer: camera-relative movement, camera orbit and the
 * interact button. Reads nothing while disabled (the player is driving).
 *
 * Add after `InputManager` and before physics, like `DriverControls`.
 */
export class WalkControls implements GameSystem, WalkCameraInput {
  readonly name = "walkControls";
  /** −1..1 strafe and forward, relative to the camera. */
  moveX = 0;
  moveY = 0;
  lookX = 0;
  interactPressed = false;
  enabled = false;

  constructor(private readonly input: InputManager) {}

  update(): void {
    const { input } = this;
    if (!this.enabled) {
      this.moveX = this.moveY = this.lookX = 0;
      this.interactPressed = false;
      return;
    }
    this.moveX = input.axis("moveX");
    this.moveY = input.axis("moveY");
    this.lookX = input.axis("lookX");
    this.interactPressed = input.pressed("interact");
  }
}
