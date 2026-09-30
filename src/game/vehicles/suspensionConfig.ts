import { createSuspension, DEG, type SuspensionBaseline } from '@/game-core/suspension/schema';
import type { HandlingConfig } from './handling/HandlingConfig';
import { STOCK_MECHANICAL } from './handling/MechanicalConfig';
/** Legacy vehicle definitions migrate to the common drivetrain/tire model at the runtime boundary. */
export function physicalConfig(config: HandlingConfig): HandlingConfig {
  if (config.mechanical) return config;
  const p = structuredClone(STOCK_MECHANICAL);
  p.engine.torqueNm = config.chassis.massKg * config.drive.accelerationMps2 * p.wheel.radiusM / (p.engine.gearRatios[0] * p.engine.finalDrive * p.engine.efficiency) * 1.3;
  p.engine.clutchTorqueNm = p.engine.torqueNm * 1.5;
  p.steering.roadAngleDeg = config.steering.maxAngleDeg; p.steering.driftAngleDeg = config.steering.maxAngleDeg;
  p.suspension.frontSpring = config.chassis.massKg * 25; p.suspension.rearSpring = config.chassis.massKg * 20;
  p.suspension.frontAntiRoll = 8500; p.suspension.rearAntiRoll = 4500;
  return { ...config, mechanical: p };
}
export function suspensionBaseline(c: HandlingConfig): SuspensionBaseline {
  const p = physicalConfig(c).mechanical!;
  return { mass: c.chassis.massKg, frontWeight: c.chassis.frontWeight, wheelbase: c.chassis.wheelbaseM, track: c.chassis.trackWidthM,
    cgHeight: c.chassis.cgHeightM, frontSpring: p.suspension.frontSpring, rearSpring: p.suspension.rearSpring, radius: p.wheel.radiusM,
    frontARB: p.suspension.frontAntiRoll, rearARB: p.suspension.rearAntiRoll, damping: p.suspension.damping,
    camber: p.suspension.camberDeg * DEG, toe: p.suspension.toeDeg * DEG, caster: p.suspension.casterDeg * DEG, maxLock: p.steering.roadAngleDeg * DEG };
}
export const stockSuspension = (c: HandlingConfig) => createSuspension(suspensionBaseline(c));
