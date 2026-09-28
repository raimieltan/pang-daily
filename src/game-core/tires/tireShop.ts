import { CORNER_IDS, type CornerId } from './corners';
import { newAssembly, pressureRatio, type TireAssembly } from './assembly';
import { TIRE_SPECS } from './specs';
import { CORNER_NAMES, type TireSession } from './TireSession';

/** Talyer prices, PHP. Arcade numbers sized against early job pay. */
export const TIRE_PRICES = {
  air: 20, patch: 150, roadTire: 1800, rimStraighten: 450, rimReplace: 1600, donut: 1500, jack: 900, wrench: 250,
} as const;
/** A leak on a tire this worn can't be plugged; the carcass is gone. */
const PATCHABLE_HEALTH = .6;
/** Past this, a rim can't be hammered true. */
const STRAIGHTENABLE_RIM = .5;

export type TireServiceKind = 'air' | 'patch' | 'tire' | 'rim' | 'spare' | 'jack' | 'wrench';
export type TireServiceLine = { id: string; kind: TireServiceKind; label: string; detail: string; costPhp: number };

/** Every assembly the car owns, with where it sits, for pricing. */
function owned(tires: TireSession, vehicleId: string): { tire: TireAssembly; where: string }[] {
  const car = tires.vehicle(vehicleId);
  const list: { tire: TireAssembly; where: string }[] = [];
  for (const corner of CORNER_IDS) {
    const tire = tires.assembly(car.corners[corner]);
    if (tire) list.push({ tire, where: CORNER_NAMES[corner] });
  }
  const spare = tires.assembly(car.spare);
  if (spare) list.push({ tire: spare, where: 'spare well' });
  for (const id of car.trunk) { const tire = tires.assembly(id); if (tire) list.push({ tire, where: 'trunk' }); }
  const held = tires.assembly(car.held);
  if (held) list.push({ tire: held, where: 'in hand' });
  return list;
}

/** What the talyer can do for this car right now. Empty = nothing needed. */
export function tireServiceLines(tires: TireSession, vehicleId: string): TireServiceLine[] {
  const car = tires.vehicle(vehicleId);
  const lines: TireServiceLine[] = [];
  for (const { tire, where } of owned(tires, vehicleId)) {
    const spec = TIRE_SPECS[tire.spec];
    const name = `${spec.label} (${where})`;
    const leaking = tire.failure === 'SLOW_LEAK' || tire.failure === 'RAPID_LEAK';
    if (tire.failure === 'HEALTHY' && pressureRatio(tire) < .97) {
      lines.push({ id: `air:${tire.id}`, kind: 'air', label: `Top up ${name}`, detail: `${Math.round(tire.pressureKpa)} → ${spec.nominalKpa} kPa`, costPhp: TIRE_PRICES.air });
    }
    if (leaking && tire.health >= PATCHABLE_HEALTH) {
      lines.push({ id: `patch:${tire.id}`, kind: 'patch', label: `Plug the leak: ${name}`, detail: 'Plug and reinflate', costPhp: TIRE_PRICES.patch });
    }
    if (tire.spec === 'standard' && (tire.failure !== 'HEALTHY' || tire.health < .5)) {
      lines.push({ id: `tire:${tire.id}`, kind: 'tire', label: `New road tire: ${name}`, detail: 'Fresh rubber on the same rim', costPhp: TIRE_PRICES.roadTire });
    }
    if (tire.spec === 'donut' && tire.failure !== 'HEALTHY') {
      lines.push({ id: `tire:${tire.id}`, kind: 'tire', label: `New spare tire: ${name}`, detail: 'Fresh space-saver rubber', costPhp: TIRE_PRICES.donut });
    }
    if (tire.rimDamage > 0) {
      const straighten = tire.rimDamage <= STRAIGHTENABLE_RIM;
      lines.push({ id: `rim:${tire.id}`, kind: 'rim', label: `${straighten ? 'Straighten' : 'Replace'} rim: ${name}`,
        detail: `${Math.round(tire.rimDamage * 100)}% bent`, costPhp: straighten ? TIRE_PRICES.rimStraighten : TIRE_PRICES.rimReplace });
    }
  }
  // A donut on a hub: swap a new road tire onto that corner and put the donut back in the well.
  for (const corner of CORNER_IDS) {
    const tire = tires.assembly(car.corners[corner]);
    if (tire?.spec === 'donut') lines.push({ id: `fit:${corner}`, kind: 'tire', label: `Fit a road tire on the ${CORNER_NAMES[corner]}`,
      detail: 'Donut goes back in the spare well', costPhp: TIRE_PRICES.roadTire });
  }
  if (!car.spare && !owned(tires, vehicleId).some(o => o.tire.spec === 'donut'))
    lines.push({ id: 'spare', kind: 'spare', label: 'Buy a space-saver spare', detail: 'Goes in the spare well', costPhp: TIRE_PRICES.donut });
  if (!car.jack) lines.push({ id: 'jack', kind: 'jack', label: 'Buy a scissor jack', detail: 'Kept in the trunk', costPhp: TIRE_PRICES.jack });
  if (!car.wrench) lines.push({ id: 'wrench', kind: 'wrench', label: 'Buy a lug wrench', detail: 'Kept in the trunk', costPhp: TIRE_PRICES.wrench });
  return lines;
}

/**
 * Does one priced line. `pay` charges the wallet and returns a rejection or nothing; it runs
 * after the line is validated and before anything changes, so a refused payment changes nothing.
 */
export function applyTireService(tires: TireSession, vehicleId: string, lineId: string, pay: (line: TireServiceLine) => { rejected: string } | void) {
  const line = tireServiceLines(tires, vehicleId).find(l => l.id === lineId);
  if (!line) return { rejected: 'That service is no longer needed' };
  const car = tires.vehicle(vehicleId);
  if (car.jacked || car.loosened.length || car.held) return { rejected: 'Finish the roadside wheel change first' };
  const paid = pay(line);
  if (paid) return paid;
  const [op, ref] = lineId.split(':');
  tires.mutate(vehicleId, c => {
    const tire = tires.assembly(ref ?? null);
    const fresh = (t: TireAssembly) => Object.assign(t, { pressureKpa: TIRE_SPECS[t.spec].nominalKpa, health: 1, failure: 'HEALTHY', leakKpaPerMin: 0, flatDistanceM: 0 });
    if (op === 'air' && tire) tire.pressureKpa = TIRE_SPECS[tire.spec].nominalKpa;
    if (op === 'patch' && tire) Object.assign(tire, { failure: 'HEALTHY', leakKpaPerMin: 0, pressureKpa: TIRE_SPECS[tire.spec].nominalKpa });
    if (op === 'tire' && tire) fresh(tire);
    if (op === 'rim' && tire) tire.rimDamage = 0;
    if (op === 'fit') {
      const corner = ref as CornerId;
      const donut = c.corners[corner]!;
      const road = newAssembly(tires.nextAssemblyId(), 'standard');
      tires.adopt(road);
      c.corners[corner] = road.id;
      if (!c.spare) c.spare = donut; else c.trunk.push(donut);
    }
    if (op === 'spare') { const donut = newAssembly(tires.nextAssemblyId(), 'donut'); tires.adopt(donut); c.spare = donut.id; }
    if (op === 'jack') c.jack = true;
    if (op === 'wrench') c.wrench = true;
  });
  return { line };
}
