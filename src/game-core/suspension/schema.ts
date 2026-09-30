import { z } from 'zod';
export const CORNER_IDS = ['FL', 'FR', 'RL', 'RR'] as const;
export const COMPONENTS = ['spring', 'damper', 'upperControlArm', 'lowerControlArm', 'tieRod', 'knuckle', 'hub', 'topMount', 'bushing'] as const;
export type Component = typeof COMPONENTS[number];
export const DEG = Math.PI / 180;
export type Vec3 = { x: number; y: number; z: number };
const bounded = (min: number, max: number) => z.number().min(min).max(max);
const vec = z.object({ x: bounded(-.5, .5), y: bounded(-.5, .5), z: bounded(-.5, .5) });
export const cornerSetupSchema = z.object({
  rideHeight: bounded(-.12, .15), springRate: bounded(8000, 180000), preload: bounded(0, .04),
  bump: bounded(100, 18000), rebound: bounded(100, 24000), highSpeedBump: bounded(100, 18000), highSpeedRebound: bounded(100, 24000),
  camber: bounded(-10 * DEG, 3 * DEG), toe: bounded(-3 * DEG, 3 * DEG), caster: bounded(0, 15 * DEG),
  compressionTravel: bounded(.02, .3), droopTravel: bounded(.02, .25), bumpStop: bounded(.005, .06),
  unsprungMass: bounded(15, 100), trackOffset: bounded(-.03, .1),
});
export type CornerSetup = z.infer<typeof cornerSetupSchema>;
const four = <T extends z.ZodType>(schema: T) => z.tuple([schema, schema, schema, schema]);
export const suspensionSetupSchema = z.object({ corners: four(cornerSetupSchema), frontARB: bounded(0, 120000), rearARB: bounded(0, 120000),
  maxLock: bounded(20 * DEG, 65 * DEG), ackermann: bounded(0, 1), steeringRatio: bounded(8, 24) });
export type SuspensionSetup = z.infer<typeof suspensionSetupSchema>;
export const deformationSchema = z.object({ camber: bounded(-.4, .4), toe: bounded(-.3, .3), caster: bounded(-.3, .3), position: vec,
  rideHeight: bounded(-.15, .02), travelReduction: bounded(0, .15), steeringCenter: bounded(-.2, .2) });
const damageSchema = z.object({ health: z.record(z.enum(COMPONENTS), bounded(0, 1)), deformation: deformationSchema, fatigue: bounded(0, 1) });
export type CornerDamage = z.infer<typeof damageSchema>;
const alignmentSchema = z.object({ camber: bounded(-.2, .2), toe: bounded(-.2, .2), caster: bounded(-.2, .2) });
export const PART_IDS = ['stock', 'lowering', 'street', 'track', 'race', 'rally', 'drift'] as const;
export type PartId = typeof PART_IDS[number];
export const suspensionSaveSchema = z.object({ version: z.literal(1), part: z.enum(PART_IDS), setup: suspensionSetupSchema,
  damage: four(damageSchema), alignment: four(alignmentSchema), presets: z.record(z.string().min(1).max(32), z.object({ part: z.enum(PART_IDS), setup: suspensionSetupSchema })).default({}) });
export type SavedSuspension = z.infer<typeof suspensionSaveSchema>;
export interface SuspensionBaseline { mass: number; frontWeight: number; wheelbase: number; track: number; cgHeight: number; frontSpring: number; rearSpring: number;
  radius?: number; frontARB?: number; rearARB?: number; damping?: number; camber?: number; toe?: number; caster?: number; maxLock?: number }
export function healthyDamage(): CornerDamage { return { health: Object.fromEntries(COMPONENTS.map(c => [c, 1])) as CornerDamage['health'],
  deformation: { camber: 0, toe: 0, caster: 0, position: { x: 0, y: 0, z: 0 }, rideHeight: 0, travelReduction: 0, steeringCenter: 0 }, fatigue: 0 }; }
export function createSuspension(b: SuspensionBaseline, height = 0): SavedSuspension {
  const corners = CORNER_IDS.map((_, i): CornerSetup => { const front = i < 2, mass = b.mass * (front ? b.frontWeight : 1 - b.frontWeight) / 2;
    const rate = front ? b.frontSpring : b.rearSpring, damping = 2 * Math.sqrt(rate * Math.max(100, mass - 35)) * (b.damping ?? .6);
    return { rideHeight: height, springRate: rate, preload: 0, bump: damping * .65, rebound: damping, highSpeedBump: damping * .4, highSpeedRebound: damping * .65,
      camber: b.camber ?? (front ? -1 : -.8) * DEG, toe: b.toe ?? (front ? .03 : .12) * DEG, caster: front ? b.caster ?? 6 * DEG : 0,
      compressionTravel: .09, droopTravel: .06, bumpStop: .02, unsprungMass: 35, trackOffset: 0 };
  }) as SuspensionSetup['corners'];
  return { version: 1, part: 'stock', setup: { corners, frontARB: b.frontARB ?? 10000, rearARB: b.rearARB ?? 7000,
    maxLock: b.maxLock ?? 34 * DEG, ackermann: .75, steeringRatio: 16 }, damage: [healthyDamage(), healthyDamage(), healthyDamage(), healthyDamage()],
    alignment: Array.from({length: 4}, () => ({ camber: 0, toe: 0, caster: 0 })) as SavedSuspension['alignment'], presets: {} };
}
