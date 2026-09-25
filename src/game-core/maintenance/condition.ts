import type { ConditionComponent, VehicleCondition, VehicleDefinition } from '../vehicles/VehicleDefinition';

/** The slice services five systems; body/electrical remain compatible with the vehicle schema. */
export const SERVICE_COMPONENTS = ['engine', 'transmission', 'brakes', 'suspension', 'tires'] as const satisfies readonly ConditionComponent[];
export type ServiceComponent = typeof SERVICE_COMPONENTS[number];
export type ConditionLoss = Record<ServiceComponent, number>;
export const SERVICE_RULES: Record<ServiceComponent, { label: string; fullRepairPhp: number; wearPerKm: number; impactLoss: number; symptom: string }> = {
  engine: { label: 'Engine', fullRepairPhp: 6000, wearPerKm: .008, impactLoss: .045, symptom: 'Less pull under acceleration' },
  transmission: { label: 'Transmission', fullRepairPhp: 4500, wearPerKm: .006, impactLoss: .025, symptom: 'Power lost through the drivetrain' },
  brakes: { label: 'Brakes', fullRepairPhp: 1800, wearPerKm: .01, impactLoss: .035, symptom: 'Longer stopping distances' },
  suspension: { label: 'Suspension', fullRepairPhp: 3000, wearPerKm: .008, impactLoss: .15, symptom: 'Less grip through corners' },
  tires: { label: 'Tires', fullRepairPhp: 2200, wearPerKm: .018, impactLoss: .09, symptom: 'Less grip when braking and turning' },
};
export const emptyLoss = (): ConditionLoss => ({ engine: 0, transmission: 0, brakes: 0, suspension: 0, tires: 0 });
export type WearSample = { speedMps: number; throttle: number; brake: number; slip: number; handbrake: number; grounded: boolean; racing: boolean };
const unit = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

/** Deliberately arcade rates: distance + load, no idling tax, no component simulation. */
export function drivingWear(sample: WearSample, dt: number, wearRate = 1): ConditionLoss {
  const loss = emptyLoss();
  if (!sample.grounded || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(sample.speedMps) || Math.abs(sample.speedMps) < 1) return loss;
  const km = Math.abs(sample.speedMps) * dt / 1000;
  const scale = km * (sample.racing ? 1.5 : 1) * (Number.isFinite(wearRate) ? Math.max(0, wearRate) : 1);
  const throttle = unit(sample.throttle), brake = unit(sample.brake), slip = unit(sample.slip), handbrake = unit(sample.handbrake);
  const load: ConditionLoss = { engine: 1 + throttle * 1.5, transmission: 1 + throttle,
    brakes: .35 + brake * 4, suspension: 1 + slip, tires: 1 + slip * 3 + handbrake * 4 + brake };
  for (const key of SERVICE_COMPONENTS) loss[key] = SERVICE_RULES[key].wearPerKm * scale * load[key];
  return loss;
}
export function impactWear(strength: number): ConditionLoss {
  const loss = emptyLoss();
  for (const key of SERVICE_COMPONENTS) loss[key] = SERVICE_RULES[key].impactLoss * unit(strength);
  return loss;
}
export function applyConditionLoss(condition: VehicleCondition, loss: ConditionLoss): VehicleCondition {
  const next = { ...condition };
  for (const key of SERVICE_COMPONENTS) next[key] = Math.max(0, condition[key] - unit(loss[key]));
  return next;
}
export type RepairLine = { component: ServiceComponent; label: string; condition: number; costPhp: number; symptom: string };
export function repairLines(definition: VehicleDefinition, condition: VehicleCondition): RepairLine[] {
  // Ordinary locally available parts keep this old daily relatively affordable.
  const partsFactor = 1 + (1 - definition.market.partsAvailability) * .3;
  return SERVICE_COMPONENTS.map(component => {
    const rule = SERVICE_RULES[component];
    const costPhp = condition[component] >= 1 ? 0 : Math.ceil((1 - condition[component]) * rule.fullRepairPhp * partsFactor / 10) * 10;
    return { component, label: rule.label, condition: condition[component], costPhp, symptom: rule.symptom };
  });
}
