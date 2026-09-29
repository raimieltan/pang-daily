import { z } from 'zod';
import { SURFACE_TIRE, TIRE_SPECS, type TireSpecId, type TireSurface } from './specs';

/**
 * One wheel + tire assembly: a persistent object that keeps its pressure, damage and history
 * whether it is on a hub, in the trunk or in the player's hands.
 */
export const FAILURE_STATES = ['HEALTHY', 'SLOW_LEAK', 'RAPID_LEAK', 'FLAT', 'BLOWOUT', 'DESTROYED'] as const;
export type FailureState = (typeof FAILURE_STATES)[number];

export const assemblySchema = z.object({
  id: z.string().min(1),
  temperatureC: z.number().optional(),
  thermalWear: z.number().min(0).max(1).optional(),
  spec: z.enum(['standard', 'donut']),
  pressureKpa: z.number().min(0),
  /** Carcass and tread, 1 = new. 0 = destroyed. */
  health: z.number().min(0).max(1),
  failure: z.enum(FAILURE_STATES),
  /** Current leak, kPa per minute. */
  leakKpaPerMin: z.number().min(0),
  /** 0 = true rim, 1 = bent beyond use. Only grows. */
  rimDamage: z.number().min(0).max(1),
  /** Metres driven below the flat threshold. */
  flatDistanceM: z.number().min(0),
});
export type TireAssembly = z.infer<typeof assemblySchema>;

/** Below this the tire is carrying the car on its sidewalls. */
export const FLAT_KPA = 30;
/** Warn the driver below this share of nominal pressure. */
export const LOW_PRESSURE_RATIO = .8;
const RIM_CONTACT_KPA = 8;

export function newAssembly(id: string, spec: TireSpecId = 'standard'): TireAssembly {
  return { id, spec, pressureKpa: TIRE_SPECS[spec].nominalKpa, health: 1, failure: 'HEALTHY', leakKpaPerMin: 0, rimDamage: 0, flatDistanceM: 0 };
}

export function pressureRatio(tire: TireAssembly) { return tire.pressureKpa / TIRE_SPECS[tire.spec].nominalKpa; }
export const isLowPressure = (tire: TireAssembly) => pressureRatio(tire) < LOW_PRESSURE_RATIO;
export const isFlat = (tire: TireAssembly) => tire.pressureKpa <= FLAT_KPA || tire.failure === 'DESTROYED';
/** Riding on the rim: no rubber left between metal and road. */
export const onRim = (tire: TireAssembly) => tire.failure === 'DESTROYED' || tire.pressureKpa <= RIM_CONTACT_KPA && tire.health < .25;

/**
 * The car's road wheel set and its rubber, shared by the four road tires: the aftermarket set's
 * compound (`gripScale`), its braking/traction bias (`longitudinalScale`), how battered the set's
 * rims are (`rimWear`), and the tread left on the rubber (`tread`, the maintenance `tires` condition)
 * with the definition's grip loss at bald. A donut is its own wheel and ignores all of this.
 */
export type WheelSetup = { gripScale: number; longitudinalScale: number; rimWear: number; tread: number; treadGripLoss: number };
export const STOCK_SETUP: WheelSetup = { gripScale: 1, longitudinalScale: 1, rimWear: 0, tread: 1, treadGripLoss: 0 };
/** A fully bent/out-of-round rim loses this share of grip. */
export const BENT_RIM_GRIP_LOSS = 0.08;

/** What the tire gives the handling model on a surface. Surface factors are applied per corner here, never globally. */
export function tireResponse(tire: TireAssembly, surface: TireSurface, setup: WheelSetup = STOCK_SETUP) {
  const spec = TIRE_SPECS[tire.spec];
  const p = pressureRatio(tire);
  const ground = SURFACE_TIRE[surface];
  const road = tire.spec === 'standard';
  if (onRim(tire)) {
    // Steel on road: little grip, lots of drag, and it barely builds sideways force.
    return { grip: .32 * ground.grip, longitudinalGrip: 1, slipScale: 2.2, rollingResistance: .09 + ground.rolling };
  }
  const rim = 1 - BENT_RIM_GRIP_LOSS * Math.max(tire.rimDamage, road ? setup.rimWear : 0);
  const set = road ? setup.gripScale * (1 - setup.treadGripLoss * (1 - Math.min(1, Math.max(0, setup.tread)))) : 1;
  // Over-inflated: a slightly smaller patch. Under-inflated: soft, draggy, loses grip fast once flat.
  const pressureGrip = p >= 1 ? 1 - .25 * (p - 1) ** 2 : p >= .6 ? 1 - .12 * (1 - p) / .4 : .88 - .38 * (.6 - Math.max(0, p)) / .6;
  const soft = Math.max(0, .95 - p);
  return {
    grip: spec.gripScale * ground.grip * pressureGrip * (.8 + .2 * tire.health) * rim * set,
    longitudinalGrip: road ? setup.longitudinalScale : 1,
    slipScale: spec.slipScale * (1 + 1.3 * soft),
    rollingResistance: spec.rollingResistance + ground.rolling + .09 * soft ** 1.5,
  };
}

export type TireEvent =
  | { kind: 'state'; from: FailureState; to: FailureState }
  | { kind: 'low_pressure' }
  | { kind: 'rim_damage'; rimDamage: number }
  | { kind: 'overspeed' };

/** Sets a failure and its leak. Worse failures always win over milder ones. */
export function puncture(tire: TireAssembly, failure: 'SLOW_LEAK' | 'RAPID_LEAK' | 'BLOWOUT', leakKpaPerMin?: number): TireEvent[] {
  if (FAILURE_STATES.indexOf(tire.failure) >= FAILURE_STATES.indexOf(failure)) return [];
  const from = tire.failure;
  tire.failure = failure;
  if (failure === 'SLOW_LEAK') tire.leakKpaPerMin = leakKpaPerMin ?? 4;
  if (failure === 'RAPID_LEAK') tire.leakKpaPerMin = leakKpaPerMin ?? 70;
  if (failure === 'BLOWOUT') { tire.pressureKpa = 0; tire.leakKpaPerMin = 0; tire.health = Math.min(tire.health, .35); }
  return [{ kind: 'state', from, to: failure }];
}

/**
 * Chance that an impact punctures a tire (0..1), from strength 0..1 and the tire's spec.
 * The caller rolls against it with its own seeded random, so tests stay deterministic.
 */
export function impactPuncture(tire: TireAssembly, strength: number, roll: number): 'SLOW_LEAK' | 'RAPID_LEAK' | 'BLOWOUT' | null {
  const risk = Math.min(1, Math.max(0, strength - .35) * 1.1 * TIRE_SPECS[tire.spec].puncturePenalty);
  if (roll >= risk) return null;
  const hit = roll / Math.max(risk, 1e-6);
  return strength > .85 && hit < .35 ? 'BLOWOUT' : hit < .5 ? 'RAPID_LEAK' : 'SLOW_LEAK';
}

/**
 * Advances one assembly by `dt` seconds while rolling at `speedMps` on `surface`.
 * `hazardRoll` is a uniform random 0..1 for road-hazard punctures (1 = never).
 */
export function stepAssembly(tire: TireAssembly, dt: number, speedMps: number, surface: TireSurface, hazardRoll = 1): TireEvent[] {
  const events: TireEvent[] = [];
  const spec = TIRE_SPECS[tire.spec];
  const wasLow = isLowPressure(tire);
  const metres = Math.abs(speedMps) * dt;
  if (tire.leakKpaPerMin > 0) tire.pressureKpa = Math.max(0, tire.pressureKpa - tire.leakKpaPerMin * dt / 60);
  if (!wasLow && isLowPressure(tire)) events.push({ kind: 'low_pressure' });

  // Road hazards: a flat-risk surface can pick up a nail. Rolled per metre so dt does not matter.
  const hazard = SURFACE_TIRE[surface].hazardPerKm * metres / 1000;
  if (hazard > 0 && hazardRoll < hazard) events.push(...puncture(tire, 'SLOW_LEAK', 3 + hazardRoll / hazard * 6));

  if (tire.pressureKpa <= FLAT_KPA && (tire.failure === 'SLOW_LEAK' || tire.failure === 'RAPID_LEAK')) {
    events.push({ kind: 'state', from: tire.failure, to: 'FLAT' });
    tire.failure = 'FLAT';
    tire.leakKpaPerMin = 0;
  }
  if (isFlat(tire) && metres > 0) {
    // Driving flat chews the sidewall; faster is much worse.
    tire.flatDistanceM += metres;
    const wear = metres / 1000 * (1.2 + (Math.abs(speedMps) / 12) ** 2 * 2.4);
    tire.health = Math.max(0, tire.health - wear);
    if (tire.health === 0 && tire.failure !== 'DESTROYED') {
      events.push({ kind: 'state', from: tire.failure, to: 'DESTROYED' });
      tire.failure = 'DESTROYED';
      tire.pressureKpa = 0;
    }
  }
  if (onRim(tire) && metres > 0) {
    const before = tire.rimDamage;
    tire.rimDamage = Math.min(1, tire.rimDamage + metres / 1000 * (.6 + Math.abs(speedMps) / 15));
    if (Math.floor(before * 4) !== Math.floor(tire.rimDamage * 4)) events.push({ kind: 'rim_damage', rimDamage: tire.rimDamage });
  }
  const limit = spec.recommendedMaxKph;
  if (limit !== null && Math.abs(speedMps) * 3.6 > limit && metres > 0) {
    const over = (Math.abs(speedMps) * 3.6 - limit) / limit;
    tire.health = Math.max(0, tire.health - spec.overspeedWearPerKm * metres / 1000 * (1 + 4 * over));
    events.push({ kind: 'overspeed' });
  }
  return events;
}
