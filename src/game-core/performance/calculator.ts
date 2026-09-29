import type { VehicleCondition, VehicleDefinition } from '../vehicles/VehicleDefinition';
import { NO_MODIFIERS, PRISTINE_CONDITION, resolveVehicleStats, type StatModifiers, type VehicleStats } from '../vehicles/vehicleStats';
import { checkPerformanceCompatibility, stockEngine, type CompatibilityState } from './compatibility';
import type { InstalledPerformancePart, PerformancePart, FuelSystem, MechanicalPartEffects } from './schema';

export type PerformanceStats = VehicleStats & {
  mechanical?: MechanicalPartEffects;
  throttleResponse: number; turboLagSeconds: number; heatRate: number; coolingRate: number;
  /** Multiplier on the economy's stock liters/km. */
  fuelConsumption: number; fuelSystem: FuelSystem; tuneability: number; boostBar: number;
  clutchCapacityNm: number; transmissionCapacityNm: number; sketchiness: number;
};
export const PERFORMANCE_TUNING = {
  powerPerBar: .65, torquePerBar: .8, heatPerBar: 1.15, fuelPerBar: .65, reliabilityLossPerBar: .16,
  carbTuneability: .3, efiTuneability: .75, wornPartLoss: .3, stockClutchReserve: 1.2, stockTransmissionReserve: 1.55,
} as const;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const health = (v: number) => Number.isFinite(v) ? clamp(v, 0, 1) : 0;

/** Pure arcade composition. Body/wheel modifiers and condition are each applied exactly once. */
export function calculateVehiclePerformance(vehicle: VehicleDefinition, installed: readonly InstalledPerformancePart[] = [],
  condition: VehicleCondition = PRISTINE_CONDITION,
  options: { modifiers?: StatModifiers; compatibility?: CompatibilityState; catalog?: readonly PerformancePart[] } = {}) {
  const compatibility = checkPerformanceCompatibility(vehicle, installed, { catalog: options.catalog, state: options.compatibility });
  const { active, engine, fuelSystem } = compatibility;
  const stock = stockEngine(vehicle);
  const cleanCondition = Object.fromEntries(Object.entries(condition).map(([key, value]) => [key, health(value)])) as VehicleCondition;
  const base = resolveVehicleStats(vehicle, cleanCondition, options.modifiers ?? NO_MODIFIERS);
  const engineItem = active.find(p => p.part.category === 'engine');
  const engineHealth = engineItem ? health(engineItem.item.condition ?? 0) : 1;
  const engineFactor = 1 - (1 - engineHealth) * PERFORMANCE_TUNING.wornPartLoss;
  const stats: PerformanceStats = { ...base,
    powerHp: base.powerHp * engine.basePowerHp / vehicle.power.peakPowerHp * engineFactor,
    torqueNm: base.torqueNm * engine.baseTorqueNm / vehicle.power.peakTorqueNm * engineFactor,
    weightKg: base.weightKg + engine.weightKg - stock.weightKg,
    reliability: base.reliability * (stock.reliability > 0 ? engine.reliability / stock.reliability : 1) * engineFactor,
    throttleResponse: 1, turboLagSeconds: 0, heatRate: engine.heatOutput, coolingRate: .6 + .4 * health(condition.cooling ?? 1),
    fuelConsumption: 1, fuelSystem, tuneability: fuelSystem === 'efi' ? PERFORMANCE_TUNING.efiTuneability : PERFORMANCE_TUNING.carbTuneability,
    boostBar: 0, clutchCapacityNm: stock.baseTorqueNm * PERFORMANCE_TUNING.stockClutchReserve,
    transmissionCapacityNm: stock.baseTorqueNm * PERFORMANCE_TUNING.stockTransmissionReserve, sketchiness: 0,
  };
  let powerFraction = 0, torqueFraction = 0;
  for (const { item, part } of active) {
    const c = health(item.condition ?? 0), effect = part.effects;
    if (part.mechanical) {
      stats.mechanical = { ...stats.mechanical, ...part.mechanical,
        ...(part.mechanical.differential ? { differential: { ...part.mechanical.differential,
          lock: part.mechanical.differential.lock * c, preloadNm: part.mechanical.differential.preloadNm * c } } : {}),
      };
    }
    powerFraction += (effect.powerFraction ?? 0) * c;
    torqueFraction += (effect.torqueFraction ?? 0) * c;
    // Mass and liabilities do not vanish when a used part wears out. Benefits diminish.
    stats.weightKg += effect.weightKg ?? 0;
    for (const key of ['throttleResponse', 'turboLagSeconds', 'heatRate', 'coolingRate', 'reliability', 'fuelConsumption', 'tuneability', 'clutchCapacityNm', 'transmissionCapacityNm'] as const) {
      const delta = effect[key] ?? 0;
      const lowerIsBetter = key === 'turboLagSeconds' || key === 'heatRate' || key === 'fuelConsumption';
      stats[key] += delta * ((lowerIsBetter ? delta < 0 : delta > 0) ? c : 1);
    }
    stats.sketchiness += part.sketchiness * (1.5 - .5 * c);
    stats.reliability -= (1 - c) * .035 + part.sketchiness * .07;
    if (part.turbo) {
      stats.boostBar += part.turbo.boostBar * (.7 + .3 * c);
      stats.turboLagSeconds += part.turbo.spoolSeconds * (1 + (1 - c) * .5);
    }
  }
  stats.tuneability = clamp(stats.tuneability, 0, 1);
  const boost = stats.boostBar;
  stats.powerHp *= 1 + powerFraction + boost * PERFORMANCE_TUNING.powerPerBar * (.7 + .3 * stats.tuneability);
  stats.torqueNm *= 1 + torqueFraction + boost * PERFORMANCE_TUNING.torquePerBar;
  stats.heatRate += boost * PERFORMANCE_TUNING.heatPerBar * (1.2 - .2 * stats.tuneability);
  stats.fuelConsumption += boost * PERFORMANCE_TUNING.fuelPerBar + (1 - engineHealth) * .1;
  const partHealth = (category: string) => active.find(p => p.part.category === category)?.item.condition ?? 1;
  stats.clutchCapacityNm *= (.5 + .5 * health(condition.clutch ?? 1)) * (.5 + .5 * partHealth('clutch'));
  stats.transmissionCapacityNm *= (.6 + .4 * health(condition.transmission)) * (.6 + .4 * partHealth('transmission'));
  const heatStress = Math.max(0, stats.heatRate - stats.coolingRate);
  const torqueStress = Math.max(0, stats.torqueNm / Math.max(1, stats.clutchCapacityNm) - 1) + Math.max(0, stats.torqueNm / Math.max(1, stats.transmissionCapacityNm) - 1);
  stats.reliability = clamp(stats.reliability - boost * PERFORMANCE_TUNING.reliabilityLossPerBar * (1.2 - .4 * stats.tuneability) - heatStress * .08 - torqueStress * .07, .05, 1);
  stats.powerHp = Math.max(1, stats.powerHp); stats.torqueNm = Math.max(1, stats.torqueNm); stats.weightKg = Math.max(100, stats.weightKg);
  stats.throttleResponse = clamp(stats.throttleResponse, .2, 2); stats.turboLagSeconds = clamp(stats.turboLagSeconds, 0, 5);
  stats.heatRate = Math.max(.1, stats.heatRate); stats.coolingRate = Math.max(.1, stats.coolingRate);
  stats.fuelConsumption = clamp(stats.fuelConsumption, .25, 5); stats.sketchiness = clamp(stats.sketchiness, 0, 1);
  return { stats, compatibility };
}
