import type { InventorySession } from '../../game-core/inventory/InventorySession';
import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import { performancePart } from '../../game-core/performance/catalog';
import { previewPerformanceInstall, TALYER_PERFORMANCE, type PerformanceOperation, type PerformancePreview } from '../../game-core/performance/installation';
import type { InstallContext } from '../../game-core/performance/schema';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';

export type PerformanceQuote = PerformancePreview & { id: string };
export type PerformanceReceipt = { name: string; operation: PerformanceOperation; laborPhp: number };
export type PerformanceWorkshopView = {
  vehicleId: string; walletPhp: number; mechanicLevel: number; reputation: number;
  parts: { itemId: string; name: string; category: string; condition: number | null; inspected: boolean;
    installed: boolean; elsewhere: boolean; reason: string | null }[];
};
let workshopSerial = 0;

/** Quotes are transient. Authoritative inventory, condition and access are rechecked before charging. */
export class TalyerPerformanceSystem implements GameSystem {
  readonly name = 'talyerPerformance';
  private readonly instanceId = ++workshopSerial;
  private serial = 0;
  private quote: { view: PerformanceQuote; signature: string } | null = null;
  private committing = false;
  private disposed = false;
  private readonly release: (() => void)[];
  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession,
    private readonly session: VehicleSession, private readonly vehicle: VehicleDefinition,
    private readonly rejection: () => string | null, private readonly context: InstallContext = TALYER_PERFORMANCE) {
    session.ensureVehicle(vehicle);
    this.release = [
      inventory.subscribe(() => this.changed()), session.subscribe(() => this.changed()),
      bridge.handle('quotePerformancePart', ({ itemId, operation }) => this.estimate(itemId, operation)),
      bridge.handle('installPerformancePart', ({ quoteId }) => this.commit(quoteId)),
      bridge.handle('dismissPerformanceQuote', () => this.clearQuote()),
    ];
    this.publish();
  }
  private signature() {
    return JSON.stringify({ inventory: this.inventory.snapshot(), condition: this.session.summary(this.vehicle).condition, context: this.context });
  }
  private changed() {
    if (this.disposed || this.committing) return;
    if (this.quote && this.quote.signature !== this.signature()) this.clearQuote();
    this.publish();
  }
  private preview(itemId: string, operation: PerformanceOperation) {
    return previewPerformanceInstall(this.inventory, this.vehicle, this.session.summary(this.vehicle).condition, itemId, operation, this.context);
  }
  private publish() {
    const parts = this.inventory.items().flatMap(item => {
      const part = performancePart(item.partId);
      if (!part) return [];
      const where = this.inventory.installation(item.id), installed = where?.vehicleId === this.vehicle.id;
      const preview = this.preview(item.id, installed ? 'remove' : 'install');
      return [{ itemId: item.id, name: part.name, category: part.category, condition: item.revealedBy ? item.condition : null,
        inspected: !!item.revealedBy, installed, elsewhere: !!where && !installed,
        reason: 'rejected' in preview ? preview.rejected : null }];
    });
    this.bridge.emit('performanceWorkshop', { vehicleId: this.vehicle.id, walletPhp: this.session.summary(this.vehicle).walletPhp,
      mechanicLevel: this.context.mechanicLevel, reputation: this.context.reputation, parts });
  }
  private estimate(itemId: string, operation: PerformanceOperation): CommandOutcome {
    this.clearQuote();
    const rejection = this.rejection();
    if (rejection) return { rejected: rejection };
    const preview = this.preview(itemId, operation);
    if ('rejected' in preview) return preview;
    const view = { ...preview, id: `performance-${this.instanceId}-${++this.serial}` };
    this.quote = { view, signature: this.signature() };
    this.bridge.emit('performanceQuote', view);
  }
  private commit(quoteId: string): CommandOutcome {
    const rejection = this.rejection();
    if (rejection) { this.clearQuote(); return { rejected: rejection }; }
    const quote = this.quote;
    if (!quote || quote.view.id !== quoteId) return { rejected: 'Choose a fresh performance quote before paying.' };
    if (quote.signature !== this.signature()) { this.clearQuote(); return { rejected: 'Your car or parts changed. Request a fresh quote.' }; }
    const current = this.preview(quote.view.itemId, quote.view.operation);
    if ('rejected' in current) { this.clearQuote(); return current; }
    if (current.laborPhp !== quote.view.laborPhp) { this.clearQuote(); return { rejected: 'Labor changed. Request a fresh quote.' }; }
    // Inventory validates before invoking payment. A rejection cannot charge or displace parts.
    const pay = () => {
      const paid = this.session.spend(current.laborPhp, { kind: 'performance_labor', source: 'talyer',
        description: `${current.operation === 'install' ? 'Install' : 'Remove'}: ${current.name}`, relatedEntityId: current.itemId });
      return 'rejected' in paid ? paid : undefined;
    };
    this.committing = true;
    try {
      const result = current.operation === 'install'
        ? this.inventory.install(this.vehicle.id, current.itemId, { ...this.context, vehicle: this.vehicle }, pay)
        : this.inventory.uninstall(current.itemId, pay);
      if ('rejected' in result) return result;
      this.clearQuote();
      this.bridge.emit('performanceInstalled', { name: current.name, operation: current.operation, laborPhp: current.laborPhp });
    } finally {
      this.committing = false;
      this.publish();
    }
  }
  update() { if (this.quote && this.rejection()) this.clearQuote(); }
  private clearQuote() { this.quote = null; this.bridge.emit('performanceQuote', null); }
  dispose() {
    this.disposed = true; this.release.forEach(off => off()); this.clearQuote();
    this.bridge.emit('performanceWorkshop', null);
  }
}
