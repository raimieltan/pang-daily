import type { InventoryItem, InventorySession } from '../inventory/InventorySession';
import { InventorySession as Inventory } from '../inventory/InventorySession';
import type { VehicleCondition, VehicleDefinition } from '../vehicles/VehicleDefinition';
import { combineModifiers } from '../vehicles/vehicleStats';
import { wheelPart, wheelModifiers } from '../wheels';
import { bodyPart, exteriorEffects, resolveBodyPartLook } from '../exterior';
import { partDefinition } from '../parts/parts';
import { performancePart } from './catalog';
import { calculateVehiclePerformance, type PerformanceStats } from './calculator';
import { performanceFailureRisks } from './failures';
import type { InstallContext, PerformanceCategory } from './schema';

export const TALYER_PERFORMANCE = { mechanicLevel: 2, reputation: 0 } satisfies InstallContext;
/** Labor only; parts must already be owned. Whole PHP, tunable independently of sale prices. */
export const PERFORMANCE_LABOR_PHP: Record<PerformanceCategory, number> = {
  engine: 3500, fuel_system: 1800, intake: 250, exhaust: 600, turbo: 2500,
  cooling: 650, ecu: 800, clutch: 1500, transmission: 2500, differential: 1800, supporting_mod: 350,
};
export type PerformanceOperation = 'install' | 'remove';
export type PerformancePreview = {
  itemId: string; name: string; operation: PerformanceOperation; laborPhp: number;
  before: PerformanceStats; after: PerformanceStats; warnings: string[]; displaced: string[];
};
export function installedPerformanceItems(inventory: InventorySession, vehicleId: string): InventoryItem[] {
  const ids = new Set(Object.values(inventory.installedOn(vehicleId)));
  return inventory.items().filter(item => ids.has(item.id) && performancePart(item.partId));
}

/** Recompute visual modifiers for each proposed inventory, including displaced exhaust/body parts. */
function visualModifiers(inventory: InventorySession, vehicle: VehicleDefinition) {
  const slots = inventory.installedOn(vehicle.id);
  const wheel = slots.wheels ? inventory.item(slots.wheels) : undefined;
  const wheels = wheelModifiers(vehicle, wheel ? wheelPart(wheel.partId) ?? null : null, wheel?.condition ?? 1);
  const ids = new Set(Object.values(slots));
  const body = inventory.items().flatMap(item => {
    const part = ids.has(item.id) ? bodyPart(item.partId) : undefined;
    return part ? [{ part, look: resolveBodyPartLook(part, { condition: item.condition, finish: item.finish,
      bodyColor: inventory.appearance(vehicle.id)?.paint ?? vehicle.visual.defaultPaint, vehicleTags: vehicle.tags }) }] : [];
  });
  return combineModifiers(wheels, exteriorEffects(body).modifiers);
}

/** Dry run against an isolated inventory. No money, mutations or hidden-condition preview. */
export function previewPerformanceInstall(inventory: InventorySession, vehicle: VehicleDefinition, condition: VehicleCondition,
  itemId: string, operation: PerformanceOperation, context: InstallContext): PerformancePreview | { rejected: string } {
  const item = inventory.item(itemId), part = item && performancePart(item.partId);
  if (!item || !part) return { rejected: 'Choose an owned performance part.' };
  if (operation !== 'install' && operation !== 'remove') return { rejected: 'Choose install or remove.' };
  if (!item.revealedBy) return { rejected: 'Have Mang Boy inspect this used part before quoting the work.' };
  const next = new Inventory(inventory.snapshot());
  if (operation === 'remove' && next.installation(itemId)?.vehicleId !== vehicle.id) return { rejected: 'That part is not on this car.' };
  const result = operation === 'install' ? next.install(vehicle.id, itemId, { ...context, vehicle }) : next.uninstall(itemId);
  if ('rejected' in result) return result;
  const before = calculateVehiclePerformance(vehicle, installedPerformanceItems(inventory, vehicle.id), condition, { modifiers: visualModifiers(inventory, vehicle) });
  const after = calculateVehiclePerformance(vehicle, installedPerformanceItems(next, vehicle.id), condition, { modifiers: visualModifiers(next, vehicle) });
  if (!after.compatibility.compatible) return { rejected: after.compatibility.issues.map(issue => issue.message).join('; ') };
  const warnings = performanceFailureRisks(after.stats, condition, { throttle: 1, speedMps: 20 }, 60).map(w => w.message);
  return { itemId, name: part.name, operation, laborPhp: operation === 'remove' ? Math.ceil(PERFORMANCE_LABOR_PHP[part.category] / 2) : PERFORMANCE_LABOR_PHP[part.category],
    before: before.stats, after: after.stats, warnings,
    displaced: 'displaced' in result ? result.displaced.map(id => {
      const old = inventory.item(id); return (old && partDefinition(old.partId)?.name) ?? 'Previously fitted part';
    }) : [],
  };
}
