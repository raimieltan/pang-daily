import { CORNER_IDS, type SavedSuspension, type SuspensionBaseline, type Vec3 } from './schema';
import { curveAt, GEOMETRY, SUSPENSION_PARTS } from './parts';
import { damageCorner } from './service';
const G = 9.81;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export interface SuspensionCornerState {
  corner: typeof CORNER_IDS[number]; radius: number; roadCamber?: number; compression: number; compressionVelocity: number; travelUsed: number;
  travelRemainingCompression: number; travelRemainingDroop: number; springForce: number; damperForce: number; bumpStopForce: number; arbForce: number;
  suspensionForce: number; wheelLoad: number; rideHeight: number; camber: number; toe: number; caster: number; steeringAngle: number; heading: number;
  wheelPosition: Vec3; wheelVelocity: Vec3; unsprungVelocity: Vec3; isGrounded: boolean; rubbing: boolean;
  status: 'NORMAL' | 'NEAR BUMP STOP' | 'BOTTOMED' | 'FULL DROOP' | 'AIRBORNE' | 'DAMAGED' | 'FAILED';
}
export interface SuspensionInput {
  /** World height of the body origin at each wheel, along the suspension axis. */
  mounts: readonly number[]; velocities: readonly number[]; roads: readonly (number | null)[]; steering: number;
  accelerations?: readonly number[]; disabled?: readonly boolean[]; damage?: boolean;
}
export interface SuspensionEvent { corner: typeof CORNER_IDS[number]; type: 'bump-stop' | 'impact' | 'rub'; intensity: number }
/** Independent unsprung vertical masses coupled through a rigid chassis and axle anti-roll bars.
 * Chassis integration is deliberately external. preview() supplies a small rigid chassis for garage/tests.
 */
export class SuspensionSolver {
  readonly corners: SuspensionCornerState[];
  readonly pose = { heave: 0, pitch: 0, roll: 0, velocity: 0, pitchVelocity: 0, rollVelocity: 0 };
  readonly steering = { steeringInput: 0, rackPosition: 0, leftWheelAngle: 0, rightWheelAngle: 0, maxLock: 0, steeringRatio: 16, ackermannFactor: .75 };
  readonly events: SuspensionEvent[] = [];
  readonly radii: number[];
  readonly offsets = [0, 0, 0, 0];
  readonly widths = [.195, .195, .195, .195];
  private readonly cooldown = [0, 0, 0, 0];
  constructor(readonly baseline: SuspensionBaseline, public saved: SavedSuspension) {
    this.radii = [0, 1, 2, 3].map(() => baseline.radius ?? .3);
    this.corners = CORNER_IDS.map(corner => ({ corner, radius: baseline.radius ?? .3, compression: 0, compressionVelocity: 0, travelUsed: 0,
      travelRemainingCompression: .09, travelRemainingDroop: .06, springForce: 0, damperForce: 0, bumpStopForce: 0, arbForce: 0,
      suspensionForce: 0, wheelLoad: 0, rideHeight: 0, camber: 0, toe: 0, caster: 0, steeringAngle: 0, heading: 0,
      wheelPosition: { x: 0, y: baseline.radius ?? .3, z: 0 }, wheelVelocity: { x: 0, y: 0, z: 0 }, unsprungVelocity: { x: 0, y: 0, z: 0 },
      isGrounded: false, rubbing: false, status: 'NORMAL' }));
  }
  reset(): void { Object.assign(this.pose, { heave: 0, pitch: 0, roll: 0, velocity: 0, pitchVelocity: 0, rollVelocity: 0 });
    this.corners.forEach(c => { c.compression = c.compressionVelocity = c.wheelLoad = 0; }); this.cooldown.fill(0); }
  step(dt: number, input: SuspensionInput): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.events.length = 0;
    const steps = Math.ceil(Math.min(dt, .1) * 1200), h = Math.min(dt, .1) / steps;
    for (let n = 0; n < steps; n++) this.integrate(h, input);
  }
  private integrate(dt: number, input: SuspensionInput): void {
    const b = this.baseline, setup = this.saved.setup, part = SUSPENSION_PARTS[this.saved.part];
    const compression = this.corners.map(c => c.compression);
    const rack = clamp(input.steering, -setup.maxLock, setup.maxLock);
    Object.assign(this.steering, { rackPosition: rack, steeringInput: rack / setup.maxLock, maxLock: setup.maxLock, steeringRatio: setup.steeringRatio, ackermannFactor: setup.ackermann });
    this.corners.forEach((c, i) => {
      const s = setup.corners[i], d = this.saved.damage[i], front = i < 2, side = i % 2 ? 1 : -1;
      const staticTotal = b.mass * G * (front ? b.frontWeight : 1 - b.frontWeight) / 2;
      const sprungWeight = staticTotal - s.unsprungMass * G;
      const stockRate = front ? b.frontSpring : b.rearSpring;
      const motion = part.motionRatio;
      const upLimit = Math.max(.005, s.compressionTravel + Math.min(0, s.rideHeight) - d.deformation.travelReduction);
      const downLimit = s.droopTravel;
      const height = s.rideHeight + d.deformation.rideHeight;
      const q = c.compression, v = c.compressionVelocity;
      // Spring seat preload is distance, not a stiffness multiplier. Failed springs retain fragments.
      c.springForce = Math.max(0, (sprungWeight / (stockRate * part.springScale) + s.preload + q * motion) * s.springRate * motion) * (.12 + .88 * d.health.spring);
      const low = v >= 0 ? s.bump : s.rebound, high = v >= 0 ? s.highSpeedBump : s.highSpeedRebound;
      c.damperForce = Math.sign(v) * (low * Math.min(.15, Math.abs(v)) + high * Math.max(0, Math.abs(v) - .15)) * d.health.damper;
      const bump = Math.max(0, q - (upLimit - Math.min(s.bumpStop, upLimit * .7)));
      // Elastomer bump stops are progressive (~30 kN over 2 cm) so bottoming is absorbed before the
      // hard limit, and lossy: they unload along a lower curve than they load, and never pull the wheel.
      const bumpDamping = bump > 0 ? Math.min(1, bump / .01) * 9000 * v : 0;
      c.bumpStopForce = Math.max(0, (300000 * bump + 60000000 * bump * bump) * (v < 0 ? .35 : 1) + bumpDamping) + (q > upLimit ? 600000 * (q - upLimit) + 2500 * Math.max(v, 0) : 0);
      const droop = q < -downLimit ? 600000 * (q + downLimit) + 2200 * Math.min(v, 0) : 0;
      c.arbForce = (compression[i] - compression[i ^ 1]) * (front ? setup.frontARB : setup.rearARB);
      c.suspensionForce = c.springForce + c.damperForce + c.bumpStopForce + c.arbForce + droop;
      const road = input.disabled?.[i] ? null : input.roads[i];
      const mount = input.mounts[i], mountV = input.velocities[i];
      // Radii are loaded radii. Add the static tire deflection to get unloaded contact radius.
      const tireRate = 180000 * (.3 / this.radii[i]);
      const wheelY = mount + this.radii[i] - height + q;
      const wheelV = mountV + v;
      const penetration = road === null ? 0 : road + this.radii[i] + staticTotal / tireRate - wheelY;
      // Past a sidewall's deflection the tire crushes onto the rim: very stiff, and it barely springs back.
      const rim = Math.max(0, penetration - .08), rimShare = Math.min(1, rim / .01);
      c.wheelLoad = road === null || penetration <= 0 ? 0 : Math.max(0, tireRate * penetration + 2000000 * rim * (wheelV > 0 ? .2 : 1) - (450 + 12000 * rimShare) * wheelV);
      c.isGrounded = c.wheelLoad > 1;
      const acceleration = (c.wheelLoad - c.suspensionForce) / s.unsprungMass - G - (input.accelerations?.[i] ?? 0);
      c.compressionVelocity += acceleration * dt;
      c.compression += c.compressionVelocity * dt;
      // Compliant stops above carry forces. Hard limits bound pathological collision discontinuities.
      if (c.compression > upLimit + .025) { c.compression = upLimit + .025; c.compressionVelocity = Math.min(0, c.compressionVelocity); }
      if (c.compression < -downLimit - .015) { c.compression = -downLimit - .015; c.compressionVelocity = Math.max(0, c.compressionVelocity); }
      c.travelUsed = Math.max(0, c.compression); c.travelRemainingCompression = Math.max(0, upLimit - c.compression); c.travelRemainingDroop = Math.max(0, downLimit + c.compression);
      c.rideHeight = height - c.compression;
      const geometry = GEOMETRY[part.geometry], travel = c.compression - s.rideHeight;
      let steer = 0;
      if (front) {
        const r = Math.abs(rack) < 1e-6 ? Infinity : b.wheelbase / Math.tan(Math.abs(rack));
        const inside = side === Math.sign(rack);
        const ack = Math.sign(rack) * Math.atan(b.wheelbase / Math.max(.1, r + (inside ? -1 : 1) * b.track / 2));
        steer = rack + (ack - rack) * setup.ackermann;
        steer = clamp(steer + d.deformation.steeringCenter, -setup.maxLock, setup.maxLock) * (.2 + .8 * d.health.knuckle);
      }
      c.steeringAngle = steer;
      c.caster = s.caster + d.deformation.caster + this.saved.alignment[i].caster;
      c.camber = s.camber + curveAt(geometry.camber, travel) + side * Math.sin(steer) * Math.sin(c.caster) + d.deformation.camber + this.saved.alignment[i].camber;
      c.toe = s.toe + curveAt(geometry.toe, travel) + d.deformation.toe + this.saved.alignment[i].toe;
      c.heading = steer - side * c.toe;
      c.radius = this.radii[i];
      c.wheelPosition = { x: side * (b.track / 2 + s.trackOffset + this.offsets[i] + curveAt(geometry.track, travel)) + d.deformation.position.x,
        y: this.radii[i] - height + c.compression + d.deformation.position.y,
        z: (front ? b.wheelbase * (1 - b.frontWeight) : -b.wheelbase * b.frontWeight) - travel * .04 + d.deformation.position.z };
      c.wheelVelocity = { x: 0, y: c.compressionVelocity, z: -c.compressionVelocity * .04 };
      c.unsprungVelocity = { x: 0, y: wheelV, z: 0 };
      c.rubbing = c.compression - height > .055 && this.widths[i] / 2 + Math.abs(Math.sin(c.heading)) * this.radii[i] + this.offsets[i] > .16;
      const health = Math.min(...Object.values(d.health));
      c.status = health < .15 ? 'FAILED' : health < .8 ? 'DAMAGED' : c.compression >= upLimit ? 'BOTTOMED' : c.travelRemainingDroop < .002 ? 'FULL DROOP'
        : !c.isGrounded ? 'AIRBORNE' : bump > 0 ? 'NEAR BUMP STOP' : 'NORMAL';
      this.cooldown[i] = Math.max(0, this.cooldown[i] - dt);
      // Riding on the elastomer bump stops is normal on a lowered car; only bottoming past the
      // hard limit, or a tire spike, is an impact that can bend parts.
      const hardStop = c.compression > upLimit ? 600000 * (c.compression - upLimit) : 0;
      if (this.cooldown[i] === 0 && (c.wheelLoad > staticTotal * 3 || hardStop > staticTotal * 2)) {
        const energy = .5 * s.unsprungMass * wheelV * wheelV + hardStop * .01;
        this.events.push({ corner: c.corner, type: 'impact', intensity: Math.min(1, energy / part.strength) });
        if (input.damage) damageCorner(this.saved, i, energy, side);
        this.cooldown[i] = .15;
      }
    });
    this.steering.leftWheelAngle = this.corners[0].steeringAngle; this.steering.rightWheelAngle = this.corners[1].steeringAngle;
  }
  /** Isolated 3-DOF chassis using the same corner forces as the runtime adapter. */
  preview(dt: number, longitudinal = 0, lateral = 0, steering = 0, roads: readonly (number | null)[] = [0, 0, 0, 0]): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.events.length = 0;
    const steps = Math.ceil(Math.min(.1, dt) * 1200), h = Math.min(.1, dt) / steps, b = this.baseline, p = this.pose;
    const sprung = b.mass - this.saved.setup.corners.reduce((n, c) => n + c.unsprungMass, 0);
    for (let n = 0; n < steps; n++) {
      const positions = this.corners.map((_, i) => ({ x: (i % 2 ? 1 : -1) * b.track / 2, z: i < 2 ? b.wheelbase * (1 - b.frontWeight) : -b.wheelbase * b.frontWeight }));
      this.integrate(h, { mounts: positions.map(v => p.heave - p.pitch * v.z + p.roll * v.x), velocities: positions.map(v => p.velocity - p.pitchVelocity * v.z + p.rollVelocity * v.x), roads, steering });
      let vertical = -sprung * G, pitch = -longitudinal * b.mass * b.cgHeight, roll = lateral * b.mass * b.cgHeight;
      this.corners.forEach((c, i) => { vertical += c.suspensionForce; pitch -= c.suspensionForce * positions[i].z; roll += c.suspensionForce * positions[i].x; });
      p.velocity += vertical / sprung * h; p.pitchVelocity += pitch / (sprung * b.wheelbase ** 2 / 8) * h; p.rollVelocity += roll / (sprung * b.track ** 2 / 5) * h;
      p.heave += p.velocity * h; p.pitch += p.pitchVelocity * h; p.roll += p.rollVelocity * h;
    }
  }
  snapshot() { return structuredClone({ corners: this.corners, pose: this.pose, steering: this.steering, saved: this.saved }); }
}
