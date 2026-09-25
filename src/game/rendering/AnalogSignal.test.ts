import { describe, expect, it } from "vitest";
import { AnalogSignal } from "./AnalogSignal";
import { ANALOG_PRESETS, analogAtSpeed } from "./AnalogConfig";

describe("analog signal safety", () => {
  it("ramps continuously through the speed bands and caps extreme speed", () => {
    const speeds = [0, 40, 100, 160, 220, 300];
    const frames = speeds.map(analogAtSpeed);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].rgb).toBeGreaterThanOrEqual(frames[i - 1].rgb);
      expect(frames[i].grain).toBeGreaterThanOrEqual(frames[i - 1].grain);
    }
    for (const speed of speeds.slice(1, -1)) {
      expect(Math.abs(analogAtSpeed(speed - 0.01).rgb - analogAtSpeed(speed + 0.01).rgb)).toBeLessThan(0.01);
    }
    expect(analogAtSpeed(10000)).toEqual(analogAtSpeed(300));
    expect(analogAtSpeed(-160)).toEqual(analogAtSpeed(160));
  });

  it("smooths preset changes and returns from an impact within 300 ms", () => {
    const signal = new AnalogSignal(() => 0.5);
    signal.setPreset("REPLAY");
    signal.update(1 / 60, 0);
    expect(signal.current.grain).toBeGreaterThan(ANALOG_PRESETS.GAMEPLAY.grain);
    expect(signal.current.grain).toBeLessThan(ANALOG_PRESETS.REPLAY.grain);
    signal.impact(1);
    signal.update(0.016, 0);
    expect(signal.impactEnvelope).toBeGreaterThan(0.5);
    for (let i = 0; i < 20; i++) signal.update(0.016, 0);
    expect(signal.impactEnvelope).toBe(0);
  });

  it("CLEAN suppresses speed and impact artifacts", () => {
    const signal = new AnalogSignal(() => 0.5);
    signal.setPreset("CLEAN");
    for (let i = 0; i < 200; i++) signal.update(1 / 60, 300);
    signal.impact(1);
    signal.update(0.016, 300);
    expect(signal.current.grain).toBeLessThan(0.00001);
    expect(signal.current.rgb).toBeLessThan(0.00001);
    expect(signal.impactEnvelope).toBe(0);
  });

  it("reduced motion disables signal displacement, flicker and blur", () => {
    const signal = new AnalogSignal(() => 0.001);
    signal.setPreset("HEAVY_DAMAGE");
    signal.reducedMotion = true;
    signal.impact(1);
    for (let i = 0; i < 60; i++) signal.update(1 / 60, 280);
    expect(signal.current.jitter).toBe(0);
    expect(signal.current.tearing).toBe(0);
    expect(signal.current.tracking).toBe(0);
    expect(signal.current.flicker).toBe(0);
    expect(signal.current.motionBlur).toBe(0);
    expect(signal.impactEnvelope).toBe(0);
  });
});
