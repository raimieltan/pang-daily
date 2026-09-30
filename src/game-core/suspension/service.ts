import { COMPONENTS, DEG, createSuspension, type SavedSuspension, type Component, type PartId, type SuspensionBaseline, type SuspensionSetup } from './schema';
import { SUSPENSION_PARTS } from './parts';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function damageCorner(saved: SavedSuspension, index: number, energy: number, direction: number): void {
  const d = saved.damage[index]; if (!d || !Number.isFinite(energy) || energy <= 0) return;
  const strength = SUSPENSION_PARTS[saved.part].strength;
  const stress = Math.max(0, energy / strength - .35);
  if (!stress) return;
  const loss = Math.min(.7, stress * .15), sign = direction < 0 ? -1 : 1;
  d.fatigue = clamp(d.fatigue + loss * .05, 0, 1);
  for (const key of COMPONENTS) d.health[key] = clamp(d.health[key] - loss * (key === 'tieRod' ? 1.5 : key === 'spring' ? .4 : 1), 0, 1);
  const f = d.deformation;
  // Toe is semantic (positive = inward on either side): impacts bend it outward on both sides.
  // Steering centre and position are vehicle-frame, so they take the struck side's sign.
  f.toe = clamp(f.toe - loss * .12, -.3, .3); f.camber = clamp(f.camber - loss * .08, -.4, .4);
  f.caster = clamp(f.caster - loss * .03, -.3, .3); f.position.z = clamp(f.position.z - loss * .04, -.3, .3);
  f.position.x = clamp(f.position.x + sign * loss * .012, -.2, .2);
  f.rideHeight = clamp(f.rideHeight - loss * .015, -.15, 0); f.travelReduction = clamp(f.travelReduction + loss * .015, 0, .15);
  f.steeringCenter = clamp(f.steeringCenter + sign * loss * .025, -.2, .2);
  // Service adjustment drifts independently; replacing a component does not perform alignment.
  saved.alignment[index].toe = clamp(saved.alignment[index].toe - loss * .003, -.2, .2);
}
export function repairComponent(s: SavedSuspension, index: number, component: Component): void {
  const d = s.damage[index]; d.health[component] = 1;
  const f = d.deformation;
  if (component === 'tieRod') { f.toe = 0; f.steeringCenter = 0; }
  if (component === 'lowerControlArm' || component === 'upperControlArm' || component === 'knuckle') {
    if (['lowerControlArm', 'upperControlArm', 'knuckle'].every(c => d.health[c as Component] > .95)) { f.camber = 0; f.caster = 0; f.position = { x: 0, y: 0, z: 0 }; f.travelReduction = 0; }
  }
  if (component === 'spring' || component === 'topMount') {
    if (d.health.spring > .95 && d.health.topMount > .95) f.rideHeight = 0;
  }
}
export function alignCorner(s: SavedSuspension, index: number): { rejected: string } | undefined {
  const d = s.damage[index], f = d.deformation;
  const bent = Math.abs(f.toe) > .3 * DEG || Math.abs(f.camber) > .5 * DEG || Math.abs(f.caster) > .5 * DEG;
  if (bent) return { rejected: `CANNOT REACH TARGET — replace bent ${['FL', 'FR', 'RL', 'RR'][index]} ${d.health.tieRod < .95 ? 'tie rod' : 'control arm / knuckle'} first.` };
  s.alignment[index] = { camber: -f.camber, toe: -f.toe, caster: -f.caster };
}
export function installPart(s: SavedSuspension, id: PartId, baseline?: SuspensionBaseline): void {
  const previous = SUSPENSION_PARTS[s.part], next = SUSPENSION_PARTS[id];
  const factory = baseline ? createSuspension(baseline) : null;
  s.setup.corners.forEach((c, i) => {
    const rate = factory?.setup.corners[i].springRate ?? c.springRate / previous.springScale;
    c.springRate = clamp(rate * next.springScale, 8000, 180000); c.rideHeight = next.height; c.compressionTravel = next.travel; c.droopTravel = next.droop;
    c.unsprungMass = next.mass;
    if (id !== 'lowering') { const ratio = Math.sqrt(next.springScale / previous.springScale); c.bump *= ratio; c.rebound *= ratio; c.highSpeedBump *= ratio; c.highSpeedRebound *= ratio; }
    for (const [key, range] of Object.entries(next.ranges)) if (range) c[key as keyof typeof c] = clamp(c[key as keyof typeof c], range[0], range[1]);
  });
  s.part = id; s.setup.maxLock = next.maxLock; s.setup.ackermann = next.ackermann;
}
export function validateSetup(s: SavedSuspension, setup: SuspensionSetup): string | null {
  const part = SUSPENSION_PARTS[s.part];
  for (let i = 0; i < 4; i++) for (const key of Object.keys(setup.corners[i]) as (keyof SuspensionSetup['corners'][number])[]) {
    const value = setup.corners[i][key], current = s.setup.corners[i][key]; if (value === current) continue;
    const range = part.ranges[key];
    if (!range) return `${part.name} does not support ${key} adjustment.`;
    if (value < range[0] - 1e-8 || value > range[1] + 1e-8) return `${key} is outside the installed part's adjustment range.`;
  }
  if (setup.maxLock > part.maxLock) return 'Install a compatible steering angle kit for this lock.';
  return null;
}
export const PRESET_NAMES = ['Stock', 'Street', 'Touge', 'Track', 'Wet', 'Drift', 'Rally', 'Drag', 'Custom'] as const;

export function presetSetup(s: SavedSuspension, name: string, baseline: SuspensionBaseline): void {
  if (s.presets[name]) { s.part = s.presets[name].part; s.setup = structuredClone(s.presets[name].setup); return; }
  if (name === 'Stock') { const stock = createSuspension(baseline); s.part = stock.part; s.setup = stock.setup; return; }
  const part = name === 'Rally' ? 'rally' : name === 'Drift' ? 'drift' : name === 'Track' ? 'track' : 'street';
  installPart(s, part, baseline);
  if (name === 'Wet') { s.setup.frontARB *= .65; s.setup.rearARB *= .65; s.setup.corners.forEach(c => { c.springRate *= .8; }); }
  if (name === 'Touge') { s.setup.rearARB *= 1.3; }
  if (name === 'Drag') { s.setup.corners.forEach((c, i) => { c.camber = -.3 * DEG; if (i > 1) c.springRate *= .7; }); }
}
