import { describe, expect, it } from 'vitest';
import { ArcadeHandlingModel, type DriverInput } from './ArcadeHandlingModel';
import { applyHandlingOverrides, resolveHandlingPreset, type HandlingOverrides } from './HandlingConfig';
import { HANDLING_PRESETS, type HandlingPresetId } from './presets';
import { differentialTorques } from './FourWheelDynamics';
const ground = { front: 1, rear: 1 };
const neutral: DriverInput = { throttle: 0, brake: 0, steer: 0, device: 'keyboard' };
function car(kph = 60, preset: HandlingPresetId = 'rwd_box_turbo', overrides: HandlingOverrides = {}) {
  const model = new ArcadeHandlingModel(applyHandlingOverrides(resolveHandlingPreset(HANDLING_PRESETS, preset), overrides));
  model.state.vx = kph / 3.6; return model;
}
function drive(m: ArcadeHandlingModel, seconds: number, input: DriverInput, dt = 1 / 120) {
  let heading = 0, angle = 0, driftSeconds = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    m.step(dt, input, ground); heading += m.state.yawRate * dt;
    angle = Math.max(angle, Math.abs(m.diagnostics.bodySlip));
    if (m.mechanics.detector.drifting) driftSeconds += dt;
    expect(Number.isFinite(m.state.vx + m.state.vy + m.state.yawRate)).toBe(true);
  }
  return { heading, angle, driftSeconds, speed: Math.hypot(m.state.vx, m.state.vy) * 3.6 };
}
describe('four-wheel mechanics', () => {
  it('differential coupling conserves axle torque and progresses open → LSD → welded', () => {
    const differences: number[] = [];
    for (const type of ['open', 'lsd', 'welded'] as const) {
      let left = 80, right = 20;
      for (let i = 0; i < 12; i++) {
        const [l, r] = differentialTorques(left, right, 200, { type, lock: .4, preloadNm: 30 }, 1.3, 1 / 600);
        expect(l + r).toBeCloseTo(200);
        left += l / 1.3 / 600; right += r / 1.3 / 600;
      }
      differences.push(Math.abs(left - right));
    }
    expect(differences[0]).toBeCloseTo(60);
    expect(differences[1]).toBeLessThan(differences[0] * .3);
    expect(differences[2]).toBeLessThan(differences[1]);
  });
  it('only rear wheels receive propulsion; the handbrake locks the rears', () => {
    const m = car(); drive(m, .6, { ...neutral, handbrake: true });
    expect(m.corners[0].brakeN).toBe(0);
    expect(m.corners[1].brakeN).toBe(0);
    expect(m.mechanics.wheels[2].isLocked).toBe(true);
    expect(m.mechanics.wheels[3].isLocked).toBe(true);
    expect(m.corners[0].driveN).toBe(0);
    drive(m, .05, neutral);
    expect(m.mechanics.wheels[2].gripRecovery).toBeLessThan(1);
    drive(m, .5, neutral);
    expect(m.mechanics.wheels[2].gripRecovery).toBe(1);
  });
  it('respects each tire ellipse, load transfer and surface independently', () => {
    const m = car(70, 'rwd_drift'); m.tires[3].grip = .35;
    drive(m, 1, { ...neutral, throttle: 1, steer: -.4 });
    for (const w of m.mechanics.wheels) {
      expect(Math.hypot(w.longitudinalForce / w.maxLongitudinalGrip, w.lateralForce / w.maxLateralGrip)).toBeLessThanOrEqual(1.00001);
    }
    expect(m.mechanics.wheels[3].maxLateralGrip).toBeLessThan(m.mechanics.wheels[2].maxLateralGrip);
    expect(m.mechanics.wheels[1].verticalLoad).toBeGreaterThan(m.mechanics.wheels[0].verticalLoad);
    expect(m.mechanics.wheels.reduce((sum, w) => sum + w.verticalLoad, 0)).toBeCloseTo(m.config.chassis.massKg * 9.81);
  });
  it('cannot accelerate or steer the chassis without contact', () => {
    const m = car(0, 'rwd_high_power');
    for (let i = 0; i < 120; i++) m.step(1 / 120, { ...neutral, throttle: 1, steer: 1, handbrake: true }, { front: 0, rear: 0 });
    expect(m.state.vx).toBe(0); expect(m.state.vy).toBe(0); expect(m.state.yawRate).toBe(0);
    expect(m.mechanics.wheels.every(w => w.longitudinalForce === 0 && w.lateralForce === 0)).toBe(true);
  });
  it('is stable across frame rates', () => {
    const a = car(60), b = car(60);
    drive(a, 2, { ...neutral, throttle: .4, steer: -.15 }, 1 / 30);
    drive(b, 2, { ...neutral, throttle: .4, steer: -.15 }, 1 / 120);
    expect(a.state.vx).toBeCloseTo(b.state.vx, 4);
    expect(a.state.yawRate).toBeCloseTo(b.state.yawRate, 4);
  });
  it('keeps a normal keyboard corner entry and a 140 km/h tap controlled', () => {
    const normal = car(60);
    const entry = drive(normal, .3, { ...neutral, throttle: 1, steer: -1 });
    expect(entry.angle).toBeLessThan(7 * Math.PI / 180);
    expect(normal.mechanics.detector.drifting).toBe(false);
    const fast = car(140);
    drive(fast, .08, { ...neutral, throttle: .3, steer: -1 });
    const settling = drive(fast, 3, { ...neutral, throttle: .3 });
    expect(settling.angle).toBeLessThan(5 * Math.PI / 180);
    expect(Math.abs(fast.state.yawRate)).toBeLessThan(.05);
  });

  it('initiates power oversteer, sustains it with W and short corrections, and recovers on lift', () => {
    const m = car(60, 'rwd_drift');
    drive(m, .45, { ...neutral, throttle: 1, steer: -1 });
    let sliding = 0, maxAngle = 0;
    for (let frame = 0; frame < 480; frame++) {
      // A keyboard driver taps to add or remove angle; it only supplies ordinary digital controls.
      const steer = frame % 24 < 6 ? (m.diagnostics.bodySlip > .45 ? 1 : -1) : 0;
      m.step(1 / 120, { ...neutral, throttle: 1, steer }, ground);
      if (m.mechanics.detector.drifting) sliding += 1 / 120;
      maxAngle = Math.max(maxAngle, Math.abs(m.diagnostics.bodySlip));
    }
    expect(sliding).toBeGreaterThan(2.5);
    expect(maxAngle).toBeGreaterThan(20 * Math.PI / 180);
    expect(maxAngle).toBeLessThan(65 * Math.PI / 180);
    expect(m.mechanics.assistance.telemetry.counterTarget).toBeGreaterThan(0);
    expect(m.mechanics.wheels[2].slipEnergy).toBeGreaterThan(500);
    drive(m, 3, neutral);
    expect(Math.abs(m.diagnostics.bodySlip)).toBeLessThan(5 * Math.PI / 180);
    expect(Math.abs(m.state.yawRate)).toBeLessThan(.1);
  });

  it('cannot rescue sustained W plus steering into the rotation (mandatory spin test)', () => {
    const m = car(60, 'rwd_drift');
    const result = drive(m, 6, { ...neutral, throttle: 1, steer: -1 });
    expect(result.angle).toBeGreaterThan(Math.PI / 2);
    expect(Math.abs(result.heading)).toBeGreaterThan(Math.PI);
  });

  it('transitions through rack center and opposite yaw using digital inputs', () => {
    const m = car(60, 'rwd_drift');
    drive(m, .45, { ...neutral, throttle: 1, steer: -1 });
    drive(m, .7, { ...neutral, throttle: 1 });
    expect(m.diagnostics.bodySlip).toBeGreaterThan(.3);
    let crossedRack = false, crossedYaw = false, previousSteer = m.state.steerAngle, previousYaw = m.state.yawRate;
    for (let frame = 0; frame < 360; frame++) {
      m.step(1 / 120, { ...neutral, throttle: frame < 12 ? 0 : 1, steer: frame < 48 ? 1 : 0 }, ground);
      if (m.state.steerAngle * previousSteer < 0) crossedRack = true;
      if (m.state.yawRate * previousYaw < 0) crossedYaw = true;
      expect(Math.abs(m.state.steerAngle - previousSteer)).toBeLessThan(.06);
      previousSteer = m.state.steerAngle; previousYaw = m.state.yawRate;
    }
    expect(crossedRack).toBe(true); expect(crossedYaw).toBe(true);
    expect(m.diagnostics.bodySlip).toBeLessThan(-.1);
    expect(m.diagnostics.bodySlip).toBeGreaterThan(-Math.PI / 2);
  });

  it('burns out with independently spinning rear wheels, heat, and persistent wear', () => {
    const m = car(0, 'rwd_drift');
    drive(m, 8, { ...neutral, throttle: 1, brake: .8 });
    expect(Math.abs(m.state.vx)).toBeLessThan(.2);
    expect(m.mechanics.wheels[2].isSpinning).toBe(true);
    expect(m.mechanics.wheels[0].isSpinning).toBe(false);
    expect(m.mechanics.wheels[2].temperature).toBeGreaterThan(m.mechanics.wheels[0].temperature + 5);
    const wear = m.mechanics.wheels[2].wear;
    expect(wear).toBeGreaterThan(.0001);
    m.reset();
    expect(m.mechanics.wheels[2].wear).toBe(wear);
  });

  it('upgrades change forces and suspension loads rather than selecting a drift mode', () => {
    const stock = car(0), powerful = car(0, 'rwd_high_power');
    drive(stock, 2, { ...neutral, throttle: 1, brake: .8 });
    drive(powerful, 2, { ...neutral, throttle: 1, brake: .8 });
    expect(powerful.mechanics.wheels[2].angularVelocity).toBeGreaterThan(stock.mechanics.wheels[2].angularVelocity * 2);
    const soft = car(60), stiff = car(60, 'rwd_box_turbo', { mechanical: { suspension: { rearAntiRoll: 60000 } } });
    for (const m of [soft, stiff]) drive(m, .5, { ...neutral, steer: -.3 });
    const imbalance = (m: ArcadeHandlingModel) => Math.abs(m.mechanics.wheels[2].verticalLoad - m.mechanics.wheels[3].verticalLoad);
    expect(imbalance(stiff)).toBeGreaterThan(imbalance(soft));
  });

  it('ESC uses a caliper and TCS limits torque through the same mechanical solver', () => {
    const esc = car(60, 'rwd_drift', { mechanical: { esc: true } });
    esc.state.vy = 5; esc.state.yawRate = -1;
    drive(esc, .05, { ...neutral, throttle: .5 });
    expect(esc.corners[0].brakeN + esc.corners[1].brakeN).toBeGreaterThan(0);
    expect(esc.diagnostics.stabilityYaw).toBe(0);
    const on = car(0, 'rwd_drift', { mechanical: { tcs: 'on' } }), off = car(0, 'rwd_drift');
    for (const m of [on, off]) drive(m, 2, { ...neutral, throttle: 1, brake: .8 });
    expect(on.mechanics.wheels[2].angularVelocity).toBeLessThan(off.mechanics.wheels[2].angularVelocity);
  });

  it('can perform donuts from rest without a low-speed drift mode', () => {
    const m = car(0, 'rwd_high_power');
    const result = drive(m, 12, { ...neutral, throttle: 1, steer: -1 });
    expect(Math.abs(result.heading)).toBeGreaterThan(Math.PI * 2);
    expect(result.angle).toBeGreaterThan(.5);
  });

  it('replaces gearbox arrays when applying upgrades and rejects invalid geometry', () => {
    const m = car(0, 'rwd_box_turbo', { mechanical: { engine: { gearRatios: [3, 1.5] } } });
    expect(m.config.mechanical!.engine.gearRatios).toEqual([3, 1.5]);
    expect(() => car(0, 'rwd_box_turbo', { mechanical: { wheel: { radiusM: 0 } } })).toThrow();
  });

  it('holds a steady unassisted corner at road speeds instead of spinning (limit understeer)', () => {
    for (const kph of [40, 60, 100]) for (const degrees of [1, 2, 4]) for (const throttle of [0, .3]) {
      const m = car(kph); let angle = 0;
      for (let i = 0; i < 600; i++) {
        m.stepControls(1 / 120, { steering: -degrees / 34, throttle, brake: 0, handbrake: 0, device: 'ai' }, ground);
        angle = Math.max(angle, Math.abs(m.diagnostics.bodySlip));
      }
      expect(angle, `${kph} km/h, ${degrees}° rack, throttle ${throttle}`).toBeLessThan(6 * Math.PI / 180);
    }
  });

  it('lets a stock car held on W+A at 60 km/h slide briefly and settle (Test A)', () => {
    const m = car(60);
    const result = drive(m, 3, { ...neutral, throttle: 1, steer: -1 });
    expect(result.angle).toBeLessThan(20 * Math.PI / 180);
    expect(Math.abs(m.diagnostics.bodySlip)).toBeLessThan(6 * Math.PI / 180);
  });

  it('handbrake turn locks the rears, adds rotation and releases without a snap (Test F)', () => {
    const run = (handbrake: boolean) => {
      const m = car(60); drive(m, .4, { ...neutral, throttle: .3, steer: -1 });
      const pulled = drive(m, .35, { ...neutral, steer: -1, handbrake });
      const rearSpeed = m.mechanics.wheels[2].angularVelocity;
      let yaw = m.state.yawRate, jerk = 0, angle = 0;
      for (let i = 0; i < 72; i++) {
        m.step(1 / 120, { ...neutral, throttle: .3 }, ground);
        jerk = Math.max(jerk, Math.abs(m.state.yawRate - yaw) * 120); yaw = m.state.yawRate;
        angle = Math.max(angle, Math.abs(m.diagnostics.bodySlip));
      }
      return { pulled: pulled.angle, rearSpeed, jerk, angle };
    };
    const plain = run(false), handbrake = run(true);
    expect(handbrake.rearSpeed).toBeCloseTo(0, 4);
    expect(handbrake.pulled).toBeGreaterThan(plain.pulled * 1.5);
    expect(handbrake.angle).toBeGreaterThan(20 * Math.PI / 180);
    expect(handbrake.jerk).toBeLessThan(6);
  });

  it('keeps building rack angle when A is held at 140 km/h while tire saturation bounds the slide (Test H)', () => {
    const m = car(140); const racks: number[] = [];
    let angle = 0;
    for (let k = 0; k < 8; k++) {
      angle = Math.max(angle, drive(m, .25, { ...neutral, throttle: .3, steer: -1 }).angle);
      racks.push(Math.abs(m.state.steerAngle));
    }
    expect(racks[1]).toBeGreaterThan(racks[0]);
    expect(racks[3]).toBeGreaterThan(racks[1]);
    expect(angle).toBeLessThan(20 * Math.PI / 180);
  });

  it('open diff spins the unloaded inside rear; LSD and welded couple it', () => {
    const difference = (preset: HandlingPresetId) => {
      const m = car(30, preset); drive(m, 1.2, { ...neutral, throttle: 1, steer: -1 });
      return Math.abs(m.mechanics.wheels[2].angularVelocity - m.mechanics.wheels[3].angularVelocity);
    };
    const open = difference('rwd_box_turbo'), lsd = difference('rwd_drift'), welded = difference('rwd_high_power');
    expect(lsd).toBeLessThan(open * .2);
    expect(welded).toBeLessThan(lsd);
  });

  it('a lower-grip surface lets the same inputs slide further', () => {
    const dry = car(60), dirt = car(60); dirt.surfaceGrip = .55;
    expect(drive(dirt, 1.5, { ...neutral, throttle: 1, steer: -1 }).angle)
      .toBeGreaterThan(drive(dry, 1.5, { ...neutral, throttle: 1, steer: -1 }).angle * 1.2);
  });

  it('engine braking reaches the rear wheels only through the clutch', () => {
    const engaged = car(80), open = car(80);
    drive(engaged, 2, neutral); drive(open, 2, { ...neutral, clutch: 1 });
    expect(engaged.state.vx).toBeLessThan(open.state.vx - .5);
  });

  it('street tune stays planted on keyboard W + full steer through town corners; drift tune slides', () => {
    for (const kph of [25, 40, 60]) {
      const street = drive(car(kph), 3, { ...neutral, throttle: 1, steer: -1 });
      expect(street.angle, `street ${kph} km/h`).toBeLessThan(8 * Math.PI / 180);
    }
    const drift = drive(car(40, 'rwd_box_drift'), 3, { ...neutral, throttle: 1, steer: -1 });
    expect(drift.angle).toBeGreaterThan(15 * Math.PI / 180);
  });

  it('uses the same solver for AI, controller and wheel controls and any drivetrain', () => {
    for (const drivetrain of ['FWD', 'RWD', 'AWD'] as const) {
      const m = car(0, 'rwd_box_turbo', { drive: { drivetrain } });
      for (let i = 0; i < 120; i++) m.stepControls(1 / 120, { steering: 0, throttle: 1, brake: 0, handbrake: 0, device: 'ai' }, ground);
      expect(m.state.vx).toBeGreaterThan(1);
      if (drivetrain === 'FWD') expect(m.corners[2].driveN).toBe(0);
      if (drivetrain === 'RWD') expect(m.corners[0].driveN).toBe(0);
    }
  });
});
