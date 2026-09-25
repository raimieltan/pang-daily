/**
 * Every player action the game understands, and the one table that binds them to devices.
 * Gameplay reads actions by name from `InputManager`; nothing outside `src/game/input`
 * sees key codes, gamepad indices or browser events.
 *
 * Walking (and anything else) adds its own actions here — e.g. `moveX`, `moveY`, `interact` —
 * and may share physical keys with driving: whichever controller is active reads its actions.
 */

/** Analogue actions. `unit` actions read 0..1, `signed` ones −1..1. */
export const AXIS_ACTIONS = {
  throttle: "unit",
  /** Brake; held at a standstill, reverse. */
  brake: "unit",
  /** −1 left .. 1 right. */
  steer: "signed",
  /** Camera look-around, −1 left .. 1 right. Springs back when released. */
  lookX: "signed",
} as const;

export const BUTTON_ACTIONS = [
  /** Held: rear loosens so the car rotates into hairpins (see `HandlingConfig.handbrake`). */
  "handbrake",
  /** Put the car back on its wheels where it is. */
  "recover",
  /** Back to the current spawn point, at rest. */
  "resetToSpawn",
  "recenterCamera",
  /** Get in / out of the car. Bound now so walking can pick it up without a rebind. */
  "enterExit",
] as const;

export type AxisAction = keyof typeof AXIS_ACTIONS;
export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

/** Standard gamepad mapping (https://w3c.github.io/gamepad/#remapping). */
export const PadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
} as const;

export const PadAxis = { LEFT_X: 0, LEFT_Y: 1, RIGHT_X: 2, RIGHT_Y: 3 } as const;

/** One gamepad input feeding an axis action: a stick axis, or a (possibly analogue) button such as a trigger. */
export type PadAxisSource = { stick: number; invert?: boolean } | { button: number };

export type AxisBinding = {
  /** `KeyboardEvent.code`s. Keys are digital: the consumer (e.g. the handling model's ramps) smooths them. */
  positive?: readonly string[];
  negative?: readonly string[];
  pad?: readonly PadAxisSource[];
  /** Stick response exponent after the deadzone; > 1 softens small deflections. */
  curve?: number;
};

export type ButtonBinding = {
  keys?: readonly string[];
  pad?: readonly number[];
};

export type Deadzones = {
  /** Stick deflection ignored around centre (0..1). The rest is rescaled so output still starts at 0. */
  stick: number;
  /** Deflection this close to the rim already reads as full, so worn sticks still reach 1. */
  stickOuter: number;
  /** Trigger travel ignored at rest. */
  trigger: number;
};

export type InputConfig = {
  axes: Readonly<Record<AxisAction, AxisBinding>>;
  buttons: Readonly<Record<ButtonAction, ButtonBinding>>;
  deadzones: Deadzones;
};

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  axes: {
    throttle: { positive: ["ArrowUp", "KeyW"], pad: [{ button: PadButton.RT }, { button: PadButton.A }] },
    brake: { positive: ["ArrowDown", "KeyS"], pad: [{ button: PadButton.LT }, { button: PadButton.X }] },
    steer: {
      positive: ["ArrowRight", "KeyD"],
      negative: ["ArrowLeft", "KeyA"],
      pad: [{ stick: PadAxis.LEFT_X }],
      curve: 1.6,
    },
    lookX: { positive: ["KeyE"], negative: ["KeyQ"], pad: [{ stick: PadAxis.RIGHT_X }] },
  },
  buttons: {
    handbrake: { keys: ["Space"], pad: [PadButton.B] },
    recover: { keys: ["KeyR"], pad: [PadButton.Y] },
    resetToSpawn: { keys: ["Backspace"], pad: [PadButton.BACK] },
    recenterCamera: { keys: ["KeyC"], pad: [PadButton.R3] },
    enterExit: { keys: ["KeyF"], pad: [PadButton.RB] },
  },
  deadzones: { stick: 0.12, stickOuter: 0.04, trigger: 0.05 },
};
