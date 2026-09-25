import type { InventorySession } from '../../game-core/inventory/InventorySession';
import type { StatModifiers } from '../../game-core/vehicles/vehicleStats';
import type { VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import { wheelModifiers, wheelPart, type Fitment, type WheelPart } from '../../game-core/wheels';
import type { CommandOutcome, RuntimePort } from '../bridge';
import type { GameSystem } from '../engine/types';

export interface WheelVehicle {
  readonly id: string;
  readonly definition: { spec: VehicleDefinition };
  readonly fitment: Fitment;
  equipWheels(part: WheelPart | null, condition: number | null): Promise<boolean>;
}

/** What the HUD/garage sees. `effects` are the set's listed numbers: a hidden condition never leaks through them. */
export type WheelsView = {
  vehicleId: string;
  /** Inventory item on the `wheels` slot; null = stock wheels. */
  itemId: string | null;
  partId: string | null;
  name: string;
  fitment: Fitment;
  effects: StatModifiers;
};

/**
 * Scene adapter: the equipped wheel set is the inventory item installed in the car's `wheels`
 * slot, so it persists with the inventory save. This keeps the car's visuals and handling in
 * step with that install, and routes `equipWheels` into the inventory.
 */
export class WheelSystem implements GameSystem {
  readonly name = 'wheels';
  /** `itemId:condition` last sent to the car, so unrelated inventory changes don't re-swap. */
  private applied: string | null = null;
  private disposed = false;
  private readonly release: (() => void)[];

  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession, private readonly vehicle: WheelVehicle) {
    this.release = [
      inventory.subscribe(() => this.sync()),
      bridge.handle('equipWheels', ({ itemId }) => this.equip(itemId)),
    ];
    this.sync();
  }

  private equip(itemId: string | null): CommandOutcome {
    const current = this.inventory.installedOn(this.vehicle.id).wheels;
    if (itemId === null) {
      if (!current) return;
      const removed = this.inventory.uninstall(current);
      return 'rejected' in removed ? removed : undefined;
    }
    const item = this.inventory.item(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    if (!wheelPart(item.partId)) return { rejected: 'That is not a wheel set.' };
    if (current === itemId) return;
    const installed = this.inventory.install(this.vehicle.id, itemId);
    return 'rejected' in installed ? installed : undefined;
  }

  private sync() {
    if (this.disposed) return;
    const itemId = this.inventory.installedOn(this.vehicle.id).wheels ?? null;
    const item = itemId ? this.inventory.item(itemId) ?? null : null;
    const part = item ? wheelPart(item.partId) ?? null : null;
    const key = `${part ? itemId : 'stock'}:${item?.condition ?? ''}`;
    if (key === this.applied) return;
    this.applied = key;
    this.vehicle.equipWheels(part, item?.condition ?? null).then(
      (done) => { if (done && !this.disposed) this.publish(part ? itemId : null, part); },
      (error: unknown) => {
        if (this.applied === key) this.applied = null;
        if (!this.disposed) this.bridge.emit('error', { message: `Wheels failed to load: ${error instanceof Error ? error.message : String(error)}` });
      },
    );
  }

  private publish(itemId: string | null, part: WheelPart | null) {
    const spec = this.vehicle.definition.spec;
    this.bridge.emit('wheelsState', {
      vehicleId: this.vehicle.id, itemId, partId: part?.id ?? null, name: part?.name ?? 'Stock wheels',
      fitment: this.vehicle.fitment, effects: wheelModifiers(spec, part),
    });
  }

  dispose() {
    this.disposed = true;
    this.release.forEach((off) => off());
  }
}
