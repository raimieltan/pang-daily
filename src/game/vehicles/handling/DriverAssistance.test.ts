import { describe, expect, it } from 'vitest';
import { DriverAssistance, DriftDetector, DEG, type VehicleControlInput } from './DriverAssistance';
import { STOCK_MECHANICAL } from './MechanicalConfig';
const rest = { vx: 60 / 3.6, vy: 0, yawRate: 0, rearSlipRatio: 0, frontAxleM: 1.2 };
const input: VehicleControlInput = { steering: 0, throttle: 0, brake: 0, handbrake: 0, device: 'keyboard' };
function run(assist: DriverAssistance, seconds: number, controls = input, motion = rest, config = STOCK_MECHANICAL) {
  for (let i = 0; i < Math.round(seconds * 120); i++) assist.step(1 / 120, controls, motion, config);
  return assist.telemetry;
}
describe('keyboard virtual driver', () => {
  it('ramps steering, pedals, and release without teleporting', () => {
    const a = new DriverAssistance();
    a.step(1 / 120, { ...input, steering: 1, throttle: 1, brake: 1, handbrake: 1 }, rest, STOCK_MECHANICAL);
    expect(a.telemetry.actualSteering).toBeGreaterThan(0);
    expect(a.telemetry.actualSteering).toBeLessThan(.02);
    expect(a.telemetry.throttleFiltered).toBeCloseTo(3.8 / 120);
    const held = run(a, .5, { ...input, steering: 1 }).actualSteering;
    a.step(1 / 120, input, rest, STOCK_MECHANICAL);
    expect(a.telemetry.actualSteering).toBeGreaterThan(held - .05);
    expect(Math.abs(run(a, 1).actualSteering)).toBeLessThan(.001);
  });
  it('calms high-speed steering and restores opposite-lock authority in a slide', () => {
    const low = run(new DriverAssistance(), 1, { ...input, steering: 1 }, { ...rest, vx: 5 });
    const fast = run(new DriverAssistance(), 1, { ...input, steering: 1 }, { ...rest, vx: 140 / 3.6 });
    const slide = run(new DriverAssistance(), 1, { ...input, steering: 1 }, { ...rest, vx: 140 / 3.6, vy: 22 });
    expect(fast.playerTarget).toBeLessThan(low.playerTarget * .5);
    expect(slide.playerTarget).toBeGreaterThan(fast.playerTarget * 1.8);
  });
  it('uses right countersteer for a left drift, and the player can override it', () => {
    const motion = { ...rest, vy: 8, yawRate: -.4 };
    const released = run(new DriverAssistance(), 1, input, motion);
    expect(released.counterTarget).toBeGreaterThan(0);
    expect(released.actualSteering).toBeGreaterThan(0);
    const oppose = run(new DriverAssistance(), 1, { ...input, steering: -1 }, motion);
    expect(oppose.finalTarget).toBeLessThan(0);
    expect(oppose.actualSteering).toBeLessThan(0);
    const right = run(new DriverAssistance(), 1, input, { ...motion, vy: -8, yawRate: .4 });
    expect(right.actualSteering).toBeCloseTo(-released.actualSteering);
  });
  it('crosses center progressively on a direct A/D switch', () => {
    const a = new DriverAssistance(); run(a, .7, { ...input, steering: -1 });
    let previous = a.telemetry.actualSteering, crossed = false;
    for (let i = 0; i < 120; i++) {
      a.step(1 / 120, { ...input, steering: 1 }, rest, STOCK_MECHANICAL);
      const next = a.telemetry.actualSteering;
      expect(Math.abs(next - previous)).toBeLessThan(.055);
      if (next * previous <= 0) crossed = true;
      previous = next;
    }
    expect(crossed).toBe(true); expect(previous).toBeGreaterThan(0);
  });
  it('trims only excessive slip/yaw and never cuts more than the selected limit', () => {
    const full = { ...input, throttle: 1 };
    const calm = run(new DriverAssistance(), 1, full, { ...rest, vy: 5, yawRate: .3, rearSlipRatio: .2 });
    expect(calm.throttleAssisted).toBe(1);
    const risky = run(new DriverAssistance(), 1, full, { ...rest, yawRate: 3, rearSlipRatio: 2 });
    expect(risky.throttleAssisted).toBeCloseTo(.75);
    const raw = run(new DriverAssistance(), 1, full, { ...rest, rearSlipRatio: 2 }, { ...STOCK_MECHANICAL, assistance: 'raw' });
    expect(raw.throttleAssisted).toBe(1);
  });
  it('leaves wheel and AI inputs without keyboard countersteer', () => {
    for (const device of ['wheel', 'ai'] as const) {
      const t = run(new DriverAssistance(), 1, { ...input, device }, { ...rest, vy: 9 });
      expect(t.counterTarget).toBe(0); expect(t.actualSteering).toBe(0);
    }
  });
  it('does not mutate the supplied motion state', () => {
    const motion = Object.freeze({ ...rest });
    run(new DriverAssistance(), 1, { ...input, steering: 1 }, motion);
    expect(motion).toEqual(rest);
  });
});
describe('drift detection hysteresis', () => {
  it('requires motion, angle, yaw and slip, and uses distinct entry/exit thresholds', () => {
    const d = new DriftDetector();
    expect(d.step(60, 0, 0, 0)).toBe(false);
    expect(d.step(60, 10 * DEG, .4, .2)).toBe(true);
    expect(d.step(60, 6 * DEG, .4, .2)).toBe(true);
    expect(d.step(60, 3 * DEG, .4, .2)).toBe(false);
    expect(d.step(60, 6 * DEG, .4, .2)).toBe(false);
    expect(d.step(0, 30 * DEG, 1, 1)).toBe(false);
  });
});
