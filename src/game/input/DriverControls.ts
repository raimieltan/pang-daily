import type { GameSystem } from "../engine/types";
import type { DriverInput } from "../vehicles/handling/ArcadeHandlingModel";
import type { DriverInputSource } from "../vehicles/VehicleController";

const STICK_DEADZONE = 0.12;
const TRIGGER_DEADZONE = 0.05;
/** >1 softens the stick around centre so small corrections at speed stay small. */
const STICK_CURVE = 1.6;

// Standard gamepad mapping (https://w3c.github.io/gamepad/#remapping).
const PAD_LEFT_TRIGGER = 6;
const PAD_RIGHT_TRIGGER = 7;
const PAD_A = 0;
const PAD_BACK = 8;

const KEYS: Record<"throttle" | "brake" | "left" | "right" | "reset", readonly string[]> = {
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  reset: ["KeyR"],
};

const DRIVING_KEYS = new Set<string>(Object.values(KEYS).flat());

export type DriverControlsOptions = {
  /** Called once per press of reset (R / gamepad Back). */
  onReset?(): void;
};

/**
 * Keyboard + gamepad → `DriverInput`. Keys are digital; the handling model's pedal and
 * steering ramps turn them into progressive inputs, so nothing is smoothed here.
 * The gamepad wins whenever it is being used; otherwise the keyboard drives.
 *
 * Listens on `window` and ignores keys typed into form fields, so the debug UI stays usable.
 */
export class DriverControls implements GameSystem, DriverInputSource {
  readonly name = "driverControls";
  private readonly held = new Set<string>();
  private readonly current: DriverInput = { throttle: 0, brake: 0, steer: 0 };
  private padResetWasDown = false;

  constructor(
    private readonly target: Window = window,
    private readonly options: DriverControlsOptions = {},
  ) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  read(): DriverInput {
    return this.current;
  }

  /** Samples devices once per frame; physics steps within the frame reuse the sample. */
  update(): void {
    const key = (codes: readonly string[]) => (codes.some((code) => this.held.has(code)) ? 1 : 0);
    let throttle = key(KEYS.throttle);
    let brake = key(KEYS.brake);
    let steer = key(KEYS.right) - key(KEYS.left);

    const pad = activeGamepad();
    if (pad) {
      const stick = pad.axes[0] ?? 0;
      const rt = trigger(pad.buttons[PAD_RIGHT_TRIGGER]) || trigger(pad.buttons[PAD_A]);
      const lt = trigger(pad.buttons[PAD_LEFT_TRIGGER]);
      if (Math.abs(stick) > STICK_DEADZONE) steer = shapeStick(stick);
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);

      const resetDown = pad.buttons[PAD_BACK]?.pressed ?? false;
      if (resetDown && !this.padResetWasDown) this.options.onReset?.();
      this.padResetWasDown = resetDown;
    }

    this.current.throttle = throttle;
    this.current.brake = brake;
    this.current.steer = steer;
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    this.held.clear();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event) || !DRIVING_KEYS.has(event.code)) return;
    // Arrow keys would otherwise scroll the page or move focus in the HUD.
    event.preventDefault();
    if (KEYS.reset.includes(event.code) && !event.repeat) this.options.onReset?.();
    this.held.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  /** Keys released while the tab is unfocused never send keyup; drop them all. */
  private onBlur = () => {
    this.held.clear();
  };
}

function activeGamepad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (pad?.connected && pad.mapping === "standard") return pad;
  }
  return null;
}

function trigger(button: GamepadButton | undefined): number {
  const value = button?.value ?? 0;
  return value > TRIGGER_DEADZONE ? value : 0;
}

function shapeStick(x: number): number {
  const magnitude = (Math.abs(x) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return Math.sign(x) * Math.min(1, magnitude) ** STICK_CURVE;
}

function isTyping(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName));
}
