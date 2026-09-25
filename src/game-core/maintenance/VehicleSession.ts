import { z } from 'zod';
import { vehicleConditionSchema, type VehicleCondition, type VehicleDefinition } from '../vehicles/VehicleDefinition';
import { applyConditionLoss, repairLines, SERVICE_COMPONENTS, type ConditionLoss, type RepairLine, type ServiceComponent } from './condition';

export const STARTING_WALLET_PHP = 5000;
const ownedSchema = z.object({ condition: vehicleConditionSchema, revision: z.number().int().nonnegative() });
const transactionSchema = z.object({ id: z.number().int().positive(), kind: z.enum(['starting_cash', 'repair']),
  amountPhp: z.number().int(), balancePhp: z.number().int().nonnegative(), vehicleId: z.string().nullable(), components: z.array(z.enum(SERVICE_COMPONENTS)) });
const sessionSchema = z.object({ version: z.literal(1), walletPhp: z.number().int().nonnegative(),
  vehicles: z.record(z.string(), ownedSchema), transactions: z.array(transactionSchema) });
export type SessionSnapshot = z.infer<typeof sessionSchema>;
export type RepairQuote = { id: string; vehicleId: string; vehicleName: string; revision: number; lines: RepairLine[]; totalPhp: number };
export type MaintenanceSummary = { vehicleId: string; vehicleName: string; condition: VehicleCondition; walletPhp: number };
export type RepairReceipt = { vehicleId: string; components: ServiceComponent[]; costPhp: number; walletPhp: number };

/** Session authority: economy and owned-car data outlive every Babylon scene. */
export class VehicleSession {
  private state: SessionSnapshot;
  private quoteSerial = 0;
  private readonly listeners = new Set<() => void>();
  constructor(saved?: unknown, private readonly persist?: (snapshot: SessionSnapshot) => void) {
    const parsed = sessionSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, walletPhp: STARTING_WALLET_PHP, vehicles: {},
      transactions: [{ id: 1, kind: 'starting_cash', amountPhp: STARTING_WALLET_PHP, balancePhp: STARTING_WALLET_PHP, vehicleId: null, components: [] }] };
  }
  snapshot(): SessionSnapshot { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  ensureVehicle(definition: VehicleDefinition) {
    if (this.state.vehicles[definition.id]) return;
    this.state.vehicles[definition.id] = { condition: { ...definition.condition.typical }, revision: 0 };
    this.changed();
  }
  summary(definition: VehicleDefinition): MaintenanceSummary {
    this.ensureVehicle(definition);
    return { vehicleId: definition.id, vehicleName: `${definition.identity.make} ${definition.identity.model}`,
      condition: { ...this.state.vehicles[definition.id].condition }, walletPhp: this.state.walletPhp };
  }
  wear(definition: VehicleDefinition, loss: ConditionLoss) {
    this.ensureVehicle(definition);
    const car = this.state.vehicles[definition.id], next = applyConditionLoss(car.condition, loss);
    if (SERVICE_COMPONENTS.every(key => next[key] === car.condition[key])) return;
    car.condition = next; car.revision++; this.changed();
  }
  quote(definition: VehicleDefinition): RepairQuote {
    const summary = this.summary(definition), car = this.state.vehicles[definition.id];
    const lines = repairLines(definition, car.condition);
    return { id: `repair-${++this.quoteSerial}`, vehicleId: definition.id, vehicleName: summary.vehicleName,
      revision: car.revision, lines, totalPhp: lines.reduce((sum, line) => sum + line.costPhp, 0) };
  }
  repair(definition: VehicleDefinition, quote: RepairQuote, selected: readonly ServiceComponent[]): RepairReceipt | { rejected: string } {
    const car = this.state.vehicles[definition.id];
    if (!car || quote.vehicleId !== definition.id || quote.revision !== car.revision) return { rejected: 'Condition changed. Ask Mang Boy for a new inspection.' };
    if (!Array.isArray(selected) || selected.length === 0 || selected.some(key => !SERVICE_COMPONENTS.includes(key))) return { rejected: 'Choose at least one repair.' };
    const components = [...new Set<ServiceComponent>(selected)];
    // Reprice from authoritative state, never from the UI or a saved quote's line totals.
    const lines = repairLines(definition, car.condition).filter(line => components.includes(line.component));
    if (lines.some(line => line.costPhp === 0)) return { rejected: 'That component is already fully repaired.' };
    const costPhp = lines.reduce((sum, line) => sum + line.costPhp, 0);
    if (costPhp > this.state.walletPhp) return { rejected: 'Not enough money. Select fewer repairs.' };
    const condition = { ...car.condition };
    for (const key of components) condition[key] = 1;
    // A single synchronous commit prevents duplicate payment and partially applied repairs.
    car.condition = condition; car.revision++; this.state.walletPhp -= costPhp;
    this.state.transactions.push({ id: this.state.transactions.length + 1, kind: 'repair', amountPhp: -costPhp,
      balancePhp: this.state.walletPhp, vehicleId: definition.id, components });
    const receipt = { vehicleId: definition.id, components, costPhp, walletPhp: this.state.walletPhp };
    this.changed(); return receipt;
  }
  private changed() {
    try { this.persist?.(this.snapshot()); } catch { /* Storage failures must not undo a valid in-memory transaction. */ }
    this.listeners.forEach(listener => listener());
  }
}
