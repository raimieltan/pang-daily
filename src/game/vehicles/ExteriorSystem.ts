import type { InventorySession } from '../../game-core/inventory/InventorySession';
import {
  BODY_PART_SOCKETS, bodyPart, canRefinish, fitsVehicle, type BodyPartCategory, type ExteriorEffects, type FitState,
  type FittedBodyPart, type PaintFinish, type WearState,
} from '../../game-core/exterior';
import type { ExteriorSlot, VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import type { CommandOutcome, RuntimePort } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { BodyPartFitting } from './PlayerVehicle';

export interface ExteriorVehicle {
  readonly id: string;
  readonly definition: { spec: VehicleDefinition };
  readonly exterior: FittedBodyPart[];
  readonly exteriorEffects: ExteriorEffects;
  readonly paint?: string;
  equipBodyPart(socket: ExteriorSlot, fitting: BodyPartFitting | null): Promise<boolean>;
}

/** One fitted part as the HUD/garage sees it: what it looks like, never the hidden condition. */
export type BodyPartView = {
  socket: ExteriorSlot;
  itemId: string;
  partId: string;
  name: string;
  category: BodyPartCategory;
  finish: PaintFinish;
  wear: WearState;
  fit: FitState;
};

export type ExteriorView = {
  vehicleId: string;
  parts: BodyPartView[];
  effects: Omit<ExteriorEffects, 'modifiers'> & { addedWeightKg: number };
};

/** Owned parts for the workshop, without revealing hidden condition. */
export type ExteriorInventoryView = {
  vehicleId: string;
  parts: { itemId: string; partId: string; finish: PaintFinish | null; installedOn: string | null; compatible: boolean }[];
  pending: boolean;
  error: string | null;
};

/**
 * Scene adapter for body kits: a fitted part is the inventory item installed in the car's slot
 * for its socket, and its finish is the item's, so both persist with the inventory save. This
 * keeps each socket on the car in step with those installs (replacing a part in the same socket,
 * i.e. the same category, removes the old one) and routes the commands into the inventory.
 */
export class ExteriorSystem implements GameSystem {
  readonly name = 'exterior';
  /** Per socket, `itemId:condition:finish` last sent to the car, so unrelated inventory changes don't re-swap. */
  private readonly applied = new Map<ExteriorSlot, string>();
  private pending = 0;
  private error: string | null = null;
  private disposed = false;
  private readonly release: (() => void)[];

  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession, private readonly vehicle: ExteriorVehicle,
    private readonly workshopRejection: () => string | null = () => null) {
    this.release = [
      inventory.subscribe(() => this.sync()),
      bridge.handle('equipBodyPart', ({ itemId, finish }) => this.equip(itemId, finish)),
      bridge.handle('removeBodyPart', ({ itemId }) => this.remove(itemId)),
      bridge.handle('refinishBodyPart', ({ itemId, finish }) => this.refinish(itemId, finish)),
    ];
    this.sync();
    // A car with nothing fitted still tells the HUD so.
    if (this.pending === 0) this.publish();
  }

  private equip(itemId: string, finish: PaintFinish | null | undefined): CommandOutcome {
    const rejection = this.workshopRejection();
    if (rejection) return { rejected: rejection };
    const item = this.inventory.item(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    const part = bodyPart(item.partId);
    if (!part) return { rejected: 'That is not a body part.' };
    const spec = this.vehicle.definition.spec;
    if (!fitsVehicle(part, spec.tags)) return { rejected: `That won't fit a ${spec.identity.make} ${spec.identity.model}.` };
    if (!spec.visual.model.attachments.some(a => a.slot === part.socket)) return { rejected: 'Your car has nowhere to mount that.' };
    if (finish !== undefined && finish !== null && !canRefinish(part, finish)) return { rejected: `Can't do ${finish.replace('_', ' ')} on that part.` };
    const where = this.inventory.installation(itemId);
    if (where && where.vehicleId !== this.vehicle.id) return { rejected: 'That part is on another car. Take it off first.' };
    if (finish !== undefined) this.inventory.refinish(itemId, finish);
    if (where) { this.sync(); return; }
    const installed = this.inventory.install(this.vehicle.id, itemId);
    return 'rejected' in installed ? installed : undefined;
  }

  /** Resprays a part wherever it is; a fitted one restyles on the next sync. */
  private refinish(itemId: string, finish: PaintFinish | null): CommandOutcome {
    const rejection = this.workshopRejection();
    if (rejection) return { rejected: rejection };
    const item = this.inventory.item(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    const part = bodyPart(item.partId);
    if (!part) return { rejected: 'That is not a body part.' };
    if (finish !== null && !canRefinish(part, finish)) return { rejected: `Can't do ${finish.replace('_', ' ')} on that part.` };
    const done = this.inventory.refinish(itemId, finish);
    return 'rejected' in done ? done : undefined;
  }

  private remove(itemId: string): CommandOutcome {
    const rejection = this.workshopRejection();
    if (rejection) return { rejected: rejection };
    const item = this.inventory.item(itemId);
    if (!item || !bodyPart(item.partId)) return { rejected: 'That is not a body part.' };
    const where = this.inventory.installation(itemId);
    if (!where || where.vehicleId !== this.vehicle.id) return { rejected: 'That part is not on your car.' };
    const removed = this.inventory.uninstall(itemId);
    return 'rejected' in removed ? removed : undefined;
  }

  private sync() {
    if (this.disposed) return;
    const installed = this.inventory.installedOn(this.vehicle.id);
    const sockets = new Set(this.vehicle.definition.spec.visual.model.attachments.map(a => a.slot));
    for (const socket of BODY_PART_SOCKETS) {
      if (!sockets.has(socket)) continue;
      const itemId = installed[socket] ?? null;
      const item = itemId ? this.inventory.item(itemId) ?? null : null;
      const part = item ? bodyPart(item.partId) ?? null : null;
      const fitting = item && part ? { part, condition: item.condition, finish: item.finish } : null;
      const key = fitting ? `${itemId}:${item!.condition ?? ''}:${item!.finish ?? ''}:${this.vehicle.paint ?? ''}` : 'stock';
      if (key === (this.applied.get(socket) ?? 'stock')) continue;
      this.applied.set(socket, key);
      this.error = null;
      this.pending++;
      this.vehicle.equipBodyPart(socket, fitting).then(
        () => this.settled(),
        (error: unknown) => {
          if (this.applied.get(socket) === key) {
            // Keep the desired install in the save so a temporary network failure is retryable.
            // Mark the slot dirty even for stock: a failed replacement may leave an old mesh on it.
            this.applied.set(socket, 'failed');
            this.error = `Body part failed to load: ${error instanceof Error ? error.message : String(error)}. Try fitting it again.`;
          }
          this.settled();
        },
      );
    }
    this.publishInventory();
  }

  /** Publishes once the last in-flight swap lands, so the HUD sees one consistent state. */
  private settled() {
    if (--this.pending === 0 && !this.disposed) { this.publish(); this.publishInventory(); }
  }

  private publish() {
    const installed = this.inventory.installedOn(this.vehicle.id);
    const parts = this.vehicle.exterior.flatMap(({ part, look }): BodyPartView[] => {
      const itemId = installed[part.socket];
      return itemId && this.inventory.item(itemId)?.partId === part.id ? [{ socket: part.socket, itemId, partId: part.id, name: part.name, category: part.category,
        finish: look.finish, wear: look.wear, fit: look.fitState }] : [];
    });
    const { modifiers, ...effects } = this.vehicle.exteriorEffects;
    this.bridge.emit('exteriorState', { vehicleId: this.vehicle.id, parts, effects: { ...effects, addedWeightKg: modifiers.addedWeightKg } });
  }

  private publishInventory() {
    const spec = this.vehicle.definition.spec;
    const parts = this.inventory.items().flatMap(item => {
      const part = bodyPart(item.partId);
      return part ? [{ itemId: item.id, partId: part.id, finish: item.finish,
        installedOn: this.inventory.installation(item.id)?.vehicleId ?? null,
        compatible: fitsVehicle(part, spec.tags) && spec.visual.model.attachments.some(a => a.slot === part.socket),
      }] : [];
    });
    this.bridge.emit('exteriorInventory', { vehicleId: this.vehicle.id, parts, pending: this.pending > 0, error: this.error });
  }

  dispose() {
    this.disposed = true;
    this.release.forEach((off) => off());
  }
}
