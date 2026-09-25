import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT_CONFIG, PadAxis, PadButton, type InputConfig } from "./InputActions";
import { InputManager, shapeStick } from "./InputManager";

type FakePad = { axes: number[]; buttons: { pressed: boolean; value: number }[] };

function setup(config: InputConfig = DEFAULT_INPUT_CONFIG) {
  const target = new EventTarget();
  let pad: FakePad | null = null;
  const input = new InputManager(target, config, () =>
    pad ? [{ ...pad, connected: true, mapping: "standard" } as unknown as Gamepad] : [],
  );
  const key = (type: "keydown" | "keyup", code: string, repeat = false) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    target.dispatchEvent(event);
    return event;
  };
  const connectPad = () => {
    pad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    return pad;
  };
  return { target, input, key, connectPad };
}

describe("InputManager keyboard", () => {
  it("maps bound keys to named axes and clears them on release", () => {
    const { input, key } = setup();
    key("keydown", "KeyW");
    key("keydown", "ArrowLeft");
    input.update();
    expect(input.axis("throttle")).toBe(1);
    expect(input.axis("steer")).toBe(-1);

    key("keyup", "KeyW");
    key("keyup", "ArrowLeft");
    input.update();
    expect(input.axis("throttle")).toBe(0);
    expect(input.axis("steer")).toBe(0);
  });

  it("cancels opposite steering keys", () => {
    const { input, key } = setup();
    key("keydown", "KeyA");
    key("keydown", "KeyD");
    input.update();
    expect(input.axis("steer")).toBe(0);
  });

  it("reports a press once, on the frame it happened", () => {
    const { input, key } = setup();
    key("keydown", "KeyR");
    input.update();
    expect(input.pressed("recover")).toBe(true);
    expect(input.held("recover")).toBe(true);

    key("keydown", "KeyR", true); // auto-repeat
    input.update();
    expect(input.pressed("recover")).toBe(false);
    expect(input.held("recover")).toBe(true);
  });

  it("does not lose a tap that starts and ends between two frames", () => {
    const { input, key } = setup();
    key("keydown", "KeyC");
    key("keyup", "KeyC");
    input.update();
    expect(input.pressed("recenterCamera")).toBe(true);
    input.update();
    expect(input.pressed("recenterCamera")).toBe(false);
    expect(input.held("recenterCamera")).toBe(false);
  });

  it("drops held keys when the window loses focus", () => {
    const { target, input, key } = setup();
    key("keydown", "ArrowUp");
    target.dispatchEvent(new Event("blur"));
    input.update();
    expect(input.axis("throttle")).toBe(0);
  });

  it("only swallows keys it has a binding for", () => {
    const { key } = setup();
    expect(key("keydown", "ArrowUp").defaultPrevented).toBe(true);
    expect(key("keydown", "KeyZ").defaultPrevented).toBe(false);
  });

  it("stops listening after dispose", () => {
    const { input, key } = setup();
    input.dispose();
    key("keydown", "KeyW");
    input.update();
    expect(input.axis("throttle")).toBe(0);
  });
});

describe("InputManager gamepad", () => {
  it("reads triggers and the left stick through their deadzones", () => {
    const { input, connectPad } = setup();
    const pad = connectPad();
    pad.axes[PadAxis.LEFT_X] = 0.08;
    pad.buttons[PadButton.RT] = { pressed: true, value: 0.03 };
    input.update();
    expect(input.axis("steer")).toBe(0);
    expect(input.axis("throttle")).toBe(0);

    pad.axes[PadAxis.LEFT_X] = -1;
    pad.buttons[PadButton.RT] = { pressed: true, value: 1 };
    pad.buttons[PadButton.LT] = { pressed: true, value: 0.5 };
    input.update();
    expect(input.axis("steer")).toBe(-1);
    expect(input.axis("throttle")).toBe(1);
    expect(input.axis("brake")).toBeGreaterThan(0.45);
    expect(input.axis("brake")).toBeLessThan(0.5);
  });

  it("uses whichever device is pushed furthest", () => {
    const { input, key, connectPad } = setup();
    const pad = connectPad();
    pad.axes[PadAxis.LEFT_X] = 0.5;
    key("keydown", "ArrowLeft");
    input.update();
    expect(input.axis("steer")).toBe(-1);

    key("keyup", "ArrowLeft");
    input.update();
    expect(input.axis("steer")).toBeGreaterThan(0);
    expect(input.axis("steer")).toBeLessThan(0.5);
  });

  it("edge-detects pad buttons", () => {
    const { input, connectPad } = setup();
    const pad = connectPad();
    pad.buttons[PadButton.Y] = { pressed: true, value: 1 };
    input.update();
    expect(input.pressed("recover")).toBe(true);
    input.update();
    expect(input.pressed("recover")).toBe(false);
    pad.buttons[PadButton.Y] = { pressed: false, value: 0 };
    input.update();
    pad.buttons[PadButton.Y] = { pressed: true, value: 1 };
    input.update();
    expect(input.pressed("recover")).toBe(true);
  });

  it("takes deadzones from config", () => {
    const { input, connectPad } = setup({
      ...DEFAULT_INPUT_CONFIG,
      deadzones: { ...DEFAULT_INPUT_CONFIG.deadzones, stick: 0.3 },
    });
    connectPad().axes[PadAxis.LEFT_X] = 0.25;
    input.update();
    expect(input.axis("steer")).toBe(0);
  });
});

describe("shapeStick", () => {
  const dz = { stick: 0.1, stickOuter: 0.1, trigger: 0 };

  it("is continuous at the deadzone edge and reaches full before the rim", () => {
    expect(shapeStick(0.1, dz)).toBe(0);
    expect(shapeStick(0.11, dz)).toBeCloseTo(0.0125, 4);
    expect(shapeStick(0.9, dz)).toBe(1);
    expect(shapeStick(-0.95, dz)).toBe(-1);
  });

  it("softens small deflections with a curve above 1", () => {
    expect(shapeStick(0.5, dz, 2)).toBeCloseTo(0.25, 5);
    expect(shapeStick(-0.5, dz, 2)).toBeCloseTo(-0.25, 5);
  });
});
