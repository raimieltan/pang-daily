import { expect, it } from 'vitest';
import { ArcadeHandlingModel } from './ArcadeHandlingModel';
import { resolveHandlingPreset, applyHandlingOverrides } from './HandlingConfig';
import { HANDLING_PRESETS } from './presets';
import { SuspensionSolver } from '@/game-core/suspension/solver';
import { createSuspension } from '@/game-core/suspension/schema';
import { suspensionBaseline } from '../suspensionConfig';
function fixture() { const m = new ArcadeHandlingModel(applyHandlingOverrides(resolveHandlingPreset(HANDLING_PRESETS, 'rwd_box_sedan'), { mechanical: { assistance: 'raw', esc: false, tcs: 'off' } }));
  const b = suspensionBaseline(m.config), s = new SuspensionSolver(b, createSuspension(b)); for (let i = 0; i < 240; i++) s.preview(1 / 120); m.state.vx = 15;
  return { m, s }; }
function tick(m: ArcadeHandlingModel, s: SuspensionSolver, throttle = 0) { m.step(1 / 120, { throttle, brake: 0, steer: 0, device: 'wheel' }, { front: 1, rear: 1, wheels: s.corners.map(c => c.isGrounded), suspension: s.corners }); }
it('actual camber changes straight-line contact and lateral force response', () => {
  const healthy = fixture(), cambered = fixture();
  for (const c of cambered.s.corners) c.camber = -.15;
  tick(healthy.m, healthy.s); tick(cambered.m, cambered.s);
  expect(cambered.m.mechanics.wheels[0].maxLongitudinalGrip).toBeLessThan(healthy.m.mechanics.wheels[0].maxLongitudinalGrip * .9);
  expect(cambered.m.corners[0].fy).not.toBeCloseTo(healthy.m.corners[0].fy, 0);
});
it('bent tie rod pulls through changed heading without steering input', () => {
  const healthy = fixture(), bent = fixture(); bent.s.corners[0].heading += .06;
  for (let i = 0; i < 12; i++) { tick(healthy.m, healthy.s); tick(bent.m, bent.s); }
  expect(bent.m.state.steerAngle).toBe(0);
  expect(bent.m.corners[0].slipAngle).not.toBeCloseTo(healthy.m.corners[0].slipAngle, 2);
  expect(Math.abs(bent.m.state.yawRate)).toBeGreaterThan(Math.abs(healthy.m.state.yawRate) + .001);
});
it('airborne/raised wheels cannot transmit drive, braking or lateral force', () => {
  const {m, s} = fixture(); s.corners[2].wheelLoad = 0; s.corners[2].isGrounded = false;
  tick(m, s, 1); expect(m.corners[2].normalLoadN).toBe(0); expect(m.corners[2].fx).toBe(0); expect(m.corners[2].fy).toBe(0);
});
it('toe, track and fore/aft deformation affect wheel slip and force moment', () => {
  const healthy = fixture(), bent = fixture(); bent.m.state.yawRate = healthy.m.state.yawRate = .5;
  bent.s.corners[0].wheelPosition.x -= .09; bent.s.corners[0].wheelPosition.z -= .08;
  tick(healthy.m, healthy.s); tick(bent.m, bent.s);
  expect(bent.m.corners[0].slipAngle).not.toBeCloseTo(healthy.m.corners[0].slipAngle, 4);
});
