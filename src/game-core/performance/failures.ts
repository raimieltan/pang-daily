import type { VehicleCondition } from '../vehicles/VehicleDefinition';
import type { PerformanceStats } from './calculator';

export const FAILURE_KINDS = ['overheating', 'clutch_slip', 'boost_leak', 'misfire', 'rough_idle', 'transmission_wear'] as const;
export type FailureKind = typeof FAILURE_KINDS[number];
type RiskDriver = 'heat' | 'clutch' | 'boost' | 'engine' | 'idle' | 'transmission';
export type FailureRule = { kind: FailureKind; driver: RiskDriver; warningAt: number; eventsPerMinute: number; message: string };
export const FAILURE_RULES: readonly FailureRule[] = [
  { kind: 'overheating', driver: 'heat', warningAt: .25, eventsPerMinute: .18, message: 'Cooling is struggling. Ease off and let it recover.' },
  { kind: 'clutch_slip', driver: 'clutch', warningAt: .15, eventsPerMinute: .3, message: 'Torque is exceeding clutch grip.' },
  { kind: 'boost_leak', driver: 'boost', warningAt: .15, eventsPerMinute: .15, message: 'Boost plumbing may be leaking under load.' },
  { kind: 'misfire', driver: 'engine', warningAt: .4, eventsPerMinute: .12, message: 'Engine condition or the tune may cause a misfire.' },
  { kind: 'rough_idle', driver: 'idle', warningAt: .4, eventsPerMinute: .15, message: 'Uneven idle. Check fueling and engine condition.' },
  { kind: 'transmission_wear', driver: 'transmission', warningAt: .2, eventsPerMinute: .12, message: 'Gearbox is working beyond its comfortable torque range.' },
];
const unit = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
export type FailureWarning = { kind: FailureKind; severity: number; message: string; probability: number };

/** Preview warning-only consequences. No random calls and no condition mutations. dt is seconds. */
export function performanceFailureRisks(stats: PerformanceStats, condition: VehicleCondition,
  load: { throttle: number; speedMps: number }, dt = 1, rules: readonly FailureRule[] = FAILURE_RULES): FailureWarning[] {
  const throttle = unit(load.throttle), engineWear = 1 - unit(condition.engine);
  const poorBuild = (1 - stats.reliability) * .3 + stats.sketchiness * .5;
  const drivers: Record<RiskDriver, number> = {
    heat: (Math.max(0, stats.heatRate / Math.max(.1, stats.coolingRate) - 1) + (1 - unit(condition.cooling ?? 1)) * .4) * (.2 + .8 * throttle),
    clutch: Math.max(0, stats.torqueNm / Math.max(1, stats.clutchCapacityNm) - 1) * throttle,
    boost: stats.boostBar * (poorBuild + engineWear * .2) * throttle,
    engine: (engineWear + poorBuild) * (.3 + .7 * throttle),
    idle: Math.abs(load.speedMps) < 2 ? engineWear + poorBuild + (stats.fuelSystem === 'carb' ? .1 : 0) : 0,
    transmission: (Math.max(0, stats.torqueNm / Math.max(1, stats.transmissionCapacityNm) - 1) + (1 - unit(condition.transmission)) * .5) * throttle,
  };
  const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  return rules.flatMap(rule => {
    const severity = unit(drivers[rule.driver]);
    if (severity <= 0 || severity < rule.warningAt) return [];
    // Poisson hazard avoids frame-rate dependent percentages; no event destroys the car.
    return [{ kind: rule.kind, severity, message: rule.message, probability: 1 - Math.exp(-Math.max(0, rule.eventsPerMinute) * severity * seconds / 60) }];
  });
}
/** The caller owns seeded randomness, cooldowns and presentation; an event is an advisory hook. */
export function samplePerformanceFailures(warnings: readonly FailureWarning[], roll: () => number): FailureWarning[] {
  return warnings.filter(warning => {
    const value = roll();
    return Number.isFinite(value) && value >= 0 && value < 1 && value < warning.probability;
  });
}
