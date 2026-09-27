import type { VehicleDefinition } from '../vehicles/VehicleDefinition';
import { PERFORMANCE_PARTS } from './catalog';
import type { EngineDefinition, FuelSystem, InstallContext, InstalledPerformancePart, InstallRequirement, PerformancePart } from './schema';

export type CompatibilityIssue = { itemId: string; partId: string; code: string; message: string };
export type ResolvedPart = { item: InstalledPerformancePart; part: PerformancePart };
export type CompatibilityState = { blockedItemIds?: readonly string[] };
const supplies = (part: PerformancePart, id: string) => part.id === id || part.satisfiesParts.includes(id);
export function stockEngine(vehicle: VehicleDefinition): EngineDefinition {
  return vehicle.engine ?? { id: `${vehicle.id}_engine`, displacementCc: vehicle.power.displacementCc, layout: 'inline_4',
    aspiration: vehicle.power.aspiration, fuelSystem: 'carb', basePowerHp: vehicle.power.peakPowerHp, baseTorqueNm: vehicle.power.peakTorqueNm,
    weightKg: 115, reliability: vehicle.reliability.baseline, heatOutput: 1 };
}
function buildState(vehicle: VehicleDefinition, active: readonly ResolvedPart[]) {
  const engine = active.find(p => p.part.engine)?.part.engine ?? stockEngine(vehicle);
  const fuelSystem: FuelSystem = active.find(p => p.part.fuelSystem)?.part.fuelSystem ?? engine.fuelSystem;
  return { engine, fuelSystem };
}
function meets(requirement: InstallRequirement, vehicle: VehicleDefinition, active: readonly ResolvedPart[], context?: InstallContext): boolean {
  const state = buildState(vehicle, active);
  switch (requirement.kind) {
    case 'has_part': return active.some(p => supplies(p.part, requirement.partId));
    case 'has_category': return requirement.category === 'engine' || requirement.category === 'fuel_system' || active.some(p => p.part.category === requirement.category);
    case 'fuel_system': return state.fuelSystem === requirement.fuelSystem;
    case 'engine_layout': return state.engine.layout === requirement.layout;
    case 'chassis_tag': return vehicle.tags.includes(requirement.tag);
    // Mechanic access applies at installation, never turns an already installed part off while driving.
    case 'mechanic_level': return !context || context.mechanicLevel >= requirement.minimum;
    case 'reputation': return !context || context.reputation >= requirement.minimum;
  }
}

/** Evaluate the whole proposed build. Invalid dependencies cascade; array order never selects a winner. */
export function checkPerformanceCompatibility(vehicle: VehicleDefinition, installed: readonly InstalledPerformancePart[],
  options: { catalog?: readonly PerformancePart[]; context?: InstallContext; state?: CompatibilityState } = {}) {
  const catalog = options.catalog ?? PERFORMANCE_PARTS;
  const issues: CompatibilityIssue[] = [];
  let active: ResolvedPart[] = [];
  const issue = (item: InstalledPerformancePart, code: string, message: string) => issues.push({ itemId: item.id, partId: item.partId, code, message });
  for (const item of installed) {
    const part = catalog.find(p => p.id === item.partId);
    if (!part) { issue(item, 'unknown_part', 'Unknown performance part.'); continue; }
    if (item.condition === null || !Number.isFinite(item.condition) || item.condition < 0 || item.condition > 1) { issue(item, 'condition', 'Actual part condition must be between zero and one.'); continue; }
    if (options.state?.blockedItemIds?.includes(item.id)) { issue(item, 'blocked', 'Installation compatibility has not been approved.'); continue; }
    active.push({ item, part });
  }
  const conflicting = active.filter(a => active.some(b => a !== b && (a.item.id === b.item.id || a.part.slot === b.part.slot || a.part.incompatibleParts.some(id => supplies(b.part, id)) || b.part.incompatibleParts.some(id => supplies(a.part, id)))));
  for (const entry of conflicting) issue(entry.item, 'conflict', 'Duplicate slot, duplicate item, or incompatible part.');
  active = active.filter(p => !conflicting.includes(p));
  // Monotonic removal also handles dependencies of a rejected engine/fuel conversion.
  for (;;) {
    const { fuelSystem } = buildState(vehicle, active);
    const rejected = active.filter(({ item, part }) => {
      const reasons: string[] = [];
      if (!part.compatibleTags.includes('universal') && !part.compatibleTags.some(tag => vehicle.tags.includes(tag))) reasons.push('Chassis tags do not match');
      for (const id of part.requiredParts) if (!active.some(p => supplies(p.part, id))) reasons.push(`Requires ${catalog.find(p => p.id === id)?.name ?? id} (used or new)`);
      for (const requirement of part.requirements) if (!meets(requirement, vehicle, active, options.context)) {
        switch (requirement.kind) {
          case 'has_part': reasons.push(`Requires ${catalog.find(p => p.id === requirement.partId)?.name ?? requirement.partId}`); break;
          case 'has_category': reasons.push(`Requires a ${requirement.category.replaceAll('_', ' ')} part`); break;
          case 'fuel_system': reasons.push(`Requires ${requirement.fuelSystem.toUpperCase()} fueling`); break;
          case 'engine_layout': reasons.push(`Requires ${requirement.layout.replaceAll('_', ' ')} engine layout`); break;
          case 'chassis_tag': reasons.push(`Requires chassis: ${requirement.tag.replaceAll('_', ' ')}`); break;
          case 'mechanic_level': reasons.push(`Requires mechanic level ${requirement.minimum}`); break;
          case 'reputation': reasons.push(`Requires reputation ${requirement.minimum}`); break;
        }
      }
      if (part.turbo && !part.turbo.supportedFuelSystems.includes(fuelSystem)) reasons.push(`Turbo does not support ${fuelSystem}`);
      if (reasons.length) issue(item, 'requirements', reasons.join('; '));
      return reasons.length > 0;
    });
    if (!rejected.length) break;
    active = active.filter(p => !rejected.includes(p));
  }
  active.sort((a, b) => a.item.id.localeCompare(b.item.id));
  return { compatible: issues.length === 0, issues, active, ...buildState(vehicle, active) };
}
