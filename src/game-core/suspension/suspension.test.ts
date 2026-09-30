import { describe, it, expect } from 'vitest';
import { createSuspension, suspensionSaveSchema } from './schema';
import { SuspensionSolver } from './solver';
import { damageCorner, repairComponent, alignCorner, installPart } from './service';

const base = { mass: 1200, frontWeight: .6, wheelbase: 2.6, track: 1.5, cgHeight: .5, frontSpring: 28000, rearSpring: 24000 };
function car() { return new SuspensionSolver(base, createSuspension(base)); }
function settle(s: SuspensionSolver, seconds = 4, ax = 0, ay = 0) { for (let t = 0; t < seconds; t += 1 / 120) s.preview(1 / 120, ax, ay); return s; }

describe('four independent suspension corners', () => {
  it('balances vehicle weight at rest without oscillation', () => {
    const s = settle(car());
    expect(s.corners.reduce((n, c) => n + c.wheelLoad, 0)).toBeCloseTo(base.mass * 9.81, -1);
    expect(s.corners[0].wheelLoad).toBeCloseTo(s.corners[1].wheelLoad, 3);
    expect(Math.abs(s.corners[0].compressionVelocity)).toBeLessThan(.001);
  });
  it('soft springs produce more roll, dive and squat than stiff springs', () => {
    for (const [ax, ay] of [[0, 5], [-5, 0], [5, 0]]) {
      const soft = car(), stiff = car();
      soft.saved.setup.corners.forEach(c => { c.springRate *= .65; });
      stiff.saved.setup.corners.forEach(c => { c.springRate *= 1.8; });
      settle(soft, 5, ax, ay); settle(stiff, 5, ax, ay);
      expect(Math.abs(ax ? soft.pose.pitch : soft.pose.roll)).toBeGreaterThan(Math.abs(ax ? stiff.pose.pitch : stiff.pose.roll));
    }
  });
  it('lowering changes real chassis height and compression clearance', () => {
    const stock = settle(car()), low = car();
    low.saved.setup.corners.forEach(c => { c.rideHeight = -.05; }); settle(low);
    expect(low.pose.heave).toBeLessThan(stock.pose.heave - .04);
    expect(low.corners[0].travelRemainingCompression).toBeLessThan(stock.corners[0].travelRemainingCompression);
  });
  it('unequal spring rates produce unequal static compression and stance', () => {
    const s = car(); s.saved.setup.corners[0].springRate *= .55; settle(s);
    expect(s.corners[0].compression).toBeGreaterThan(s.corners[1].compression + .005);
    expect(Math.abs(s.pose.roll)).toBeGreaterThan(.001);
  });
  it('mirrors toe and camber, and gives the inside steering wheel more angle', () => {
    const s = car(); s.saved.setup.corners.forEach(c => { c.toe = -.01; c.camber = -.1; });
    s.preview(1 / 120, 0, 0, -.4);
    expect(s.corners[0].heading).toBeLessThan(s.corners[0].steeringAngle);
    expect(s.corners[1].heading).toBeGreaterThan(s.corners[1].steeringAngle);
    expect(Math.abs(s.corners[0].steeringAngle)).toBeGreaterThan(Math.abs(s.corners[1].steeringAngle));
    expect(s.corners[0].camber).not.toBe(s.corners[1].camber);
  });
  it('airborne corners have no tire force and reach droop', () => {
    const s = car(); for (let i = 0; i < 120; i++) s.step(1 / 120, { mounts: [0, 0, 0, 0], velocities: [0, 0, 0, 0], roads: [null, null, null, null], steering: 0 });
    expect(s.corners.every(c => c.wheelLoad === 0 && !c.isGrounded)).toBe(true);
    expect(s.corners[0].status).toBe('FULL DROOP');
  });
  it('failed damper retains more oscillation after the same bump', () => {
    const healthy = settle(car()), failed = settle(car()); failed.saved.damage[0].health.damper = 0;
    let h = 0, f = 0;
    for (let i = 0; i < 240; i++) {
      const roads = [i < 12 ? .045 : 0, 0, 0, 0];
      healthy.preview(1 / 120, 0, 0, 0, roads); failed.preview(1 / 120, 0, 0, 0, roads);
      if (i > 30) { h += healthy.corners[0].compressionVelocity ** 2; f += failed.corners[0].compressionVelocity ** 2; }
    }
    expect(f).toBeGreaterThan(h);
  });
  it('launch transfers load rearward and braking forward', () => {
    const launch = settle(car(), 4, 5), brake = settle(car(), 4, -5);
    expect(launch.corners[0].wheelLoad).toBeLessThan(base.mass * 9.81 * .6 / 2);
    expect(launch.corners[2].wheelLoad).toBeGreaterThan(base.mass * 9.81 * .4 / 2);
    expect(brake.pose.pitch).toBeGreaterThan(0); expect(launch.pose.pitch).toBeLessThan(0);
  });
  it('runs consistently at different frame steps', () => {
    const a = car(), b = car();
    for (let i = 0; i < 240; i++) a.preview(1 / 60, -3, 4);
    for (let i = 0; i < 960; i++) b.preview(1 / 240, -3, 4);
    expect(a.pose.roll).toBeCloseTo(b.pose.roll, 3);
    expect(a.pose.pitch).toBeCloseTo(b.pose.pitch, 3);
  });
});

describe('damage, parts and service', () => {
  it('curb impacts deform only the struck corner and accumulate', () => {
    const s = createSuspension(base); damageCorner(s, 0, 1800, 1);
    const toe = s.damage[0].deformation.toe; expect(Math.abs(toe)).toBeGreaterThan(0);
    damageCorner(s, 0, 1800, 1); expect(Math.abs(s.damage[0].deformation.toe)).toBeGreaterThan(Math.abs(toe));
    expect(s.damage[1].health.tieRod).toBe(1);
  });
  it('alignment cannot erase bent parts, and replacement still needs alignment', () => {
    const s = createSuspension(base); damageCorner(s, 0, 3500, 1);
    expect(alignCorner(s, 0)).toMatchObject({ rejected: expect.any(String) });
    const before = s.alignment[0].toe;
    repairComponent(s, 0, 'tieRod'); expect(s.alignment[0].toe).toBe(before);
    expect(s.damage[0].health.tieRod).toBe(1);
  });
  it('part installation preserves damage and changes physical limits', () => {
    const s = createSuspension(base); damageCorner(s, 0, 1500, 1);
    const health = s.damage[0].health.damper;
    installPart(s, 'rally'); expect(s.setup.corners[0].compressionTravel).toBeGreaterThan(.09);
    expect(s.damage[0].health.damper).toBe(health);
  });
  it('round trips and rejects nonfinite setup', () => {
    const s = createSuspension(base); expect(suspensionSaveSchema.parse(JSON.parse(JSON.stringify(s)))).toEqual(s);
    s.setup.corners[0].springRate = NaN; expect(suspensionSaveSchema.safeParse(s).success).toBe(false);
  });
});

it('a stiff rear bar naturally lifts the inside rear at sufficient lateral acceleration', () => {
  const s = car(); s.saved.setup.rearARB = 120000; s.saved.setup.frontARB = 0;
  settle(s, 4, 0, 9);
  expect(s.corners[3].wheelLoad).toBeLessThan(50);
  expect(s.corners[3].isGrounded).toBe(false);
  // The bar ties the unloaded wheel to the outside wheel, so it hangs extended rather than at the droop stop.
  expect(s.corners[3].compression).toBeLessThan(0);
  expect(s.corners[3].compression).toBeLessThan(s.corners[2].compression);
});
it('a bent control arm displaces the hub and changes alignment and stance', () => {
  const s = car(); const original = settle(car()); damageCorner(s.saved, 0, 5000, 1); settle(s);
  expect(s.corners[0].wheelPosition.z).toBeLessThan(original.corners[0].wheelPosition.z);
  expect(s.corners[0].camber).toBeLessThan(original.corners[0].camber);
  expect(s.corners[0].caster).toBeLessThan(original.corners[0].caster);
  expect(s.pose.roll).not.toBeCloseTo(original.pose.roll, 3);
});
it('a hard landing bottoms on the bump stops without bouncing the car back up', () => {
  const s = settle(car()); const rest = s.pose.heave;
  s.pose.heave = rest + 1.7; s.pose.velocity = 0;
  let landed = false, rebound = -Infinity;
  for (let i = 0; i < 360; i++) {
    s.preview(1 / 120);
    if (s.corners.some(c => c.bumpStopForce > 0)) landed = true;
    else if (landed) rebound = Math.max(rebound, s.pose.heave - rest);
  }
  expect(landed).toBe(true);
  // Elastomer bump stops, rim contact and dampers dissipate the impact; the car must not bounce
  // like a ball. Real cars rebound to roughly a tenth of a large drop (restitution ~0.3).
  expect(rebound).toBeLessThan(1.7 * .15);
});
