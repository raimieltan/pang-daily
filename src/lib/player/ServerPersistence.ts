import type { PlayerAction, PlayerBootstrap, CommandReceipt } from '@pang-daily/contracts';
import type { ListingView } from '@/game-core/marketplace/listings';
import type { PersistencePort, PersistentIntent } from '@/game-core/persistence/PersistencePort';
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';
import type { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import type { InventorySession } from '@/game-core/inventory/InventorySession';
import type { JobSession } from '@/game-core/jobs/JobSession';
export interface ServerPlayerRepository {
  command(action: PlayerAction, key: string): Promise<CommandReceipt>;
  bootstrap(): Promise<PlayerBootstrap>;
  marketplace(): Promise<ListingView[]>;
}
/** Serial domain commits; no API call participates in the frame loop. Failed retries reuse their key. */
export class ServerPersistence implements PersistencePort {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, { key: string; receipt?: CommandReceipt }>();
  private durable: RuntimeBootstrap;
  private disposed = false;
  private inFlight = new Map<string, Promise<CommandReceipt>>();
  private operationKeys = new Map<string, string>();
  constructor(private readonly repository: ServerPlayerRepository, private readonly hydrate: (dto: PlayerBootstrap) => RuntimeBootstrap,
    initial: RuntimeBootstrap, private readonly wallet: VehicleSession, private readonly inventory: InventorySession,
    private readonly jobs: JobSession, private readonly report: (message: string | null) => void, private readonly refreshProgression?: (fresh: RuntimeBootstrap) => void, private readonly saving?: (saving: boolean) => void) { this.durable = structuredClone(initial); }
  execute(intent: PersistentIntent): Promise<CommandReceipt> {
    const fingerprint = JSON.stringify(intent);
    const running = this.inFlight.get(fingerprint); if (running) return running;
    const task = this.tail.then(async () => {
      this.saving?.(true);
      const action = this.resolve(intent);
      if (this.pending.has(JSON.stringify(action))) return this.commit(action);
      for (const fingerprint of [...this.pending.keys()]) await this.commit(JSON.parse(fingerprint) as PlayerAction);
      await this.flushWear();
      const tag = typeof intent.operationTag === 'string' ? intent.operationTag : undefined;
      if (tag && !this.operationKeys.has(tag)) this.operationKeys.set(tag, crypto.randomUUID());
      return this.commit(action, tag ? this.operationKeys.get(tag) : undefined);
    });
    this.tail = task.catch(error => this.report(error instanceof Error ? error.message : String(error))).finally(() => this.saving?.(false));
    this.inFlight.set(fingerprint, task);
    void task.finally(() => this.inFlight.delete(fingerprint)).catch(() => {});
    return task;
  }
  checkpoint() {
    if (this.disposed) return;
    const task = this.tail.then(async () => {
      this.saving?.(true);
      for (const fingerprint of [...this.pending.keys()]) await this.commit(JSON.parse(fingerprint) as PlayerAction);
      await this.flushWear();
    });
    this.tail = task.catch(error => this.report(`Progress was not saved: ${error instanceof Error ? error.message : String(error)}. Retry your last action or keep this tab open.`)).finally(() => this.saving?.(false));
  }
  private resolve(intent: PersistentIntent): PlayerAction {
    const action = { ...intent };
    delete action.operationTag;
    if (typeof action.vehicleId === 'string') {
      const id = this.durable.instanceIdByDefinition[action.vehicleId];
      if (!id) throw new Error('This car is not owned by your player.');
      action.vehicleId = id;
    }
    return action as PlayerAction;
  }
  private async flushWear() {
    for (const [definitionId, original] of Object.entries(this.durable.vehicles.vehicles)) {
      const current = this.wallet.snapshot().vehicles[definitionId];
      if (!current) continue;
      const changed = Object.keys(current.condition).some(key => current.condition[key as keyof typeof current.condition] < original.condition[key as keyof typeof original.condition] - 1e-8)
        || Math.floor(current.fuelLiters * 1000) < Math.round(original.fuelLiters * 1000);
      if (!changed) continue;
      await this.commit({ type: 'vehicle_checkpoint', vehicleId: this.durable.instanceIdByDefinition[definitionId],
        revision: String(original.revision), condition: current.condition, fuelMilliliters: Math.floor(current.fuelLiters * 1000), odometerDeltaMeters: 0 });
    }
  }
  private async commit(action: PlayerAction, key?: string) {
    const fingerprint = JSON.stringify(action);
    const pending = this.pending.get(fingerprint) ?? { key: key ?? crypto.randomUUID() };
    this.pending.set(fingerprint, pending);
    const before = structuredClone(this.durable.vehicles);
    if (action.type === 'vehicle_checkpoint') {
      const id = Object.keys(this.durable.instanceIdByDefinition).find(id => this.durable.instanceIdByDefinition[id] === action.vehicleId);
      if (id && before.vehicles[id]) { before.vehicles[id].condition = structuredClone(action.condition); before.vehicles[id].fuelLiters = action.fuelMilliliters / 1000; }
    }
    // A lost response is retried with this same key; a failed refresh never causes another charge.
    try {
      if (!pending.receipt) pending.receipt = await this.repository.command(action, pending.key);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && Number(error.status) >= 400 && Number(error.status) < 500) this.pending.delete(fingerprint);
      throw error;
    }
    const dto = await this.repository.bootstrap();
    const fresh = this.hydrate(dto), local = this.wallet.snapshot();
    this.durable = structuredClone(fresh);
    // Keep only additional simulation loss incurred while the request was in flight.
    for (const [id, car] of Object.entries(fresh.vehicles.vehicles)) {
      const old = before.vehicles[id], now = local.vehicles[id];
      if (!old || !now) continue;
      for (const key of Object.keys(car.condition) as (keyof typeof car.condition)[]) car.condition[key] = Math.max(0, car.condition[key] - Math.max(0, old.condition[key] - now.condition[key]));
      car.fuelLiters = Math.max(0, car.fuelLiters - Math.max(0, old.fuelLiters - now.fuelLiters));
    }
    this.wallet.applyServerSnapshot(fresh.vehicles);
    this.inventory.applyServerSnapshot(fresh.inventory);
    this.jobs.applyServerSnapshot(fresh.jobs);
    this.refreshProgression?.(fresh);
    this.pending.delete(fingerprint); this.report(null);
    return pending.receipt;
  }
  marketplace() { return this.repository.marketplace(); }
  dispose() { this.checkpoint(); this.disposed = true; }
}
