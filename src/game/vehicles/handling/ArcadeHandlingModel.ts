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
/** Throttle-controlled front axle yaw recovery during a FWD handbrake slide. */
const FRONT_PULL_GAIN = 120;
/** Yaw-rate decay per second while fully airborne. */
const AIR_YAW_DAMPING = 0.8;
/** Share of axle grip braking may use: arcade ABS, so brakes never lock and steal all steering. */
const ABS_LIMIT = 0.95;
/** Max share of static weight load transfer may move between axles. */
const MAX_LOAD_SHIFT = 0.2;
/** Prevent the inside wheel's effective static load from reaching zero. */
const MAX_LATERAL_LOAD_SHIFT = 0.45;

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

/**
 * Share (0..1) of each axle's wheels touching the ground, from the physics layer. `wheels`, when
 * given, is each corner's own contact in `CORNERS` order and overrides the axle shares.
 */
export type AxleContact = { front: number; rear: number; wheels?: readonly boolean[] };

/** Stable corner order used everywhere: front-left, front-right, rear-left, rear-right. */
export const CORNERS = ["FL", "FR", "RL", "RR"] as const;
export type WheelCorner = (typeof CORNERS)[number];

/**
 * What one corner's tire can do right now, from its assembly, pressure and the surface under it.
 * Neutral values (1, 1, 0, installed, not raised) reproduce the plain axle model exactly.
 */
export type CornerTire = {
  /** Friction scale from tire spec, pressure, health and surface. */
  grip: number;
  /** Peak slip angle scale: >1 = softer, slower-building lateral force (low pressure, donut). */
  slipScale: number;
  /** Extra rolling resistance as a share of this corner's normal load (0.015 = 1.5% of load). */
  rollingResistance: number;
  /** False = empty hub: no tire force at all. */
  installed: boolean;
  /** Jacked up: the wheel is off the ground whatever the ray says. */
  raised: boolean;
};

/** Per-corner result of the last step, for tire wear, telemetry and tests. Forces in N, car frame. */
export type CornerForces = {
  corner: WheelCorner;
  grounded: boolean;
  normalLoadN: number;
  /** Wheel-frame forces: longitudinal (forward +) and lateral (right +). */
  fx: number;
  fy: number;
  driveN: number;
  brakeN: number;
  rollingN: number;
  /** Available friction force (N) at this corner. */
  capN: number;
  slipAngle: number;
  /** Estimated longitudinal slip ratio, -1 = locked. */
  slipRatio: number;
  /** Rolling speed of the contact patch along the wheel, m/s (sign = direction). */
  wheelSpeed: number;
  steerAngle: number;
};

export const NEUTRAL_CORNER: CornerTire = { grip: 1, slipScale: 1, rollingResistance: 0, installed: true, raised: false };
/** Slip ratio at which a healthy tire peaks; used to estimate wheel spin/lock from force demand. */
const PEAK_SLIP_RATIO = 0.1;

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
  /** Share of each axle's load moved from right to left (negative = right loaded). */
  lateralLoadShift: number;
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
    transferPerLateralAccel: c.chassis.cgHeightM / (c.chassis.trackWidthM * G),
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
    lateralLoadShift: 0,
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
  /** Each corner's tire, set by the wheel/tire simulation. Retained across resets. */
  readonly tires: CornerTire[] = CORNERS.map(() => ({ ...NEUTRAL_CORNER }));
  /** Each corner's forces from the last step. */
  readonly corners: CornerForces[] = CORNERS.map((corner) => ({
    corner, grounded: false, normalLoadN: 0, fx: 0, fy: 0, driveN: 0, brakeN: 0, rollingN: 0, capN: 0,
    slipAngle: 0, slipRatio: 0, wheelSpeed: 0, steerAngle: 0,
  }));

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

    // Load transfer lags acceleration, so pitch and roll change available grip progressively.
    const shiftTarget = clamp(-s.longAccel * d.transferPerAccel, -MAX_LOAD_SHIFT, MAX_LOAD_SHIFT);
    s.loadShift += (shiftTarget - s.loadShift) * (1 - Math.exp(-c.balance.weightTransferRate * dt));
    const lateralTarget = clamp(s.latAccel * d.transferPerLateralAccel, -MAX_LATERAL_LOAD_SHIFT, MAX_LATERAL_LOAD_SHIFT);
    s.lateralLoadShift += (lateralTarget - s.lateralLoadShift) * (1 - Math.exp(-c.balance.weightTransferRate * dt));

    const coasting = !s.reversing && s.throttle < 0.25 && s.brake < 0.25 && s.vx > d.liftOffMinSpeed && grounded;
    s.liftOff = approach(s.liftOff, coasting ? 1 : 0, coasting ? c.balance.liftOffBuildRate : c.balance.liftOffReleaseRate, dt);

    // A smoothed rear brake. It works at hairpin speeds and remains hazardous at high speed.
    const handbrakeHeld = c.handbrake.enabled && input.handbrake === true;
    const handbrakeRate = handbrakeHeld ? c.handbrake.engageSmoothing : c.handbrake.releaseSmoothing;
    s.handbrake += ((handbrakeHeld ? 1 : 0) - s.handbrake) * (1 - Math.exp(-handbrakeRate * dt));
    const handbrakeWindow =
      s.reversing || !grounded
        ? 0
        : clamp01((Math.hypot(s.vx, s.vy) - d.handbrakeMinSpeed) / (d.handbrakeFullSpeed - d.handbrakeMinSpeed));
    const handbrake = s.handbrake * handbrakeWindow;

    const frontShare = clamp(c.chassis.frontWeight + s.loadShift, 0.15, 0.85);
    // A loaded outside tire gains less grip than the unloaded inside tire loses.
    const loadImbalanceSq = (2 * s.lateralLoadShift) ** 2;
    const frontLoadGrip = 1 - c.tires.frontLoadSensitivity * loadImbalanceSq;
    const rearLoadGrip = 1 - c.tires.rearLoadSensitivity * loadImbalanceSq;
    const lift = s.liftOff * c.balance.liftOffRotation;
    const frontHandbrake = lerp(1, c.handbrake.frontGripMultiplier, handbrake);
    const rearHandbrake = lerp(1, c.handbrake.rearGripMultiplier, handbrake);
    // Friction per unit of normal load at each axle, before the corner's own tire and surface.
    const frontMu = this.surfaceGrip * c.tires.frontGrip * frontLoadGrip * (1 + lift * 0.5) * frontHandbrake;
    const rearMu = this.surfaceGrip * c.tires.rearGrip * rearLoadGrip * (1 - lift) * rearHandbrake;
    const frontLoad = d.m * G * frontShare, rearLoad = d.m * G * (1 - frontShare);

    // Every corner has its own load (lateral transfer moves it left/right), contact and tire.
    const ll = s.lateralLoadShift;
    const cornerContact = (i: number) => {
      const tire = this.tires[i];
      if (!tire.installed || tire.raised) return 0;
      const axle = i < 2 ? contact.front : contact.rear;
      return contact.wheels ? (contact.wheels[i] ? 1 : 0) : axle;
    };
    const loads = [frontLoad * (1 + ll) / 2, frontLoad * (1 - ll) / 2, rearLoad * (1 + ll) / 2, rearLoad * (1 - ll) / 2];
    const caps = loads.map((load, i) => (i < 2 ? frontMu : rearMu) * load * this.tires[i].grip * cornerContact(i));
    const frontCap = caps[0] + caps[1];
    const rearCap = caps[2] + caps[3];

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
    const handbrakeForce = handbrake * d.m * c.handbrake.rearBrakeMps2 * motion;

    const frontDrive = drive * d.frontDriveShare;
    const rearDrive = drive - frontDrive;
    const frontRetard = engineBrake * d.frontDriveShare + brake * c.brakes.frontBias;
    const rearRetard = engineBrake * (1 - d.frontDriveShare) + brake * (1 - c.brakes.frontBias);
    // Extra rolling drag from soft, flat or damaged tires, opposing each corner's own motion.
    const rolling = loads.map((load, i) => this.tires[i].rollingResistance * load *
      (this.tires[i].installed && !this.tires[i].raised ? 1 : 0) * Math.min(1, speed / 0.5) * motion);
    const frontAxle = axlePair(frontDrive, frontRetard, 0, rolling[0], rolling[1], caps[0], caps[1], this.frontLatDemand, c.assists.traction, ABS_LIMIT);
    const rearAxle = axlePair(rearDrive, rearRetard, handbrakeForce, rolling[2], rolling[3], caps[2], caps[3], this.rearLatDemand, c.assists.traction, handbrake > 0 ? 1 : ABS_LIMIT);
    const fxs = [frontAxle.left, frontAxle.right, rearAxle.left, rearAxle.right];
    const frontFx = { force: fxs[0].force + fxs[1].force, driveApplied: fxs[0].drive + fxs[1].drive };
    const rearFx = { force: fxs[2].force + fxs[3].force, driveApplied: fxs[2].drive + fxs[3].drive };
    const requested = Math.abs(frontDrive) + Math.abs(rearDrive);
    diag.tractionCut = requested > 1 ? clamp01(1 - (frontFx.driveApplied + rearFx.driveApplied) / requested) : 0;

    // Lateral: slip angles against each axle's own velocity, capped per corner by what its friction circle leaves.
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    const frontLatVel = s.vy + d.a * s.yawRate;
    const rearLatVel = s.vy - d.b * s.yawRate;
    const wheelLong = s.vx * cosD + frontLatVel * sinD;
    const wheelLat = -s.vx * sinD + frontLatVel * cosD;
    const frontSlip = Math.atan2(wheelLat, Math.max(Math.abs(wheelLong), MIN_SLIP_SPEED));
    const rearSlip = Math.atan2(rearLatVel, Math.max(speed, MIN_SLIP_SPEED));
    // A rear tire far beyond its peak slip cannot immediately develop peak sideways
    // force when the handbrake is released. Its force builds back as the slide unwinds.
    const rearSlidingGrip = 1 - 0.3 * smoothstep(10 * DEG, 30 * DEG, Math.abs(rearSlip));
    const fys = caps.map((cap, i) => {
      const front = i < 2;
      const latCap = Math.sqrt(Math.max(0, cap ** 2 - fxs[i].force ** 2));
      const curve = tireCurve((front ? frontSlip : rearSlip) / ((front ? d.frontPeakSlip : d.rearPeakSlip) * this.tires[i].slipScale),
        front ? c.balance.understeer : c.balance.rearSlideFalloff);
      return { force: -latCap * curve * (front ? 1 : rearSlidingGrip), curve };
    });
    const frontFy = fys[0].force + fys[1].force;
    const rearFy = fys[2].force + fys[3].force;
    const demand = (l: number, r: number) => (caps[l] + caps[r] > 0 ?
      (Math.abs(fys[l].curve) * caps[l] + Math.abs(fys[r].curve) * caps[r]) / (caps[l] + caps[r]) : 0);
    this.frontLatDemand = demand(0, 1);
    this.rearLatDemand = demand(2, 3);

    const fx = frontFx.force * cosD - frontFy * sinD + rearFx.force;
    const fy = frontFx.force * sinD + frontFy * cosD + rearFy;
    // Left/right longitudinal imbalance (a dragging flat, split-grip braking) turns the car
    // through the track width: more force on the left wheel yaws it right.
    const halfTrack = c.chassis.trackWidthM / 2;
    const splitYaw = halfTrack * ((fxs[0].force - fxs[1].force) * cosD + (fxs[2].force - fxs[3].force));
    let yawAccel = (d.a * (frontFx.force * sinD + frontFy * cosD) - d.b * rearFy + splitYaw) / d.Iz;

    // In a FWD slide, accelerating the front axle pulls the nose back toward the
    // direction of travel. This gives the driver a throttle-controlled way to catch
    // the rear while the handbrake remains held.
    if (handbrake > 0 && frontFx.driveApplied > 0) {
      const frontPull = frontFx.driveApplied / (d.m * G);
      const pullYaw = handbrake * frontPull * FRONT_PULL_GAIN * Math.sign(rearSlip) * Math.max(0, Math.abs(rearSlip) - d.stabilityThreshold);
      yawAccel += clamp(pullYaw, -d.a * frontFx.driveApplied / d.Iz, d.a * frontFx.driveApplied / d.Iz);
    }

    // Stability assist: counter-yaw once the rear axle slides past the threshold. Keyed on rear slip
    // (not body slip) so tight low-speed turns, which have large body slip but no sliding, are untouched.
    const slipExcess = Math.abs(rearSlip) - d.stabilityThreshold;
    diag.stabilityYaw = 0;
    if (grounded && slipExcess > 0 && !handbrakeHeld && s.yawRate * rearSlip < 0) {
      // The driver is deliberately asking the rear to rotate. Let it slide until the lever
      // is released; bring stability control back as the rear brake fades out.
      const requestedYaw = c.assists.stability * (1 - s.handbrake) * STABILITY_GAIN * Math.sign(rearSlip) * slipExcess;
      // Electronic correction cannot produce more yaw moment than the tires can transmit.
      const maxYaw = 0.3 * (d.a * frontCap + d.b * rearCap) / d.Iz;
      diag.stabilityYaw = clamp(requestedYaw, -maxYaw, maxYaw);
      yawAccel += diag.stabilityYaw;
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
    // Retarding forces stop the car; they never push it backwards.
    if (vxBefore !== 0 && Math.sign(s.vx) !== Math.sign(vxBefore) && drive * s.vx <= 0) s.vx = 0;

    // Low speed: blend ordinary parking maneuvers to pure rolling kinematics.
    const kinematicYaw = (s.vx * Math.tan(delta)) / d.L;
    // Keep simulating tire forces while a sliding car slows through the parking-speed
    // range. Switching to no-slip kinematics at that point would erase the slide at once.
    const lowSpeedBlend = smoothstep(d.kinematicBelow, d.dynamicAbove, Math.abs(s.vx));
    const slidingBlend = smoothstep(3 * DEG, 10 * DEG, Math.abs(rearSlip));
    const dynamicBlend = Math.max(lowSpeedBlend, slidingBlend);
    if (grounded && dynamicBlend < 1) {
      s.yawRate = lerp(kinematicYaw, s.yawRate, dynamicBlend);
      s.vy = lerp(kinematicYaw * d.b, s.vy, dynamicBlend);
    }

    diag.held = grounded && driveInput === 0 && s.throttle < 0.05 && Math.hypot(s.vx, s.vy) < d.holdBelow;
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

    const rearSpeed = s.vx;
    this.corners.forEach((out, i) => {
      const front = i < 2, cap = caps[i], force = fxs[i];
      out.grounded = cornerContact(i) > 0;
      out.normalLoadN = out.grounded ? loads[i] : 0;
      out.fx = force.force;
      out.fy = fys[i].force;
      out.driveN = force.drive;
      out.brakeN = force.retard;
      out.rollingN = Math.abs(rolling[i]);
      out.capN = cap;
      out.slipAngle = front ? frontSlip : rearSlip;
      out.steerAngle = front ? delta : 0;
      const locked = !front && handbrake > 0.5 && cap > 0 && Math.abs(force.force) >= cap * 0.98;
      out.slipRatio = !out.grounded ? 0 : locked ? -1 : clamp(cap > 0 ? (force.force / cap) * PEAK_SLIP_RATIO * this.tires[i].slipScale : 0, -1, 1);
      out.wheelSpeed = (front ? wheelLong : rearSpeed) * (1 + out.slipRatio);
    });
  }
}

/**
 * One axle's two corners. Drive goes through a mildly limited-slip differential: each side gets
 * half, capped by its own traction, and half of what a spinning side can't use moves across.
 * Brakes are split evenly and each side is capped by its own grip, so split-grip braking pulls.
 * The traction assist trades drive for steering (friction circle); retarding is capped by arcade ABS.
 */
function axlePair(drive: number, retard: number, handbrake: number, rollLeft: number, rollRight: number,
  capLeft: number, capRight: number, latDemand: number, tractionAssist: number, brakeLimit: number) {
  const cornering = clamp01(latDemand);
  const assist = lerp(1, Math.sqrt(1 - cornering * cornering), tractionAssist);
  const limitLeft = capLeft * assist, limitRight = capRight * assist;
  const half = Math.abs(drive) / 2;
  let left = Math.min(half, limitLeft), right = Math.min(half, limitRight);
  const spare = Math.abs(drive) - left - right;
  if (spare > 0) {
    left += Math.min(spare * 0.5, Math.max(0, limitLeft - left));
    right += Math.min(spare * 0.5, Math.max(0, limitRight - right));
  }
  const side = (applied: number, roll: number, cap: number) => {
    const limit = cap * brakeLimit;
    const retardN = retard / 2 + handbrake / 2 + roll;
    return { force: clamp(Math.sign(drive) * applied - retardN, -limit, limit), drive: applied, retard: Math.abs(retard / 2 + handbrake / 2) };
  };
  return { left: side(left, rollLeft, capLeft), right: side(right, rollRight, capRight) };
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
