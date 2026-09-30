import { DEG, type PartId, type CornerSetup } from './schema';
export type Range = readonly [number, number];
export interface SuspensionPart { id: PartId; name: string; description: string; strength: number; mass: number;
  ranges: Partial<Record<keyof CornerSetup, Range>>; springScale: number; height: number; travel: number; droop: number; maxLock: number; ackermann: number;
  geometry: 'strut' | 'wishbone' | 'multilink' | 'trailing'; motionRatio: number }
const stock = { rideHeight: [-.02, .025], camber: [-1.5 * DEG, -.5 * DEG], toe: [-.3 * DEG, .3 * DEG], caster: [4 * DEG, 8 * DEG] } as const;
const adjustable = { rideHeight: [-.1, .08], springRate: [8000, 180000], preload: [0, .04], bump: [100, 18000], rebound: [100, 24000],
  highSpeedBump: [100, 18000], highSpeedRebound: [100, 24000], camber: [-10 * DEG, 3 * DEG], toe: [-3 * DEG, 3 * DEG], caster: [0, 15 * DEG],
  bumpStop: [.005, .06], trackOffset: [-.03, .1] } as const;
const part = (id: PartId, name: string, description: string, patch: Partial<SuspensionPart>): SuspensionPart => ({ id, name, description, strength: 1800, mass: 35,
  ranges: stock, springScale: 1, height: 0, travel: .09, droop: .06, maxLock: 34 * DEG, ackermann: .75, geometry: 'strut', motionRatio: 1, ...patch });
export const SUSPENSION_PARTS: Record<PartId, SuspensionPart> = {
  stock: part('stock', 'Factory suspension', 'Factory springs and dampers; limited alignment adjustment.', {}),
  lowering: part('lowering', 'Lowering springs', 'Shorter, firmer springs retain factory damping.', { springScale: 1.4, height: -.035, ranges: { ...stock, rideHeight: [-.04, -.03] } }),
  street: part('street', 'Street coilovers', 'Height, spring preload, damping and camber plates.', { springScale: 1.4, height: -.025, strength: 2200, ranges: { ...adjustable, highSpeedBump: undefined, highSpeedRebound: undefined }, geometry: 'strut' }),
  track: part('track', 'Track coilovers + arms', 'Independent spring, compression, rebound and alignment adjustment.', { springScale: 2, height: -.035, strength: 2600, ranges: adjustable, geometry: 'wishbone' }),
  race: part('race', 'Race four-way coilovers', 'Low/high-speed damping and independent corner balancing.', { springScale: 2.6, height: -.04, strength: 3000, ranges: adjustable, geometry: 'multilink' }),
  rally: part('rally', 'Long-travel rally kit', 'Long droop, reinforced arms and digressive impact damping.', { springScale: .8, height: .07, travel: .2, droop: .15, strength: 4200, mass: 40, ranges: { ...adjustable, rideHeight: [0, .15] }, geometry: 'trailing' }),
  drift: part('drift', 'Drift coilovers + angle kit', 'Corrected tie rods, wider track and 62° lock.', { springScale: 1.9, height: -.03, strength: 2800, maxLock: 62 * DEG, ackermann: .35, ranges: adjustable, geometry: 'wishbone' }),
};
export type Curve = readonly (readonly [number, number])[];
export function curveAt(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (x <= curve[i][0]) { const a = curve[i - 1], b = curve[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return curve[curve.length - 1][1];
}
export const GEOMETRY = {
  strut: { camber: [[-.15, 1.3 * DEG], [0, 0], [.2, -2.8 * DEG]], toe: [[-.15, -.25 * DEG], [0, 0], [.2, .4 * DEG]], track: [[-.15, -.008], [0, 0], [.2, -.008]] },
  wishbone: { camber: [[-.15, 2 * DEG], [0, 0], [.2, -5 * DEG]], toe: [[-.15, -.08 * DEG], [0, 0], [.2, .1 * DEG]], track: [[-.15, -.006], [0, 0], [.2, -.01]] },
  multilink: { camber: [[-.15, 1.6 * DEG], [0, 0], [.2, -3.5 * DEG]], toe: [[-.15, -.15 * DEG], [0, 0], [.2, .3 * DEG]], track: [[-.15, -.004], [0, 0], [.2, -.006]] },
  trailing: { camber: [[-.2, .8 * DEG], [0, 0], [.3, -1.2 * DEG]], toe: [[-.2, -.1 * DEG], [0, 0], [.3, .2 * DEG]], track: [[-.2, -.01], [0, 0], [.3, -.015]] },
} satisfies Record<string, { camber: Curve; toe: Curve; track: Curve }>;
