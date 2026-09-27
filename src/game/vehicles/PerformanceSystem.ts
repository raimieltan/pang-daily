import type { InventorySession } from '../../game-core/inventory/InventorySession';
import { performancePart } from '../../game-core/performance/catalog';
import type { InstalledPerformancePart } from '../../game-core/performance/schema';
import type { GameSystem } from '../engine/types';

/** Inventory owns physical parts and saves; the car receives a snapshot. */
export class PerformanceSystem implements GameSystem {
  readonly name = 'performance';
  private readonly release: () => void;
  constructor(inventory: InventorySession, vehicle: { id: string; setPerformanceParts(parts: readonly InstalledPerformancePart[]): void }) {
    const sync = () => {
      const ids = new Set(Object.values(inventory.installedOn(vehicle.id)));
      vehicle.setPerformanceParts(inventory.items().filter(item => ids.has(item.id) && performancePart(item.partId)));
    };
    this.release = inventory.subscribe(sync);
    sync();
  }
  dispose() { this.release(); }
}
