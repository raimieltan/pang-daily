import type { GameSystem } from "../engine/types";
import {
  AXIS_ACTIONS,
  BUTTON_ACTIONS,
  DEFAULT_INPUT_CONFIG,
  type AxisAction,
  type AxisBinding,
  type ButtonAction,
  type Deadzones,
  type InputConfig,
} from "./InputActions";

export type GamepadSource = () => readonly (Gamepad | null)[];

/**
 * The only place that touches keyboard and gamepad APIs. Samples every device once per
 * frame (add it before any system that reads it) into named action values:
 *
 *   axis("steer")          −1..1 / 0..1, whichever device is pushed furthest wins
 *   held("recover")        down this frame
 *   pressed("recover")     went down this frame (once per press, including taps shorter than a frame)
 *
 * Listens on `window` and ignores keys typed into form fields, so the debug UI stays usable.
 */
export class InputManager implements GameSystem {
  readonly name = "input";
  private config: InputConfig;
  private boundKeys: Set<string>;
  private readonly keysDown = new Set<string>();
  /** Keys that went down since the last sample, so a tap between two frames still counts. */
  private readonly keysTapped = new Set<string>();
  private readonly axes = new Map<AxisAction, number>();
  private readonly down = new Set<ButtonAction>();
  private readonly justPressed = new Set<ButtonAction>();

  constructor(
    private readonly target: EventTarget = window,
    config: InputConfig = DEFAULT_INPUT_CONFIG,
    private readonly gamepads: GamepadSource = browserGamepads,
  ) {
    this.config = config;
    this.boundKeys = collectKeys(config);
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
    target.addEventListener("blur", this.onBlur);
  }

  axis(action: AxisAction): number {
    return this.axes.get(action) ?? 0;
  }

  held(action: ButtonAction): boolean {
    return this.down.has(action);
  }

  pressed(action: ButtonAction): boolean {
    return this.justPressed.has(action);
  }

  /** Swap bindings or deadzones at runtime (settings screen, tuning). */
  setConfig(config: InputConfig): void {
    this.config = config;
    this.boundKeys = collectKeys(config);
  }

  update(): void {
    const pad = activeGamepad(this.gamepads());
    const { axes, buttons, deadzones } = this.config;

    for (const action of Object.keys(AXIS_ACTIONS) as AxisAction[]) {
      const value = readAxis(axes[action], this.keysDown, pad, deadzones);
      this.axes.set(action, AXIS_ACTIONS[action] === "unit" ? clamp(value, 0, 1) : clamp(value, -1, 1));
    }

    for (const action of BUTTON_ACTIONS) {
      const { keys = [], pad: padButtons = [] } = buttons[action];
      const isDown =
        keys.some((code) => this.keysDown.has(code) || this.keysTapped.has(code)) ||
        (!!pad && padButtons.some((i) => pad.buttons[i]?.pressed));
      const tapped = keys.some((code) => this.keysTapped.has(code));
      if ((isDown && !this.down.has(action)) || tapped) this.justPressed.add(action);
      else this.justPressed.delete(action);
      if (isDown) this.down.add(action);
      else this.down.delete(action);
    }
    this.keysTapped.clear();
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.target.removeEventListener("blur", this.onBlur);
    this.keysDown.clear();
    this.keysTapped.clear();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event) || !this.boundKeys.has(event.code)) return;
    // Arrow keys and Space would otherwise scroll the page or press a focused HUD button.
    event.preventDefault();
    if (event.repeat) return;
    this.keysDown.add(event.code);
    this.keysTapped.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keysDown.delete(event.code);
  };

  /** Keys released while the tab is unfocused never send keyup; drop them all. */
  private onBlur = () => {
    this.keysDown.clear();
  };
}

function readAxis(binding: AxisBinding, keys: ReadonlySet<string>, pad: Gamepad | null, dz: Deadzones): number {
  const any = (codes: readonly string[] = []) => (codes.some((code) => keys.has(code)) ? 1 : 0);
  let value = any(binding.positive) - any(binding.negative);
  if (!pad) return value;

  for (const source of binding.pad ?? []) {
    const padValue =
      "stick" in source
        ? shapeStick((pad.axes[source.stick] ?? 0) * (source.invert ? -1 : 1), dz, binding.curve ?? 1)
        : shapeTrigger(pad.buttons[source.button]?.value ?? 0, dz.trigger);
    if (Math.abs(padValue) > Math.abs(value)) value = padValue;
  }
  return value;
}

/** Deadzone, rescale to 0..1 between the inner and outer deadzones, then apply the response curve. */
export function shapeStick(raw: number, dz: Deadzones, curve = 1): number {
  const magnitude = (Math.abs(raw) - dz.stick) / (1 - dz.stick - dz.stickOuter);
  if (magnitude <= 0) return 0;
  return Math.sign(raw) * Math.min(1, magnitude) ** curve;
}

export function shapeTrigger(raw: number, deadzone: number): number {
  return raw > deadzone ? Math.min(1, (raw - deadzone) / (1 - deadzone)) : 0;
}

function collectKeys(config: InputConfig): Set<string> {
  const keys = new Set<string>();
  for (const { positive = [], negative = [] } of Object.values(config.axes)) {
    for (const code of [...positive, ...negative]) keys.add(code);
  }
  for (const { keys: codes = [] } of Object.values(config.buttons)) {
    for (const code of codes) keys.add(code);
  }
  return keys;
}

function browserGamepads(): readonly (Gamepad | null)[] {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  return navigator.getGamepads();
}

function activeGamepad(pads: readonly (Gamepad | null)[]): Gamepad | null {
  for (const pad of pads) {
    if (pad?.connected && pad.mapping === "standard") return pad;
  }
  return null;
}

function isTyping(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName));
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
