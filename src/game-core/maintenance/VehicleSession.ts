import { centavos, moneySchema, transactionSchema, quoteFuel, FUEL_CAPACITY_LITERS, MAINTENANCE_SERVICES, type MoneySource, type FuelRequest, type MaintenanceService } from '../economy/economy';
import { z } from 'zod';
import { vehicleConditionSchema, type VehicleCondition, type VehicleDefinition } from '../vehicles/VehicleDefinition';
import { applyConditionLoss, repairLines, SERVICE_COMPONENTS, type ConditionLoss, type RepairLine, type ServiceComponent } from './condition';

export const STARTING_WALLET_PHP = 5000;
const ownedSchema = z.object({ condition: vehicleConditionSchema, revision: z.number().int().nonnegative(), fuelLiters: z.number().min(0).max(FUEL_CAPACITY_LITERS) });
const sessionSchema = z.object({ version: z.literal(2), walletPhp: moneySchema,
  vehicles: z.record(z.string(), ownedSchema), transactions: z.array(transactionSchema) }).refine(state => {
    try {
      let balance = 0, id = 0;
      for (const tx of state.transactions) {
        if (tx.id <= id || centavos(tx.balanceBeforePhp) !== balance || balance + centavos(tx.amountPhp) !== centavos(tx.balancePhp)) return false;
        balance = centavos(tx.balancePhp); id = tx.id;
      }
      return balance === centavos(state.walletPhp);
    } catch { return false; }
  });

/** Legacy timestamps were not recorded; use an explicit epoch rather than inventing history. */
function migrateSession(saved: unknown): unknown {
  if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1) return saved;
  const legacy = z.object({ version: z.literal(1), walletPhp: moneySchema,
    vehicles: z.record(z.string(), z.object({ condition: vehicleConditionSchema, revision: z.number().int().nonnegative() })),
    transactions: z.array(z.object({ id: z.number().int().positive(), kind: z.enum(['starting_cash', 'repair']), amountPhp: z.number().int(), balancePhp: moneySchema, vehicleId: z.string().nullable(), components: z.array(z.enum(SERVICE_COMPONENTS)) })) }).safeParse(saved);
  if (!legacy.success) return saved;
  return { ...legacy.data, version: 2,
    vehicles: Object.fromEntries(Object.entries(legacy.data.vehicles).map(([id, car]) => [id, { ...car, fuelLiters: FUEL_CAPACITY_LITERS }])),
    transactions: legacy.data.transactions.map(tx => ({ ...tx, timestamp: new Date(0).toISOString(), balanceBeforePhp: tx.balancePhp - tx.amountPhp, description: tx.kind === 'repair' ? 'Legacy repair' : 'Starting cash', source: 'legacy_save' })) };
}

export type SessionSnapshot = z.infer<typeof sessionSchema>;
export type RepairQuote = { id: string; vehicleId: string; vehicleName: string; revision: number; lines: RepairLine[]; totalPhp: number };
export type MaintenanceSummary = { vehicleId: string; vehicleName: string; condition: VehicleCondition; walletPhp: number; fuelLiters?: number; fuelCapacityLiters?: number };
export type RepairReceipt = { vehicleId: string; components: ServiceComponent[]; costPhp: number; walletPhp: number };

/** Session authority: economy and owned-car data outlive every Babylon scene. */
export class VehicleSession {
  private state: SessionSnapshot;
  private quoteSerial = 0;
  private readonly listeners = new Set<() => void>();
  constructor(saved?: unknown, private readonly persist?: (snapshot: SessionSnapshot) => void) {
    const parsed = sessionSchema.safeParse(migrateSession(saved));
    this.state = parsed.success ? parsed.data : { version: 2, walletPhp: STARTING_WALLET_PHP, vehicles: {},
      transactions: [{ id: 1, kind: 'starting_cash', timestamp: new Date().toISOString(), description: 'Starting cash', source: 'new_game', balanceBeforePhp: 0, amountPhp: STARTING_WALLET_PHP, balancePhp: STARTING_WALLET_PHP, vehicleId: null, components: [] }] };
  }
  snapshot(): SessionSnapshot { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  ensureVehicle(definition: VehicleDefinition) {
    if (this.state.vehicles[definition.id]) return;
    this.state.vehicles[definition.id] = { condition: { ...definition.condition.typical }, revision: 0, fuelLiters: FUEL_CAPACITY_LITERS };
    this.changed();
  }
  summary(definition: VehicleDefinition): MaintenanceSummary {
    this.ensureVehicle(definition);
    return { vehicleId: definition.id, vehicleName: `${definition.identity.make} ${definition.identity.model}`,
      condition: { ...this.state.vehicles[definition.id].condition }, fuelLiters: this.state.vehicles[definition.id].fuelLiters, fuelCapacityLiters: FUEL_CAPACITY_LITERS, walletPhp: this.state.walletPhp };
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
    const payment = this.payment(-costPhp, { kind: 'repair', description: `Repair: ${components.join(', ')}`, source: 'talyer', relatedEntityId: definition.id }, definition.id, components);
    if ('rejected' in payment) return payment;
    for (const key of components) car.condition[key] = 1;
    car.revision++;
    const receipt = { vehicleId: definition.id, components, costPhp, walletPhp: this.state.walletPhp };
    this.changed(); return receipt;
  }
  earn(amountPhp: number, source: MoneySource) { return this.transfer(amountPhp, source, false); }
  spend(amountPhp: number, source: MoneySource) { return this.transfer(amountPhp, source, true); }
  private transfer(amountPhp: number, source: MoneySource, debit: boolean) {
    if (!(amountPhp > 0)) return { rejected: 'Amount must be positive.' };
    const result = this.payment(debit ? -amountPhp : amountPhp, source);
    if (!('rejected' in result)) this.changed();
    return result;
  }
  private payment(amountPhp: number, source: MoneySource, vehicleId: string | null = null, components: ServiceComponent[] = []) {
    let balancePhp: number;
    try {
      const delta = centavos(amountPhp), balance = centavos(this.state.walletPhp) + delta;
      if (!delta || !Number.isSafeInteger(balance)) return { rejected: 'Invalid amount.' };
      if (balance < 0) return { rejected: 'Not enough money.' };
      balancePhp = balance / 100;
    } catch { return { rejected: 'Invalid amount.' }; }
    const parsed = transactionSchema.safeParse({ ...source, id: (this.state.transactions.at(-1)?.id ?? 0) + 1,
      timestamp: new Date().toISOString(), amountPhp, balanceBeforePhp: this.state.walletPhp, balancePhp, vehicleId, components });
    if (!parsed.success) return { rejected: 'Invalid transaction metadata.' };
    this.state.walletPhp = balancePhp; this.state.transactions.push(parsed.data);
    return structuredClone(parsed.data);
  }
  fuelQuote(definition: VehicleDefinition, request: FuelRequest) {
    this.ensureVehicle(definition);
    return quoteFuel(this.state.vehicles[definition.id].fuelLiters, request);
  }
  refuel(definition: VehicleDefinition, request: FuelRequest) {
    const quote = this.fuelQuote(definition, request);
    if ('rejected' in quote) return quote;
    const payment = this.payment(-quote.costPhp, { kind: 'fuel_purchase', description: `${quote.liters} L fuel`, source: 'refuel', relatedEntityId: definition.id }, definition.id);
    if ('rejected' in payment) return payment;
    const car = this.state.vehicles[definition.id];
    car.fuelLiters = Math.min(FUEL_CAPACITY_LITERS, car.fuelLiters + quote.liters);
    this.changed(); return { ...quote, transaction: payment };
  }
  /** Driving adapters may batch consumption without changing money. */
  consumeFuel(definition: VehicleDefinition, liters: number) {
    if (!Number.isFinite(liters) || liters < 0) return { rejected: 'Invalid fuel consumption.' };
    this.ensureVehicle(definition);
    const car = this.state.vehicles[definition.id], consumed = Math.min(liters, car.fuelLiters);
    if (consumed > 0) { car.fuelLiters -= consumed; this.changed(); }
    return { consumedLiters: consumed, fuelLiters: car.fuelLiters };
  }
  service(definition: VehicleDefinition, service: MaintenanceService) {
    if (!Object.hasOwn(MAINTENANCE_SERVICES, service)) return { rejected: 'Unknown service.' };
    const item = MAINTENANCE_SERVICES[service];
    this.ensureVehicle(definition);
    const payment = this.payment(-item.costPhp, { kind: 'maintenance', description: item.label, source: service, relatedEntityId: definition.id }, definition.id);
    if (!('rejected' in payment)) this.changed();
    return payment;
  }
  private changed() {
    try { this.persist?.(this.snapshot()); } catch { /* Storage failures must not undo a valid in-memory transaction. */ }
    this.listeners.forEach(listener => listener());
  }
}
