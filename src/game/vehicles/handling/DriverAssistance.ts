import type { AssistanceProfile, MechanicalConfig } from './MechanicalConfig';

export const DEG = Math.PI / 180;
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const moveToward = (x: number, target: number, amount: number) => x + clamp(target - x, -amount, amount);
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export type ControlDevice = 'keyboard' | 'controller' | 'wheel' | 'ai';
/** Common boundary for human devices, AI and replay. No motion state can be written here. */
export interface VehicleControlInput {
  steering: number; throttle: number; brake: number; handbrake: number; clutch?: number;
  device?: ControlDevice;
}
export const ASSISTANCE_PROFILES: Record<AssistanceProfile, { counter: number; trim: number; transition: number }> = {
  assisted: { counter: .85, trim: .30, transition: 1.5 },
  standard: { counter: .78, trim: .25, transition: 1.4 },
  simulation: { counter: .40, trim: .10, transition: 1.15 },
  raw: { counter: 0, trim: 0, transition: 1 },
};
/** Pedal and lever slew rates, in full travel per second. */
export interface PedalRates { throttleRise: number; throttleFall: number; brakeRise?: number; brakeFall?: number; handbrakeRise?: number; handbrakeFall?: number }
export interface AssistanceMotion { vx: number; vy: number; yawRate: number; rearSlipRatio: number; frontAxleM: number; rearAxleM?: number }
export interface ControlTelemetry {
  device: ControlDevice; profile: AssistanceProfile; steeringInput: number;
  playerTarget: number; counterTarget: number; finalTarget: number; actualSteering: number;
  steeringVelocity: number; driftFactor: number; throttleRaw: number; throttleFiltered: number;
  throttleAssisted: number; brake: number; handbrake: number; leftHoldTime: number; rightHoldTime: number;
}

/** Stateful virtual driver. Outputs only rack and pedal requests, never chassis corrections. */
export class DriverAssistance {
  readonly telemetry: ControlTelemetry = { device: 'ai', profile: 'standard', steeringInput: 0, playerTarget: 0,
    counterTarget: 0, finalTarget: 0, actualSteering: 0, steeringVelocity: 0, driftFactor: 0,
    throttleRaw: 0, throttleFiltered: 0, throttleAssisted: 0, brake: 0, handbrake: 0, leftHoldTime: 0, rightHoldTime: 0 };
  private filteredAngle = 0;
  private previousIntent = 0;
  private transitionTime = 0;
  reset(): void {
    Object.assign(this.telemetry, new DriverAssistance().telemetry);
    this.filteredAngle = this.previousIntent = this.transitionTime = 0;
  }
  step(dt: number, input: VehicleControlInput, motion: Readonly<AssistanceMotion>, config: MechanicalConfig,
    pedals: PedalRates = { throttleRise: 3.8, throttleFall: 6 }): ControlTelemetry {
    const t = this.telemetry, device = input.device ?? 'ai', keyboard = device === 'keyboard';
    const profile = ASSISTANCE_PROFILES[config.assistance], cs = config.counterSteer, st = config.steering;
    t.device = device; t.profile = config.assistance;
    const steer = clamp(input.steering, -1, 1), speed = Math.hypot(motion.vx, motion.vy) * 3.6;
    // Body frame: +forward/+right, positive yaw = right. Movement angle is right-positive,
    // so a left-turn slide has positive beta and needs POSITIVE (right) countersteer.
    const angle = Math.atan2(motion.vy, motion.vx);
    const angleDelta = Math.atan2(Math.sin(angle - this.filteredAngle), Math.cos(angle - this.filteredAngle));
    this.filteredAngle += angleDelta * (1 - Math.exp(-dt / .07));
    const forwardGate = smoothstep(3, 15, speed) * (motion.vx > 0 ? 1 : 0);
    const predictedAngle = this.filteredAngle - motion.yawRate * .22;
    const drift = smoothstep((cs?.startAngleDeg ?? 5) * DEG, (cs?.fullAngleDeg ?? 22) * DEG, Math.abs(predictedAngle)) * forwardGate;
    const bandStart = st.sensitivityStartKph ?? 35;
    const speedT = clamp((speed - bandStart) / Math.max(1, (st.sensitivityFullKph ?? 140) - bandStart), 0, 1);
    const roadMultiplier = lerp(1, keyboard ? st.highSpeedAuthority ?? .40 : .75, speedT);
    const authority = device === 'wheel' || device === 'ai' ? 1 : lerp(roadMultiplier, .9, drift);
    const max = lerp(config.steering.roadAngleDeg, config.steering.driftAngleDeg, drift) * DEG;
    const strength = cs?.strength ?? profile.counter;
    const counterGain = keyboard ? strength : device === 'controller' ? Math.min(.3, strength) : 0;
    // Front contact-patch direction includes yaw velocity (caster/self-aligning tendency).
    const frontDirection = Math.atan2(motion.vy + motion.frontAxleM * motion.yawRate, Math.max(1, motion.vx));
    const caster = clamp(config.suspension.casterDeg / 15, 0, 1) * .15;
    const counter = clamp(lerp(this.filteredAngle * (cs?.gain ?? .95) - motion.yawRate * .35, frontDirection, caster), -max, max) * counterGain * drift;
    const player = steer * max * authority;
    // Full opposed intent replaces the assist; agreeing input reinforces it. No locked angle.
    const target = clamp(player + counter * (1 - Math.abs(steer) * (player * counter < 0 ? 1 : .35)), -max, max);
    t.leftHoldTime = steer < 0 ? t.leftHoldTime + dt : 0;
    t.rightHoldTime = steer > 0 ? t.rightHoldTime + dt : 0;
    if (keyboard && drift > .2 && steer * this.previousIntent < 0) this.transitionTime = .25;
    this.transitionTime = Math.max(0, this.transitionTime - dt);
    if (steer !== 0) this.previousIntent = steer;
    let rate = lerp(st.rackRate, st.highSpeedRackRate ?? st.rackRate * 3.2 / 7, speedT);
    rate = lerp(rate, st.rackRate * .6, drift);
    if (steer === 0) rate = st.returnRate;
    const hold = Math.max(t.leftHoldTime, t.rightHoldTime);
    if (keyboard && hold > 0 && hold < .1) rate *= 1.35;
    if (this.transitionTime > 0) rate *= profile.transition;
    if (device === 'wheel' || device === 'ai') rate = config.steering.rackRate;
    // Rates are normalized rack travel/sec. Acceleration and damping avoid instant reversals.
    const error = target - t.actualSteering;
    const rackSpeed = rate * max * authority;
    const velocityTarget = clamp(error * 18, -rackSpeed, rackSpeed);
    t.steeringVelocity = moveToward(t.steeringVelocity, velocityTarget, config.steering.rackAcceleration * (keyboard ? authority * authority : 1) * dt);
    const step = t.steeringVelocity * dt;
    if (step * error >= 0 && Math.abs(step) >= Math.abs(error)) { t.actualSteering = target; t.steeringVelocity = 0; }
    else t.actualSteering = clamp(t.actualSteering + step, -max, max);
    t.steeringInput = steer; t.playerTarget = player; t.counterTarget = counter; t.finalTarget = target; t.driftFactor = drift;
    t.throttleRaw = clamp(input.throttle, 0, 1);
    t.throttleFiltered = moveToward(t.throttleFiltered, t.throttleRaw,
      (t.throttleRaw > t.throttleFiltered ? pedals.throttleRise : pedals.throttleFall) * dt);
    const risk = Math.max(smoothstep(.35, .75, Math.abs(motion.rearSlipRatio)),
      smoothstep(45 * DEG, 90 * DEG, Math.abs(motion.yawRate)) * forwardGate);
    const trim = keyboard ? profile.trim : device === 'controller' ? Math.min(.12, profile.trim) : 0;
    // A digital W through a road corner acts like a feathered pedal. Only a real rear slide (rear axle
    // slip angle past the tire's range) hands full throttle back; a hard, gripping corner never does.
    const rearAngle = Math.atan2(motion.vy - motion.yawRate * (motion.rearAxleM ?? 0), Math.max(1, motion.vx));
    const sliding = smoothstep(8 * DEG, 16 * DEG, Math.abs(rearAngle)) * forwardGate;
    const cornering = keyboard ? Math.abs(t.actualSteering) / max * (1 - sliding) * smoothstep(5, 20, speed) : 0;
    t.throttleAssisted = t.throttleFiltered * (1 - risk * trim) * (1 - (config.throttleFeather ?? 0) * cornering);
    t.brake = moveToward(t.brake, clamp(input.brake, 0, 1), (input.brake > t.brake ? pedals.brakeRise ?? 7 : pedals.brakeFall ?? 9) * dt);
    t.handbrake = moveToward(t.handbrake, clamp(input.handbrake, 0, 1),
      (input.handbrake > t.handbrake ? pedals.handbrakeRise ?? 12 : pedals.handbrakeFall ?? 18) * dt);
    return t;
  }
}

/** Presentation/telemetry only. It is never consulted by the force integrator. */
export class DriftDetector {
  drifting = false;
  step(speedKph: number, angle: number, yawRate: number, rearSlip: number): boolean {
    this.drifting = speedKph > (this.drifting ? 12 : 15)
      && Math.abs(angle) > (this.drifting ? 4 : 8) * DEG
      && Math.abs(yawRate) > (this.drifting ? 4 : 8) * DEG
      && Math.abs(rearSlip) > (this.drifting ? .04 : .08);
    return this.drifting;
  }
}
