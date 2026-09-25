import { describe, expect, it } from "vitest";
import { ArcadeHandlingModel, type AxleContact, type DriverInput } from "./ArcadeHandlingModel";
import { applyHandlingOverrides, resolveHandlingPreset, type HandlingOverrides } from "./HandlingConfig";
import { HANDLING_PRESETS, type HandlingPresetId } from "./presets";

const DT = 1 / 120;
const GROUNDED: AxleContact = { front: 1, rear: 1 };
const input = (throttle: number, brake: number, steer: number): DriverInput => ({ throttle, brake, steer });

function car(kmh = 0, preset: HandlingPresetId = "fwd_worn_sedan", overrides: HandlingOverrides = {}) {
  const model = new ArcadeHandlingModel(applyHandlingOverrides(resolveHandlingPreset(HANDLING_PRESETS, preset), overrides));
  model.state.vx = kmh / 3.6;
  return model;
}

/** Steps the model; `each` sees the model after every step. */
function drive(model: ArcadeHandlingModel, seconds: number, driver: DriverInput, each?: (m: ArcadeHandlingModel) => void) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    model.step(DT, driver, GROUNDED);
    each?.(model);
  }
  return model;
}

const kmh = (m: ArcadeHandlingModel) => m.state.vx * 3.6;

describe("ArcadeHandlingModel — controls", () => {
  it("accelerates like a tired 1.5L and tops out below the configured top speed", () => {
    const m = car();
    let zeroToHundred = 0;
    drive(m, 40, input(1, 0, 0), (x) => {
      if (!zeroToHundred && kmh(x) >= 100) zeroToHundred = x.state.vx;
    });
    expect(zeroToHundred).toBeGreaterThan(0);
    expect(kmh(m)).toBeGreaterThan(150);
    expect(kmh(m)).toBeLessThan(180);
  });

  it("brakes predictably: straight, no reversal, distance close to v²/2a", () => {
    const m = car(100);
    let distance = 0;
    let stoppedAt = 0;
    drive(m, 6, input(0, 1, 0), (x) => {
      distance += x.state.vx * DT;
      if (!stoppedAt && x.state.vx <= 0) stoppedAt = distance;
    });
    const ideal = (100 / 3.6) ** 2 / (2 * m.config.brakes.decelerationMps2);
    expect(stoppedAt).toBeGreaterThan(0);
    expect(m.state.yawRate).toBe(0);
    distance = stoppedAt;
    expect(distance).toBeGreaterThan(ideal * 0.8);
    expect(distance).toBeLessThan(ideal * 1.15);
  });

  it("holding brake at a standstill selects reverse after a pause, capped at reverse top speed", () => {
    const paused = drive(car(), 0.2, input(0, 1, 0));
    expect(paused.state.reversing).toBe(false);
    expect(paused.state.vx).toBe(0);

    const m = drive(car(), 6, input(0, 1, 0));
    expect(m.state.reversing).toBe(true);
    expect(kmh(m)).toBeLessThan(-15);
    expect(kmh(m)).toBeGreaterThanOrEqual(-m.config.drive.reverseTopSpeedKmh);

    // Throttle while reversing brakes first, then selects drive once stopped.
    drive(m, 4, input(1, 0, 0));
    expect(m.state.reversing).toBe(false);
    expect(kmh(m)).toBeGreaterThan(5);
  });

  it("steering is speed sensitive and rate limited", () => {
    const slow = drive(car(15), 0.05, input(0.2, 0, 1));
    const fast = drive(car(110), 0.05, input(0.2, 0, 1));
    expect(fast.diagnostics.maxSteerAngle).toBeLessThan(slow.diagnostics.maxSteerAngle / 4);
    // 0.05s is a quarter of the turn-in time: neither car is at full lock yet.
    expect(slow.state.steerAngle).toBeLessThan(slow.diagnostics.maxSteerAngle * 0.3);

    drive(slow, 0.3, input(0.2, 0, 1));
    expect(slow.state.steerAngle).toBeCloseTo(slow.diagnostics.maxSteerAngle, 3);
  });

  it("pedals ramp, so a keyboard tap is a progressive transition", () => {
    const m = drive(car(50), 1 / 30, input(1, 0, 0));
    expect(m.state.throttle).toBeGreaterThan(0);
    expect(m.state.throttle).toBeLessThan(0.5);
  });
});

describe("ArcadeHandlingModel — low speed", () => {
  it("full lock from a standstill follows the wheels with no slide or oscillation", () => {
    const m = car();
    const yawRates: number[] = [];
    drive(m, 4, input(0.4, 0, 1), (x) => yawRates.push(x.state.yawRate));

    for (const r of yawRates) expect(Number.isFinite(r)).toBe(true);
    expect(Math.abs(m.diagnostics.rearSlip)).toBeLessThan(3 * (Math.PI / 180));
    expect(Math.abs(m.diagnostics.understeer)).toBeLessThan(0.1);
    // Monotonic build-up: no yaw rate sign flips while pulling away on lock.
    expect(yawRates.every((r) => r >= 0)).toBe(true);
  });

  it("stays parked with no input and does not creep", () => {
    const m = drive(car(1), 2, input(0, 0, 0.5));
    expect(m.state.vx).toBe(0);
    expect(m.state.vy).toBe(0);
    expect(m.state.yawRate).toBe(0);
    expect(m.diagnostics.held).toBe(true);
  });

  it("does nothing while airborne except carry momentum", () => {
    const m = car(80);
    m.state.yawRate = 0.2;
    for (let i = 0; i < 60; i++) m.step(DT, input(1, 0, 1), { front: 0, rear: 0 });
    expect(kmh(m)).toBeGreaterThan(79);
    expect(kmh(m)).toBeLessThan(80);
    expect(m.state.yawRate).toBeLessThan(0.2);
  });
});

describe("ArcadeHandlingModel — FWD balance", () => {
  it("visibly understeers when entering too fast on full lock", () => {
    const m = drive(car(100), 2, input(0.3, 0, 1));
    expect(m.diagnostics.understeer).toBeGreaterThan(0.2);
    expect(m.diagnostics.frontGripUse).toBeGreaterThan(0.8);
    // It still turns, and it stays stable rather than spinning.
    expect(m.state.yawRate).toBeGreaterThan(0.2);
    expect(Math.abs(m.diagnostics.rearSlip)).toBeLessThan(m.config.assists.stabilityThresholdDeg * (Math.PI / 180));
  });

  it("follows the steering closely at a sensible entry speed", () => {
    const m = drive(car(40), 2, input(0.25, 0, 0.35));
    expect(Math.abs(m.diagnostics.understeer)).toBeLessThan(0.1);
  });

  it("power understeers: more throttle mid-corner widens the line", () => {
    const light = drive(car(70), 1.5, input(0.1, 0, 0.7));
    const heavy = drive(car(70), 1.5, input(1, 0, 0.7));
    expect(heavy.diagnostics.understeer).toBeGreaterThan(light.diagnostics.understeer + 0.05);
  });

  it("traction assist trades drive force for steering when cornering on full throttle", () => {
    const average = (traction: number) => {
      const m = car(35, "fwd_worn_sedan", { assists: { traction } });
      let cut = 0;
      let understeer = 0;
      const steps = drive(m, 1.5, input(1, 0, 0.8), (x) => {
        cut += x.diagnostics.tractionCut;
        understeer += x.diagnostics.understeer;
      });
      const n = 1.5 / DT;
      return { cut: cut / n, understeer: understeer / n, kmh: kmh(steps) };
    };
    const off = average(0);
    const on = average(1);
    expect(off.cut).toBe(0);
    expect(on.cut).toBeGreaterThan(0.1);
    expect(on.understeer).toBeLessThan(off.understeer);
    expect(on.kmh).toBeLessThan(off.kmh);
  });

  function liftMidCorner(preset: HandlingPresetId = "fwd_worn_sedan", overrides: HandlingOverrides = {}) {
    const m = drive(car(75, preset, overrides), 2, input(0.5, 0, 0.7));
    const settled = m.diagnostics.understeer;
    const trace: number[] = [];
    drive(m, 1.5, input(0, 0, 0.7), (x) => trace.push(x.diagnostics.understeer));
    return { m, settled, trace };
  }

  it("lift-off rotation tightens the line progressively rather than snapping", () => {
    const { settled, trace } = liftMidCorner();
    const at = (s: number) => trace[Math.round(s / DT) - 1];

    expect(settled).toBeGreaterThan(0.15); // on throttle: mild understeer
    expect(at(0.25)).toBeLessThan(settled); // lifting starts tucking the nose in...
    expect(at(0.25)).toBeGreaterThan(at(1)); // ...and keeps building over ~1s
    expect(Math.min(...trace)).toBeGreaterThan(-0.3); // mild: ends near neutral, not a spin
  });

  it("lift-off rotation scales with its tuning value", () => {
    const mild = liftMidCorner("fwd_worn_sedan", { balance: { liftOffRotation: 0.04 } });
    const strong = liftMidCorner("fwd_worn_sedan", { balance: { liftOffRotation: 0.16 } });
    expect(Math.min(...strong.trace)).toBeLessThan(Math.min(...mild.trace) - 0.1);
  });

  it("reapplying throttle after a lift recovers to a stable understeer", () => {
    const { m } = liftMidCorner("fwd_worn_sedan_bald_rears");
    drive(m, 1.5, input(0.6, 0, 0.7));
    expect(m.diagnostics.understeer).toBeGreaterThan(0.05);
    expect(Math.abs(m.diagnostics.rearSlip)).toBeLessThan(5 * (Math.PI / 180));
  });

  it("front/rear grip split sets the balance", () => {
    const pushy = drive(car(70, "fwd_worn_sedan", { tires: { frontGrip: 0.85, rearGrip: 1.1 } }), 2, input(0.3, 0, 0.8));
    const loose = drive(car(70, "fwd_worn_sedan", { tires: { frontGrip: 1.05, rearGrip: 0.95 } }), 2, input(0.3, 0, 0.8));
    expect(pushy.diagnostics.understeer).toBeGreaterThan(loose.diagnostics.understeer + 0.1);
  });

  it("stability assist caps the slide when the rear lets go", () => {
    const slide = (stability: number) => {
      const m = car(80, "fwd_worn_sedan_bald_rears", { assists: { stability } });
      let worst = 0;
      drive(m, 2, input(0.5, 0, 0.8));
      drive(m, 2, input(0, 0, 0.8), (x) => (worst = Math.max(worst, Math.abs(x.diagnostics.rearSlip))));
      return worst;
    };
    expect(slide(1)).toBeLessThan(slide(0));
  });

  it("is deterministic for identical inputs", () => {
    const run = () => drive(drive(car(60), 1, input(0.7, 0, 0.6)), 1, input(0, 0.4, -0.3)).state;
    expect(run()).toEqual(run());
  });
});

describe("ArcadeHandlingModel — handbrake", () => {
  const hb = (throttle: number, steer: number): DriverInput => ({ throttle, brake: 0, steer, handbrake: true });

  /** Heading plus body slip: where the car is actually travelling, radians. */
  function turn(kmhStart: number, phases: [number, DriverInput][]) {
    const m = car(kmhStart);
    let heading = 0;
    let worstRearSlip = 0;
    for (const [seconds, driver] of phases) {
      drive(m, seconds, driver, (x) => {
        heading += x.state.yawRate * DT;
        worstRearSlip = Math.max(worstRearSlip, Math.abs(x.diagnostics.rearSlip));
      });
    }
    return { m, heading, travel: heading + Math.atan2(m.state.vy, Math.max(m.state.vx, 0.1)), worstRearSlip };
  }

  it("does nothing parked or crawling", () => {
    const parked = drive(car(), 1, hb(0, 1));
    expect(parked.state.vx).toBe(0);
    expect(parked.diagnostics.handbrakeEffect).toBe(0);

    const plain = drive(car(12), 1, input(0.3, 0, 1)).state;
    const pulled = drive(car(12), 1, hb(0.3, 1)).state;
    expect(pulled).toEqual({ ...plain, handbrake: pulled.handbrake });
  });

  it("fades in rather than switching on", () => {
    const m = drive(car(45), DT, hb(0, 1));
    expect(m.diagnostics.handbrakeEffect).toBeGreaterThan(0);
    expect(m.diagnostics.handbrakeEffect).toBeLessThan(0.15);
  });

  it("is strongest at medium speed and fades at high speed", () => {
    const effect = (speed: number) => drive(car(speed), 0.3, hb(0, 0)).diagnostics.handbrakeEffect;
    expect(effect(45)).toBeGreaterThan(effect(25));
    expect(effect(45)).toBeGreaterThan(effect(110) * 1.5);
  });

  it("without steering it bleeds speed in a straight line and never rotates", () => {
    const plain = drive(car(45), 1, input(0, 0, 0));
    const pulled = drive(car(45), 1, hb(0, 0));
    expect(pulled.state.yawRate).toBe(0);
    expect(kmh(pulled)).toBeLessThan(kmh(plain) - 3);
    // A rotation tool, not a brake: nowhere near a full-pedal stop.
    expect(kmh(pulled)).toBeGreaterThan(30);
  });

  it("a tap mid-corner rotates the car into a tighter line, then the front pulls it straight", () => {
    const entry: DriverInput = input(0, 0, 1);
    const exit: DriverInput = input(0.6, 0, 0.3);
    const plain = turn(45, [[0.5, entry], [1, exit]]);
    const tapped = turn(45, [[0.5, hb(0, 1)], [1, exit]]);

    expect(tapped.travel).toBeGreaterThan(plain.travel + 5 * (Math.PI / 180));
    // Rotates properly but doesn't swap ends.
    expect(tapped.heading).toBeLessThan(Math.PI / 2);
    expect(tapped.worstRearSlip).toBeLessThan(30 * (Math.PI / 180));
    // Released and on the throttle: settled again, no lingering slide.
    expect(tapped.m.diagnostics.handbrakeEffect).toBeLessThan(0.01);
    expect(Math.abs(tapped.m.diagnostics.rearSlip)).toBeLessThan(3 * (Math.PI / 180));
  });

  it("holding it scrubs off speed until it switches itself off, with no endless slide", () => {
    const held = turn(45, [[3, hb(0, 1)]]);
    expect(kmh(held.m)).toBeLessThan(held.m.config.handbrake.minEffectiveSpeedKmh);
    expect(held.m.diagnostics.handbrakeEffect).toBe(0);
    expect(Math.abs(held.m.diagnostics.rearSlip)).toBeLessThan(3 * (Math.PI / 180));
  });

  it("can be disabled per config", () => {
    const off = car(45, "fwd_worn_sedan", { handbrake: { enabled: false } });
    const plain = drive(car(45), 1, input(0, 0, 1)).state;
    expect(drive(off, 1, hb(0, 1)).state).toEqual(plain);
  });
});

describe("handling presets", () => {
  it("every starter preset resolves to a valid config", () => {
    for (const id of Object.keys(HANDLING_PRESETS)) {
      expect(() => resolveHandlingPreset(HANDLING_PRESETS, id)).not.toThrow();
    }
  });

  it("variants only change what they override", () => {
    const base = resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan");
    const fresh = resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan_fresh_tires");
    expect(fresh.tires.frontGrip).toBeGreaterThan(base.tires.frontGrip);
    expect(fresh.steering).toEqual(base.steering);
  });

  it("rejects out-of-range and misspelled tuning", () => {
    const base = resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan");
    expect(() => applyHandlingOverrides(base, { balance: { understeer: 2 } })).toThrow();
    expect(() => applyHandlingOverrides(base, { tires: { frontGirp: 1 } } as HandlingOverrides)).toThrow();
  });

  it("swapping config keeps motion state", () => {
    const m = drive(car(60), 0.5, input(0.5, 0, 0.3));
    const before = { ...m.state };
    m.setConfig(resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan_bald_rears"));
    expect(m.state).toEqual(before);
  });
});

it('an empty tank disables forward and reverse propulsion but keeps braking and restores drive after refueling', () => {
  const m = car();
  drive(m, 2, { ...input(1, 0, 0), engineAvailable: false });
  expect(kmh(m)).toBe(0);
  drive(m, 2, { ...input(0, 1, 0), engineAvailable: false });
  expect(kmh(m)).toBe(0);
  m.state.vx = 15;
  drive(m, 3, { ...input(1, 1, .2), engineAvailable: false });
  expect(Math.abs(kmh(m))).toBeLessThan(1);
  drive(m, 2, { ...input(1, 0, 0), engineAvailable: true });
  expect(kmh(m)).toBeGreaterThan(1);
});
