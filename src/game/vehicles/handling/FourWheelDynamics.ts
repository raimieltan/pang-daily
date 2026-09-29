import type { ArcadeHandlingModel, AxleContact, DriverInput } from './ArcadeHandlingModel';
import type { MechanicalConfig } from './MechanicalConfig';
import { clamp, DEG, DriverAssistance, DriftDetector, moveToward, smoothstep } from './DriverAssistance';

const G = 9.81;
const TAU = 2 * Math.PI;
export interface WheelState {
  angularVelocity: number; wheelRPM: number; verticalLoad: number;
  longitudinalVelocity: number; lateralVelocity: number; slipRatio: number; slipAngle: number;
  longitudinalForce: number; lateralForce: number; maxLongitudinalGrip: number; maxLateralGrip: number;
  surfaceGrip: number; temperature: number; wear: number; pressure: number;
  isGrounded: boolean; isSliding: boolean; isSpinning: boolean; isLocked: boolean;
  slipEnergy: number; gripRecovery: number; suspensionLoad: number;
}
const newWheel = (): WheelState => ({ angularVelocity: 0, wheelRPM: 0, verticalLoad: 0,
  longitudinalVelocity: 0, lateralVelocity: 0, slipRatio: 0, slipAngle: 0,
  longitudinalForce: 0, lateralForce: 0, maxLongitudinalGrip: 0, maxLateralGrip: 0,
  surfaceGrip: 1, temperature: 25, wear: 0, pressure: 32,
  isGrounded: false, isSliding: false, isSpinning: false, isLocked: false,
  slipEnergy: 0, gripRecovery: 1, suspensionLoad: 0 });

/** Opposite wheel torques conserve total axle torque and dissipate relative rotation. */
export function differentialTorques(left: number, right: number, axleTorque: number,
  config: MechanicalConfig['differential'], inertia: number, dt: number): [number, number] {
  const difference = left - right;
  const strength = config.type === 'open' ? 0 : config.type === 'welded' ? 1 : config.lock;
  const viscous = difference * (config.type === 'welded' ? 2000 : 120 * strength);
  const requested = viscous + Math.sign(difference) * config.preloadNm * strength;
  // Do not overshoot equal wheel speed in one substep (coupling cannot add energy).
  const limit = Math.abs(difference) * inertia / (2 * dt);
  const correction = clamp(requested, -limit, limit);
  return [axleTorque / 2 - correction, axleTorque / 2 + correction];
}

/** Four-wheel planar rigid-body dynamics. Only tire forces and drag accelerate the chassis.
 * Body axes: x forward, y right; right yaw positive. Distances/forces are SI.
 * Low speed uses the same implicit tire solve, not a kinematic drift/parking mode.
 */
export class FourWheelDynamics {
  readonly wheels = Array.from({ length: 4 }, newWheel);
  readonly assistance = new DriverAssistance();
  readonly detector = new DriftDetector();
  readonly powertrain = { engineRpm: 850, gear: 1, clutch: 0, axleTorque: 0, differentialLock: 0 };
  private initialized = false;
  private reverseTimer = 0;
  private shiftTimer = 0;
  private frontTransfer = 0;
  private rearTransfer = 0;
  private rollVelocity = 0;
  private pitchVelocity = 0;
  private previousHandbrake = 0;
  constructor(private readonly model: ArcadeHandlingModel) {}
  reset(): void {
    this.wheels.forEach(w => Object.assign(w, newWheel(), { temperature: w.temperature, wear: w.wear }));
    this.assistance.reset(); this.detector.drifting = false;
    Object.assign(this.powertrain, { engineRpm: 850, gear: 1, clutch: 0, axleTorque: 0, differentialLock: 0 });
    this.initialized = false; this.reverseTimer = this.shiftTimer = this.frontTransfer = this.rearTransfer = 0;
    this.rollVelocity = this.pitchVelocity = this.previousHandbrake = 0;
  }
  step(dt: number, input: DriverInput, contact: AxleContact): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Bounded substeps make the stiff wheel/contact solve consistent at 30–240 Hz.
    const steps = Math.ceil(Math.min(dt, .25) / (1 / 600));
    const h = Math.min(dt, .25) / steps;
    for (let i = 0; i < steps; i++) this.integrate(h, input, contact);
  }
  private integrate(dt: number, input: DriverInput, contact: AxleContact): void {
    const model = this.model, c = model.config, p = c.mechanical!, s = model.state, diag = model.diagnostics;
    const mass = c.chassis.massKg, L = c.chassis.wheelbaseM, a = L * (1 - c.chassis.frontWeight), b = L - a;
    const halfTrack = c.chassis.trackWidthM / 2, radius = p.wheel.radiusM;
    const speed = Math.hypot(s.vx, s.vy), yaw = s.yawRate;
    const grounded = this.wheels.map((_, i) => model.tires[i].installed && !model.tires[i].raised
      && (contact.wheels ? !!contact.wheels[i] : (i < 2 ? contact.front : contact.rear) > 0));
    if (!this.initialized) {
      this.wheels.forEach((w, i) => { w.angularVelocity = (s.vx - yaw * (i % 2 === 0 ? -halfTrack : halfTrack)) / radius; });
      this.initialized = true;
      // A teleported moving test/spawn starts in the matching gear, without a spurious clutch kick.
      while (this.powertrain.gear < p.engine.gearRatios.length &&
        Math.abs(s.vx) / radius * p.engine.gearRatios[this.powertrain.gear - 1] * p.engine.finalDrive * 60 / TAU > p.engine.redlineRpm * .75) this.powertrain.gear++;
      this.powertrain.engineRpm = Math.max(p.engine.idleRpm, Math.abs(s.vx) / radius
        * p.engine.gearRatios[this.powertrain.gear - 1] * p.engine.finalDrive * 60 / TAU);
    }
    const rawThrottle = clamp(input.throttle, 0, 1), rawBrake = clamp(input.brake, 0, 1);
    const wantsReverse = !s.reversing && rawBrake > .5 && rawThrottle < .1 && speed < c.lowSpeed.reverseEngageBelowKmh / 3.6;
    this.reverseTimer = wantsReverse ? this.reverseTimer + dt : 0;
    if (wantsReverse && this.reverseTimer >= c.lowSpeed.reverseDelaySeconds) { s.reversing = true; this.reverseTimer = 0; }
    if (s.reversing && rawThrottle > .5 && rawBrake < .1 && speed < c.lowSpeed.reverseEngageBelowKmh / 3.6) s.reversing = false;
    const rearSlip = (Math.abs(this.wheels[2].slipRatio) + Math.abs(this.wheels[3].slipRatio)) / 2;
    const controls = this.assistance.step(dt, {
      steering: input.steer, throttle: input.engineAvailable === false ? 0 : s.reversing ? rawBrake : rawThrottle,
      brake: s.reversing ? rawThrottle : rawBrake,
      handbrake: c.handbrake.enabled ? Number(input.handbrake ?? 0) : 0,
      clutch: input.clutch, device: input.device,
    }, { vx: s.vx, vy: s.vy, yawRate: yaw, rearSlipRatio: rearSlip, frontAxleM: a }, p, c.pedals.throttleRise, c.pedals.throttleFall);
    if (input.engineAvailable === false) controls.throttleAssisted = controls.throttleFiltered = 0;
    s.steerAngle = controls.actualSteering; s.throttle = controls.throttleAssisted; s.brake = controls.brake; s.handbrake = controls.handbrake;
    if (this.previousHandbrake > s.handbrake) for (const w of this.wheels.slice(2)) w.gripRecovery = Math.min(w.gripRecovery, 1 - this.previousHandbrake);
    this.previousHandbrake = s.handbrake;

    // Damped suspension response to inertial load transfer. Stiffness determines roll distribution;
    // ride height changes the moment arm. No lift-off grip multiplier is needed.
    const height = Math.max(.1, c.chassis.cgHeightM + p.suspension.rideHeightOffsetM);
    const totalWeight = mass * G;
    const pitchTarget = clamp(-s.longAccel * height / (G * L), -.35, .35);
    const spring = (p.suspension.frontSpring + p.suspension.rearSpring) / mass;
    this.pitchVelocity += ((pitchTarget - s.loadShift) * spring - 2 * p.suspension.damping * Math.sqrt(spring) * this.pitchVelocity) * dt;
    s.loadShift += this.pitchVelocity * dt;
    const rollTarget = clamp(s.latAccel * height / (G * c.chassis.trackWidthM), -.48, .48);
    this.rollVelocity += ((rollTarget - s.lateralLoadShift) * spring - 2 * p.suspension.damping * Math.sqrt(spring) * this.rollVelocity) * dt;
    s.lateralLoadShift += this.rollVelocity * dt;
    const frontStiffness = p.suspension.frontSpring + p.suspension.frontAntiRoll;
    const rearStiffness = p.suspension.rearSpring + p.suspension.rearAntiRoll;
    const rollFront = frontStiffness / (frontStiffness + rearStiffness);
    const frontLoad = totalWeight * clamp(c.chassis.frontWeight + s.loadShift, .05, .95), rearLoad = totalWeight - frontLoad;
    this.frontTransfer = clamp(totalWeight * s.lateralLoadShift * rollFront, -frontLoad / 2, frontLoad / 2);
    this.rearTransfer = clamp(totalWeight * s.lateralLoadShift * (1 - rollFront), -rearLoad / 2, rearLoad / 2);
    const loads = [frontLoad / 2 + this.frontTransfer, frontLoad / 2 - this.frontTransfer,
      rearLoad / 2 + this.rearTransfer, rearLoad / 2 - this.rearTransfer];
    const frontDrive = c.drive.drivetrain === 'FWD' ? 1 : c.drive.drivetrain === 'AWD' ? .4 : 0;
    const drivenSpeed = (this.wheels[0].angularVelocity + this.wheels[1].angularVelocity) / 2 * frontDrive
      + (this.wheels[2].angularVelocity + this.wheels[3].angularVelocity) / 2 * (1 - frontDrive);
    const drivenSlip = frontDrive === 1 ? (Math.abs(this.wheels[0].slipRatio) + Math.abs(this.wheels[1].slipRatio)) / 2 : rearSlip;
    const tractionTrim = p.tcs === 'off' ? 0 : smoothstep(.12, .5, drivenSlip) * (p.tcs === 'on' ? .9 : .35);
    let throttle = s.throttle * (1 - tractionTrim);
    // ESC requests one caliper and trims torque. It cannot directly produce a yaw acceleration.
    const wantedYaw = s.vx * Math.tan(s.steerAngle) / L;
    const yawError = wantedYaw - yaw;
    const escBrake = p.esc && speed > 5 ? clamp(Math.abs(yawError) * .45, 0, .4) : 0;
    throttle *= 1 - escBrake;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const e = p.engine;
    this.powertrain.gear = clamp(this.powertrain.gear, 1, e.gearRatios.length);
    if (!s.reversing && this.shiftTimer === 0 && drivenSlip < .3) {
      const rpm = Math.abs(drivenSpeed) * e.gearRatios[this.powertrain.gear - 1] * e.finalDrive * 60 / TAU;
      if (rpm > e.redlineRpm * .9 && this.powertrain.gear < e.gearRatios.length) { this.powertrain.gear++; this.shiftTimer = e.shiftSeconds; }
      else if (rpm < 1800 && this.powertrain.gear > 1) { this.powertrain.gear--; this.shiftTimer = e.shiftSeconds; }
    }
    const ratio = (s.reversing ? -e.reverseRatio : e.gearRatios[this.powertrain.gear - 1]) * e.finalDrive;
    const engineOmega = this.powertrain.engineRpm * TAU / 60;
    const autoClutch = clamp(speed / 4 + throttle, 0, 1) * (this.shiftTimer > 0 ? 0 : 1);
    // The automatic clutch opens with the driven-axle handbrake to avoid stalling the engine.
    // This changes transmitted torque only; the rear calipers still create all rotation.
    const clutch = autoClutch * (1 - Math.max(clamp(input.clutch ?? 0, 0, 1), s.handbrake * (1 - frontDrive)));
    const coupling = clamp((engineOmega - drivenSpeed * ratio) * 6, -e.clutchTorqueNm, e.clutchTorqueNm) * clutch;
    const rpmFraction = this.powertrain.engineRpm / e.peakTorqueRpm;
    const torqueCurve = clamp(1 - .22 * (rpmFraction - 1) ** 2, .45, 1);
    const limiter = 1 - smoothstep(e.redlineRpm - 150, e.redlineRpm, this.powertrain.engineRpm);
    const idleTorque = clamp((e.idleRpm - this.powertrain.engineRpm) * .5, 0, e.torqueNm * .4);
    // Off boost a small turbo makes ~60% torque; it spools in on the way to peak torque.
    const boost = e.boostRpm ? .6 + .4 * smoothstep(e.boostRpm, e.peakTorqueRpm, this.powertrain.engineRpm) : 1;
    const engineTorque = input.engineAvailable === false ? 0 : throttle * e.torqueNm * torqueCurve * boost * limiter + idleTorque;
    // Closed-throttle pumping loss is the engine braking; it reaches the wheels only through the clutch.
    const frictionTorque = 8 + engineOmega * (.025 + .05 * (1 - throttle));
    this.powertrain.engineRpm = clamp((engineOmega + (engineTorque - coupling - frictionTorque) / e.inertia * dt) * 60 / TAU, 0, e.redlineRpm + 200);
    let axleTorque = coupling * ratio * e.efficiency;
    if (input.engineAvailable === false) axleTorque = 0;
    this.powertrain.clutch = clutch; this.powertrain.axleTorque = axleTorque;
    this.powertrain.differentialLock = p.differential.type === 'welded' ? 1 : p.differential.type === 'open' ? 0 : p.differential.lock;
    const frontTorques = differentialTorques(this.wheels[0].angularVelocity, this.wheels[1].angularVelocity, axleTorque * frontDrive,
      p.differential, p.wheel.inertia, dt);
    const rearTorques = differentialTorques(this.wheels[2].angularVelocity, this.wheels[3].angularVelocity, axleTorque * (1 - frontDrive),
      p.differential, p.wheel.inertia, dt);
    // Non-driven axles have no differential coupling.
    const torques = [...(frontDrive > 0 ? frontTorques : [0, 0]), ...(frontDrive < 1 ? rearTorques : [0, 0])];
    let fxTotal = 0, fyTotal = 0, moment = 0;
    this.wheels.forEach((w, i) => {
      const front = i < 2, left = i % 2 === 0, x = front ? a : -b, y = left ? -halfTrack : halfTrack;
      const toe = p.suspension.toeDeg * DEG * (left ? 1 : -1);
      const steer = (front ? s.steerAngle : 0) + toe;
      const cos = Math.cos(steer), sin = Math.sin(steer);
      const cornerLong = s.vx - yaw * y, cornerLat = s.vy + yaw * x;
      const u = cornerLong * cos + cornerLat * sin, v = -cornerLong * sin + cornerLat * cos;
      const tire = model.tires[i];
      w.isGrounded = grounded[i]; w.verticalLoad = grounded[i] ? loads[i] : 0; w.suspensionLoad = loads[i];
      w.longitudinalVelocity = u; w.lateralVelocity = v;
      w.slipAngle = Math.atan2(v, Math.max(Math.abs(u), .5));
      w.surfaceGrip = model.surfaceGrip * (tire.surfaceGrip ?? 1); w.pressure = tire.pressurePsi ?? 32;
      w.gripRecovery = moveToward(w.gripRecovery, 1, dt / p.tire.recoverySeconds);
      const reference = totalWeight * (front ? c.chassis.frontWeight : 1 - c.chassis.frontWeight) / 2;
      const heatGrip = .9 + .1 * smoothstep(p.tire.ambientC, p.tire.optimalC, w.temperature)
        - .4 * smoothstep(p.tire.overheatC, p.tire.overheatC + 70, w.temperature);
      const camberGrip = Math.cos(p.suspension.camberDeg * DEG);
      const cap = grounded[i] ? (front ? c.tires.frontGrip : c.tires.rearGrip) * model.surfaceGrip * tire.grip
        * reference * (w.verticalLoad / reference) ** p.tire.loadExponent * heatGrip * (1 - .65 * w.wear) * camberGrip : 0;
      w.maxLateralGrip = cap; w.maxLongitudinalGrip = cap * tire.longitudinalGrip;
      const peakAngle = (front ? c.tires.frontPeakSlipDeg : c.tires.rearPeakSlipDeg) * DEG * tire.slipScale;
      // Brush-style combined demand: increasing drive slip consumes the lateral budget smoothly.
      const forceAt = (omega: number) => {
        const kappa = (omega * radius - u) / Math.max(Math.abs(u), 1);
        const sx = kappa / p.tire.peakSlipRatio, sy = Math.tan(clamp(w.slipAngle, -1.5, 1.5)) / Math.tan(peakAngle);
        const demand = Math.hypot(sx, sy);
        const saturation = (1 - Math.exp(-1.5 * demand)) * (1 - .22 * smoothstep(1, 5, demand));
        const scale = demand > 1e-9 ? saturation / demand : 1.5;
        return { fx: w.maxLongitudinalGrip * sx * scale, fy: -cap * sy * scale, kappa };
      };
      const service = s.brake * mass * c.brakes.decelerationMps2 * radius * (front ? c.brakes.frontBias : 1 - c.brakes.frontBias) / 2;
      const hand = !front ? s.handbrake * mass * c.handbrake.rearBrakeMps2 * radius / 2 : 0;
      const esc = front && ((yawError > 0) !== left) ? escBrake * mass * G * radius : 0;
      const absScale = p.abs && w.slipRatio < -.16 && Math.abs(u) > 2 ? .15 : 1;
      const rolling = grounded[i] ? (tire.rollingResistance * loads[i] + mass * c.drive.rollingResistanceMps2 / 4) * radius : 0;
      const brakeTorque = (service + esc) * absScale + hand + rolling;
      const free = w.angularVelocity + torques[i] / p.wheel.inertia * dt;
      // Implicit angular momentum + tire reaction, with Coulomb brake holding at zero.
      // This permits both genuine wheel lock and stationary burnouts without numerical chatter.
      const response = (omega: number) => moveToward(free - forceAt(omega).fx * radius / p.wheel.inertia * dt, 0, brakeTorque / p.wheel.inertia * dt);
      const span = (Math.abs(torques[i]) + brakeTorque + w.maxLongitudinalGrip * radius) / p.wheel.inertia * dt + 1;
      let lo = Math.min(0, free) - span, hi = Math.max(0, free) + span;
      for (let n = 0; n < 24; n++) { const mid = (lo + hi) / 2; if (mid - response(mid) > 0) hi = mid; else lo = mid; }
      w.angularVelocity = (lo + hi) / 2;
      const force = forceAt(w.angularVelocity);
      const recoveryTime = p.tire.relaxationSeconds + (1 - w.gripRecovery) * p.tire.recoverySeconds;
      // Tire carcass relaxation; after release lateral force rebuilds rather than snapping.
      w.lateralForce += (force.fy - w.lateralForce) * (1 - Math.exp(-dt / recoveryTime));
      w.longitudinalForce = force.fx;
      if (!grounded[i]) w.lateralForce = w.longitudinalForce = 0;
      // Transients must still respect the current friction ellipse (landing/load changes included).
      const use = Math.hypot(cap > 0 ? w.lateralForce / cap : 0,
        w.maxLongitudinalGrip > 0 ? w.longitudinalForce / w.maxLongitudinalGrip : 0);
      if (use > 1) { w.lateralForce /= use; w.longitudinalForce /= use; }
      w.slipRatio = force.kappa; w.wheelRPM = w.angularVelocity * 60 / TAU;
      w.isLocked = grounded[i] && Math.abs(u) > 1 && Math.abs(w.angularVelocity * radius) < .15;
      w.isSpinning = grounded[i] && Math.abs(w.angularVelocity * radius) > Math.abs(u) + 2;
      w.isSliding = grounded[i] && (Math.abs(w.slipAngle) > peakAngle || Math.abs(w.slipRatio) > p.tire.peakSlipRatio);
      w.slipEnergy = grounded[i] ? Math.abs(w.longitudinalForce * (w.angularVelocity * radius - u)) + Math.abs(w.lateralForce * v) : 0;
      w.temperature += (w.slipEnergy / p.tire.heatCapacity - (w.temperature - p.tire.ambientC) * p.tire.coolingRate * (1 + speed / 30)) * dt;
      w.wear = clamp(w.wear + w.slipEnergy * p.tire.wearPerJoule * (1 + smoothstep(100, 160, w.temperature) * 3) * dt, 0, 1);
      const fx = w.longitudinalForce * cos - w.lateralForce * sin;
      const fy = w.longitudinalForce * sin + w.lateralForce * cos;
      fxTotal += fx; fyTotal += fy; moment += x * fy - y * fx;
      Object.assign(model.corners[i], { grounded: grounded[i], normalLoadN: w.verticalLoad,
        fx: w.longitudinalForce, fy: w.lateralForce, driveN: Math.abs(torques[i]) / radius,
        brakeN: (service + hand + esc) / radius, rollingN: rolling / radius, capN: cap,
        slipAngle: w.slipAngle, slipRatio: w.slipRatio, wheelSpeed: w.angularVelocity * radius, steerAngle: steer });
    });
    // Integrate forces in the inertial frame, then rotate back into the new body frame.
    // Exact frame rotation avoids the energy injection of sequential Coriolis Euler updates.
    const ax = fxTotal / mass - c.drive.aeroDrag * speed * s.vx;
    const ay = fyTotal / mass - c.drive.aeroDrag * speed * s.vy;
    const inertia = mass * a * b * c.chassis.yawInertiaScale;
    const nextYaw = yaw + moment / inertia * dt;
    const rotation = nextYaw * dt, cosR = Math.cos(rotation), sinR = Math.sin(rotation);
    const vx = s.vx + ax * dt, vy = s.vy + ay * dt;
    s.vx = vx * cosR + vy * sinR; s.vy = -vx * sinR + vy * cosR; s.yawRate = nextYaw;
    s.longAccel = ax; s.latAccel = ay; s.liftOff = 0;
    // Parking hold is a static brake constraint, never used while sliding or applying power.
    diag.held = grounded.some(Boolean) && controls.throttleRaw === 0 && s.throttle < .01
      && Math.hypot(s.vx, s.vy) < .035 && Math.abs(s.yawRate) < .015;
    if (diag.held) { s.vx = 0; s.vy = 0; s.yawRate = 0; }
    diag.bodySlip = Math.atan2(s.vy, s.vx);
    diag.frontSlip = (this.wheels[0].slipAngle + this.wheels[1].slipAngle) / 2;
    diag.rearSlip = (this.wheels[2].slipAngle + this.wheels[3].slipAngle) / 2;
    diag.maxSteerAngle = (p.steering.roadAngleDeg + (p.steering.driftAngleDeg - p.steering.roadAngleDeg) * controls.driftFactor) * DEG;
    diag.kinematicYawRate = wantedYaw; diag.understeer = Math.abs(wantedYaw) > .05 ? 1 - s.yawRate / wantedYaw : 0;
    const gripUse = (start: number) => this.wheels.slice(start, start + 2).reduce((sum, w) => sum + (w.maxLateralGrip > 0 ? Math.hypot(w.longitudinalForce, w.lateralForce) / w.maxLateralGrip : 0), 0) / 2;
    diag.frontGripUse = gripUse(0); diag.rearGripUse = gripUse(2);
    diag.stabilityYaw = 0; diag.tractionCut = tractionTrim; diag.handbrakeEffect = s.handbrake;
    this.detector.step(speed * 3.6, diag.bodySlip, s.yawRate, Math.max(Math.abs(diag.rearSlip), rearSlip));
  }
}
