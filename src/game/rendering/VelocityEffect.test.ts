import { describe, expect, it } from "vitest";
import { VelocityEnvelope, velocityTarget } from "./VelocityEffect";

describe("velocity effect", () => {
  it("stays quiet at road speed and rises sharply near top speed", () => {
    expect(velocityTarget(70)).toBe(0);
    expect(velocityTarget(105)).toBeLessThan(0.1);
    expect(velocityTarget(140)).toBeGreaterThan(0.4);
    expect(velocityTarget(160)).toBe(1);
  });

  it("eases in over a short ramp and eases out more slowly", () => {
    const envelope = new VelocityEnvelope();
    const rising = envelope.step(0.25, 160);
    expect(rising).toBeGreaterThan(0.5);
    expect(rising).toBeLessThan(1);
    const falling = envelope.step(0.25, 0);
    expect(falling).toBeGreaterThan(0);
    expect(falling).toBeLessThan(rising);
    envelope.reset();
    expect(envelope.value).toBe(0);
  });
});
