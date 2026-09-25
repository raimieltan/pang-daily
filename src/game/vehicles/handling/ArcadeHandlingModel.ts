import type { HandlingConfig } from "./HandlingConfig";

/**
 * Arcade handling model: a planar two-axle ("bicycle") model with friction
 * circles, lagged load transfer, and explicit arcade knobs (lift-off rotation,
 * assists, low-speed kinematic blend). Engine-agnostic and deterministic, so it
 * can be unit tested and later re-used for multiplayer validation.
 *
 * Body frame: +x forward, +y right, yaw rate positive = turning right
 * (matches Babylon's left-handed Y-up with the car facing +Z).
 */

const G = 9.81;
const KMH = 1 / 3.6;
const DEG = Math.PI / 180;
/** Slip angles are computed against at least this speed so they stay finite near standstill. */
const MIN_SLIP_SPEED = 0.5;
/** Counter-yaw (rad/s² per rad of body slip past the threshold) at stability = 1. */
const STABILITY_GAIN = 60;
/** Yaw-rate decay per second while fully airborne. */
const AIR_YAW_DAMPING = 0.8;
/** Share of axle grip braking may use: arcade ABS, so brakes never lock and steal all steering. */
const ABS_LIMIT = 0.95;
/** Max share of static weight load transfer may move between axles. */
const MAX_LOAD_SHIFT = 0.2;
/** Handbrake yaw feed (rad/s² per rad/s short of its target) at yawAssistStrength = 1. */
const HANDBRAKE_YAW_GAIN = 4;

const FRONT_DRIVE_SHARE: Record<HandlingConfig["drive"]["drivetrain"], number> = { FWD: 1, RWD: 0, AWD: 0.4 };

/** Normalized driver intent. Device mapping and smoothing of analog sticks happen upstream. */
export type DriverInput = {
  /** 0..1 */
  throttle: number;
  /** False disables propulsion in either gear while preserving braking. */
  engineAvailable?: boolean;
  /** 0..1. Held at a standstill, selects reverse. */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** Held = rear loosens for rotation. Absent = released. */
  handbrake?: boolean;
};

/** Share (0..1) of each axle's wheels touching the ground, from the physics layer. */
export type AxleContact = { front: number; rear: number };

export type HandlingState = {
  /** Body-frame forward speed, m/s. */
  vx: number;
  /** Body-frame lateral speed (right +), m/s. */
  vy: number;
  /** rad/s, right +. */
  yawRate: number;
  /** Road-wheel angle, rad, right +. */
  steerAngle: number;
  /** Smoothed pedal positions actually applied (after reverse remapping). */
  throttle: number;
  brake: number;
  reversing: boolean;
  /** Share of total weight moved onto the front axle (negative = rearward). */
  loadShift: number;
  /** 0..1 lift-off envelope. */
  liftOff: number;
  /** 0..1 handbrake envelope (smoothed button, before the speed window). */
  handbrake: number;
  /** Last step's body-frame accelerations, m/s². */
  longAccel: number;
  latAccel: number;
};

/** Per-step readout for debug telemetry and tests. Not part of the simulation state. */
export type HandlingDiagnostics = {
  maxSteerAngle: number;
  /** Yaw rate the car would have if the tires had infinite grip (rad/s). */
  kinematicYawRate: number;
  /** 1 - yawRate / kinematicYawRate. >0 = understeering, <0 = rotating more than steered. */
  understeer: number;
  bodySlip: number;
  frontSlip: number;
  rearSlip: number;
  /** Combined force / available grip per axle (1 = at the limit). */
  frontGripUse: number;
  rearGripUse: number;
  /** 0..1 share of requested drive force the traction limit/assist removed. */
  tractionCut: number;
  /** Counter-yaw currently applied by the stability assist, rad/s². */
  stabilityYaw: number;
  /** 0..1 handbrake effect after the speed window. */
  handbrakeEffect: number;
  /** Yaw fed by the handbrake, rad/s². */
  handbrakeYaw: number;
  held: boolean;
};

type Derived = ReturnType<typeof derive>;

function derive(c: HandlingConfig) {
  const m = c.chassis.massKg;
  const L = c.chassis.wheelbaseM;
  const a = L * (1 - c.chassis.frontWeight);
  const b = L * c.chassis.frontWeight;
  return {
    m,
    L,
    a,
    b,
    Iz: m * a * b * c.chassis.yawInertiaScale,
    maxSteer: c.steering.maxAngleDeg * DEG,
    minSteer: Math.min(c.steering.minAngleDeg, c.steering.maxAngleDeg) * DEG,
    fullLockAccel: c.steering.fullLockLateralG * G,
    frontDriveShare: FRONT_DRIVE_SHARE[c.drive.drivetrain],
    topSpeed: c.drive.topSpeedKmh * KMH,
    reverseTopSpeed: c.drive.reverseTopSpeedKmh * KMH,
    frontPeakSlip: c.tires.frontPeakSlipDeg * DEG,
    rearPeakSlip: c.tires.rearPeakSlipDeg * DEG,
    transferPerAccel: (c.balance.weightTransfer * c.chassis.cgHeightM) / (L * G),
    liftOffMinSpeed: c.balance.liftOffMinSpeedKmh * KMH,
    stabilityThreshold: c.assists.stabilityThresholdDeg * DEG,
    handbrakeMinSpeed: c.handbrake.minEffectiveSpeedKmh * KMH,
    handbrakeFullSpeed: Math.max(c.handbrake.fullEffectSpeedKmh, c.handbrake.minEffectiveSpeedKmh + 1) * KMH,
    kinematicBelow: c.lowSpeed.kinematicBelowKmh * KMH,
    dynamicAbove: Math.max(c.lowSpeed.dynamicAboveKmh, c.lowSpeed.kinematicBelowKmh + 1) * KMH,
    holdBelow: c.lowSpeed.holdBelowKmh * KMH,
    reverseEngageBelow: c.lowSpeed.reverseEngageBelowKmh * KMH,
  };
}

export function createHandlingState(): HandlingState {
  return {
    vx: 0,
    vy: 0,
    yawRate: 0,
    steerAngle: 0,
    throttle: 0,
    brake: 0,
    reversing: false,
    loadShift: 0,
    liftOff: 0,
    handbrake: 0,
    longAccel: 0,
    latAccel: 0,
  };
}

export class ArcadeHandlingModel {
  readonly state: HandlingState = createHandlingState();
  readonly diagnostics: HandlingDiagnostics = {
    maxSteerAngle: 0,
    kinematicYawRate: 0,
    understeer: 0,
    bodySlip: 0,
    frontSlip: 0,
    rearSlip: 0,
    frontGripUse: 0,
    rearGripUse: 0,
    tractionCut: 0,
    stabilityYaw: 0,
    handbrakeEffect: 0,
    handbrakeYaw: 0,
    held: false,
  };

  private c: HandlingConfig;
  private d: Derived;
  /** Last step's cornering demand per axle (0..1 of grip); the traction assist reserves grip for it. */
  private frontLatDemand = 0;
  private rearLatDemand = 0;
  /** Seconds spent stopped with the brake held; reverse engages after `reverseDelaySeconds`. */
  private stoppedBrakeTime = 0;

  /** Environmental grip; independent of handling preset and retained across resets. */
  surfaceGrip = 1;

  constructor(config: HandlingConfig) {
    this.c = config;
    this.d = derive(config);
  }

  get config(): HandlingConfig {
    return this.c;
  }

  /** Swap tuning live (preset change, part install). Motion state is kept. */
  setConfig(config: HandlingConfig): void {
    this.c = config;
    this.d = derive(config);
  }

  reset(): void {
    Object.assign(this.state, createHandlingState());
    this.frontLatDemand = this.rearLatDemand = 0;
    this.stoppedBrakeTime = 0;
  }

  /** Feed the body's actual motion back in (after collisions, gravity on slopes, ...). */
  syncMotion(vx: number, vy: number, yawRate: number): void {
    this.state.vx = vx;
    this.state.vy = vy;
    this.state.yawRate = yawRate;
  }

  step(dt: number, input: DriverInput, contact: AxleContact): void {
    const { c, d, state: s, diagnostics: diag } = this;
    const speed = Math.abs(s.vx);
    const grounded = Math.max(contact.front, contact.rear) > 0;

    // Gear: brake held at a standstill selects reverse (after a short pause, so stopping hard
    // never rolls straight into reverse); throttle at a standstill selects drive.
    const wantsReverse = !s.reversing && input.brake > 0.5 && input.throttle < 0.1 && speed < d.reverseEngageBelow;
    this.stoppedBrakeTime = wantsReverse ? this.stoppedBrakeTime + dt : 0;
    if (this.stoppedBrakeTime >= c.lowSpeed.reverseDelaySeconds) {
      s.reversing = true;
      this.stoppedBrakeTime = 0;
    } else if (s.reversing && input.throttle > 0.5 && input.brake < 0.1 && speed < d.reverseEngageBelow) {
      s.reversing = false;
    }
    const engineAvailable = input.engineAvailable !== false;
    const driveInput = engineAvailable ? clamp01(s.reversing ? input.brake : input.throttle) : 0;
    if (!engineAvailable) s.throttle = 0;
    const brakeInput = clamp01(s.reversing ? input.throttle : input.brake);
    s.throttle = approach(s.throttle, driveInput, driveInput > s.throttle ? c.pedals.throttleRise : c.pedals.throttleFall, dt);
    s.brake = approach(s.brake, brakeInput, brakeInput > s.brake ? c.pedals.brakeRise : c.pedals.brakeFall, dt);

    // Speed-sensitive steering: full lock asks for a fixed lateral g, so it shrinks with v².
    // Turn-in/unwind are timed against the current lock, so keyboard steering feels the same at any speed.
    const lockForSpeed = Math.atan((d.L * d.fullLockAccel) / Math.max(speed * speed, 1e-3));
    const maxSteer = clamp(lockForSpeed, d.minSteer, d.maxSteer);
    const steerTarget = clamp(input.steer, -1, 1) * maxSteer;
    const unwinding = Math.abs(steerTarget) < Math.abs(s.steerAngle) || steerTarget * s.steerAngle < 0;
    const steerTime = unwinding ? c.steering.unwindSeconds : c.steering.turnInSeconds;
    s.steerAngle = approach(s.steerAngle, steerTarget, maxSteer / steerTime, dt);
    const delta = s.steerAngle;

    // Load transfer lags the acceleration that causes it, so pitch (and its grip change) is telegraphed.
    const shiftTarget = clamp(-s.longAccel * d.transferPerAccel, -MAX_LOAD_SHIFT, MAX_LOAD_SHIFT);
    s.loadShift += (shiftTarget - s.loadShift) * (1 - Math.exp(-c.balance.weightTransferRate * dt));

    const coasting = !s.reversing && s.throttle < 0.25 && s.brake < 0.25 && s.vx > d.liftOffMinSpeed && grounded;
    s.liftOff = approach(s.liftOff, coasting ? 1 : 0, coasting ? c.balance.liftOffBuildRate : c.balance.liftOffReleaseRate, dt);

    // Handbrake: a smoothed envelope, windowed by speed so it does nothing parked, peaks at medium
    // speed, and fades at high speed. Forward only: it is a cornering tool, not a J-turn button.
    const handbrakeHeld = c.handbrake.enabled && input.handbrake === true;
    const handbrakeRate = handbrakeHeld ? c.handbrake.engageSmoothing : c.handbrake.releaseSmoothing;
    s.handbrake += ((handbrakeHeld ? 1 : 0) - s.handbrake) * (1 - Math.exp(-handbrakeRate * dt));
    const handbrakeWindow =
      s.reversing || !grounded
        ? 0
        : clamp01((s.vx - d.handbrakeMinSpeed) / (d.handbrakeFullSpeed - d.handbrakeMinSpeed)) * Math.min(1, d.handbrakeFullSpeed / Math.max(s.vx, 1e-3));
    const handbrake = s.handbrake * handbrakeWindow;

    const frontShare = clamp(c.chassis.frontWeight + s.loadShift, 0.15, 0.85);
    const lift = s.liftOff * c.balance.liftOffRotation;
    const frontHandbrake = lerp(1, c.handbrake.frontGripMultiplier, handbrake);
    const rearHandbrake = lerp(1, c.handbrake.rearGripMultiplier, handbrake);
    const frontCap = this.surfaceGrip * c.tires.frontGrip * (1 + lift * 0.5) * frontHandbrake * d.m * G * frontShare * contact.front;
    const rearCap = this.surfaceGrip * c.tires.rearGrip * (1 - lift) * rearHandbrake * d.m * G * (1 - frontShare) * contact.rear;

    // Longitudinal requests. Retarding forces oppose motion; drive pushes in the selected direction.
    const dir = s.reversing ? -1 : 1;
    const along = s.vx * dir;
    const top = s.reversing ? d.reverseTopSpeed : d.topSpeed;
    const accel = s.reversing ? c.drive.reverseAccelerationMps2 : c.drive.accelerationMps2;
    const power = along <= 0 ? 1 : Math.max(0, 1 - (along / top) ** 2);
    const drive = s.throttle * d.m * accel * power * dir;
    const motion = Math.sign(s.vx);
    const engineBrake = (1 - s.throttle) * d.m * c.drive.engineBrakingMps2 * Math.min(1, speed / 3) * motion;
    const brake = s.brake * d.m * c.brakes.decelerationMps2 * motion;

    const frontDrive = drive * d.frontDriveShare;
    const rearDrive = drive - frontDrive;
    const frontFx = axleForce(frontDrive, engineBrake * d.frontDriveShare + brake * c.brakes.frontBias, frontCap, this.frontLatDemand, c.assists.traction);
    const rearFx = axleForce(rearDrive, engineBrake * (1 - d.frontDriveShare) + brake * (1 - c.brakes.frontBias), rearCap, this.rearLatDemand, c.assists.traction);
    const requested = Math.abs(frontDrive) + Math.abs(rearDrive);
    diag.tractionCut = requested > 1 ? clamp01(1 - (frontFx.driveApplied + rearFx.driveApplied) / requested) : 0;

    // Lateral: slip angles against each axle's own velocity, capped by what the friction circle leaves.
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    const frontLatVel = s.vy + d.a * s.yawRate;
    const rearLatVel = s.vy - d.b * s.yawRate;
    const wheelLong = s.vx * cosD + frontLatVel * sinD;
    const wheelLat = -s.vx * sinD + frontLatVel * cosD;
    const frontSlip = Math.atan2(wheelLat, Math.max(Math.abs(wheelLong), MIN_SLIP_SPEED));
    const rearSlip = Math.atan2(rearLatVel, Math.max(speed, MIN_SLIP_SPEED));
    const frontLatCap = Math.sqrt(Math.max(0, frontCap ** 2 - frontFx.force ** 2));
    const rearLatCap = Math.sqrt(Math.max(0, rearCap ** 2 - rearFx.force ** 2));
    const frontCurve = tireCurve(frontSlip / d.frontPeakSlip, c.balance.understeer);
    const rearCurve = tireCurve(rearSlip / d.rearPeakSlip, c.balance.rearSlideFalloff);
    const frontFy = -frontLatCap * frontCurve;
    const rearFy = -rearLatCap * rearCurve;
    this.frontLatDemand = Math.abs(frontCurve);
    this.rearLatDemand = Math.abs(rearCurve);

    const fx = frontFx.force * cosD - frontFy * sinD + rearFx.force;
    const fy = frontFx.force * sinD + frontFy * cosD + rearFy;
    let yawAccel = (d.a * (frontFx.force * sinD + frontFy * cosD) - d.b * rearFy) / d.Iz;

    // Stability assist: counter-yaw once the rear axle slides past the threshold. Keyed on rear slip
    // (not body slip) so tight low-speed turns, which have large body slip but no sliding, are untouched.
    const slipExcess = Math.abs(rearSlip) - d.stabilityThreshold;
    diag.stabilityYaw = 0;
    if (grounded && slipExcess > 0) {
      // Half-relaxed while the handbrake is doing its job; returns with rear grip to help the catch.
      diag.stabilityYaw = c.assists.stability * (1 - 0.5 * handbrake) * STABILITY_GAIN * Math.sign(rearSlip) * slipExcess;
      yawAccel += diag.stabilityYaw;
    }

    // Handbrake yaw feed: pulls yaw rate toward what the steering asks for plus a capped bonus.
    // It only ever adds rotation in the steered direction and stops once the target is reached,
    // so it can't spin the car on its own and does nothing without steering.
    diag.handbrakeYaw = 0;
    const steerDir = Math.sign(input.steer);
    if (handbrake > 0 && steerDir !== 0) {
      const target = (s.vx * Math.tan(delta)) / d.L + clamp(input.steer, -1, 1) * c.handbrake.maxYawRateBonus * handbrake;
      const shortfall = (target - s.yawRate) * steerDir;
      if (shortfall > 0) {
        diag.handbrakeYaw = steerDir * shortfall * HANDBRAKE_YAW_GAIN * c.handbrake.yawAssistStrength;
        yawAccel += diag.handbrakeYaw;
      }
    }

    const ax = fx / d.m;
    const ay = fy / d.m;
    const vxBefore = s.vx;
    s.vx += (ax + s.yawRate * s.vy) * dt;
    s.vy += (ay - s.yawRate * s.vx) * dt;
    s.yawRate += yawAccel * dt;
    if (!grounded) s.yawRate *= Math.exp(-AIR_YAW_DAMPING * dt);

    const resist = (grounded ? c.drive.rollingResistanceMps2 : 0) + c.drive.aeroDrag * s.vx * s.vx;
    s.vx = towardZero(s.vx, resist * dt);
    // Speed bleed is a body drag rather than rear brake force: braking through the already
    // loosened rear tires would use up their friction circle and lock the car into a spin.
    s.vx *= 1 - c.handbrake.speedBleedPerSecond * handbrake * dt;
    // Retarding forces stop the car; they never push it backwards.
    if (vxBefore !== 0 && Math.sign(s.vx) !== Math.sign(vxBefore) && drive * s.vx <= 0) s.vx = 0;

    // Low speed: blend to pure rolling kinematics (rear axle doesn't slip, yaw follows the wheels).
    const kinematicYaw = (s.vx * Math.tan(delta)) / d.L;
    const dynamicBlend = smoothstep(d.kinematicBelow, d.dynamicAbove, Math.abs(s.vx));
    if (grounded && dynamicBlend < 1) {
      s.yawRate = lerp(kinematicYaw, s.yawRate, dynamicBlend);
      s.vy = lerp(kinematicYaw * d.b, s.vy, dynamicBlend);
    }

    diag.held = grounded && driveInput === 0 && s.throttle < 0.05 && Math.abs(s.vx) < d.holdBelow;
    if (diag.held) {
      s.vx = 0;
      s.vy = 0;
      s.yawRate = 0;
    }

    s.longAccel = ax;
    s.latAccel = ay;

    diag.maxSteerAngle = maxSteer;
    diag.kinematicYawRate = kinematicYaw;
    diag.understeer = Math.abs(kinematicYaw) > 0.05 ? 1 - s.yawRate / kinematicYaw : 0;
    diag.bodySlip = Math.atan2(s.vy, Math.max(speed, 1));
    diag.frontSlip = frontSlip;
    diag.rearSlip = rearSlip;
    diag.frontGripUse = frontCap > 0 ? Math.hypot(frontFx.force, frontFy) / frontCap : 0;
    diag.rearGripUse = rearCap > 0 ? Math.hypot(rearFx.force, rearFy) / rearCap : 0;
    diag.handbrakeEffect = handbrake;
  }
}

/**
 * Longitudinal force one axle can deliver. Drive is capped by grip; the traction assist
 * blends that cap toward "whatever cornering leaves over" (friction circle), trading
 * acceleration for steering. Retarding forces are capped by arcade ABS.
 */
function axleForce(drive: number, retard: number, cap: number, latDemand: number, tractionAssist: number) {
  const cornering = clamp01(latDemand);
  const driveLimit = cap * lerp(1, Math.sqrt(1 - cornering * cornering), tractionAssist);
  const driveApplied = Math.min(Math.abs(drive), driveLimit);
  const limit = cap * ABS_LIMIT;
  const force = clamp(Math.sign(drive) * driveApplied - retard, -limit, limit);
  return { force, driveApplied };
}

/**
 * Normalized lateral force for slip ratio x = slip / peakSlip: rises smoothly to 1 at the
 * peak, then falls by up to `falloff / 2` when overdriven to 3× the peak slip.
 */
function tireCurve(x: number, falloff: number): number {
  const ax = Math.abs(x);
  const y = ax <= 1 ? ax * (2 - ax) : 1 - falloff * 0.5 * Math.min((ax - 1) / 2, 1);
  return Math.sign(x) * y;
}

function approach(value: number, target: number, ratePerSecond: number, dt: number): number {
  const step = ratePerSecond * dt;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

function towardZero(value: number, amount: number): number {
  return value > 0 ? Math.max(0, value - amount) : Math.min(0, value + amount);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
