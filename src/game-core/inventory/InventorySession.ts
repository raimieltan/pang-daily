import { z } from 'zod';
import { PART_SLOTS, partDefinition, partIdSchema, type PartSlot } from '../parts/parts';

/** How the true condition of an item came out. Installation and seller trust hook in here later. */
export const REVEAL_METHODS = ['mechanic', 'known'] as const;
export type RevealMethod = typeof REVEAL_METHODS[number];

const origins = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('marketplace'), listingId: z.string().min(1), sellerId: z.string().min(1), paidPhp: z.number().int().positive(),
    advertisedGrade: z.enum(['like_new', 'good', 'fair', 'as_is']) }),
  z.object({ kind: z.literal('grant'), reason: z.string().min(1) }),
]);
export type ItemOrigin = z.infer<typeof origins>;
const itemSchema = z.object({
  id: z.string().min(1), partId: partIdSchema,
  /** Per-item wear, 0..1; null for parts that do not wear. Hidden from views until `revealedBy`. */
  condition: z.number().min(0).max(1).nullable(), revealedBy: z.enum(REVEAL_METHODS).nullable(),
  acquiredAt: z.number().int(), origin: origins,
  /** Idempotency key: adding the same key twice returns the first item instead of a copy. */
  key: z.string().min(1).nullable(),
});
export type InventoryItem = z.infer<typeof itemSchema>;
const installsSchema = z.record(z.string().min(1), z.partialRecord(z.enum(PART_SLOTS), z.string().min(1)));
const inventorySaveSchema = z.object({ version: z.literal(1), serial: z.number().int().nonnegative(), items: z.array(itemSchema), installed: installsSchema })
  .refine(save => new Set(save.items.map(i => i.id)).size === save.items.length, 'duplicate item id')
  .refine(save => new Set(save.items.flatMap(i => i.key ? [i.key] : [])).size === save.items.filter(i => i.key).length, 'duplicate item key')
  .refine(save => Object.values(save.installed).every(slots => Object.values(slots).every(id => save.items.some(i => i.id === id))), 'install references a missing item');
export type InventorySave = z.infer<typeof inventorySaveSchema>;

export type AddItem = { partId: string; condition: number | null; origin: ItemOrigin; key?: string; revealedBy?: RevealMethod | null };
export type Installation = { vehicleId: string; slots: PartSlot[] };
type Rejection = { rejected: string };

/**
 * Parts the player owns, one entry per physical part (two identical tire sets are two items with
 * their own condition). Installed state lives here too, as `vehicleId → slot → itemId`: a car
 * references an owned item, it never holds a copy, so an item is on at most one car.
 * Money is not handled here — sellers (the marketplace) charge the wallet, then call `add`.
 */
export class InventorySession {
  private state: InventorySave;
  private readonly listeners = new Set<() => void>();

  constructor(saved?: unknown, private readonly persist?: (save: InventorySave) => void, private readonly now: () => number = Date.now) {
    const parsed = inventorySaveSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, serial: 0, items: [], installed: {} };
  }

  snapshot(): InventorySave { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  items(): InventoryItem[] { return structuredClone(this.state.items); }
  item(itemId: string): InventoryItem | undefined { const item = this.find(itemId); return item && structuredClone(item); }
  byKey(key: string): InventoryItem | undefined { const item = this.state.items.find(i => i.key === key); return item && structuredClone(item); }
  /** Where the item is fitted, or null when loose in the trunk. */
  installation(itemId: string): Installation | null {
    for (const [vehicleId, slots] of Object.entries(this.state.installed)) {
      const taken = (Object.keys(slots) as PartSlot[]).filter(slot => slots[slot] === itemId);
      if (taken.length) return { vehicleId, slots: taken };
    }
    return null;
  }
  installedOn(vehicleId: string): Partial<Record<PartSlot, string>> { return { ...this.state.installed[vehicleId] }; }

  add(input: AddItem): InventoryItem | Rejection {
    if (!partDefinition(input.partId)) return { rejected: 'Unknown part.' };
    if (input.key) { const existing = this.byKey(input.key); if (existing) return existing; }
    const parsed = itemSchema.safeParse({ id: `item-${this.state.serial + 1}`, partId: input.partId, condition: input.condition,
      revealedBy: input.condition === null ? 'known' : input.revealedBy ?? null, acquiredAt: this.now(), origin: input.origin, key: input.key ?? null });
    if (!parsed.success) return { rejected: 'Invalid inventory item.' };
    this.state.serial++; this.state.items.push(parsed.data); this.changed();
    return structuredClone(parsed.data);
  }

  /** Sold, scrapped or used up. Installed parts must come off the car first. */
  remove(itemId: string): InventoryItem | Rejection {
    const item = this.find(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    if (this.installation(itemId)) return { rejected: 'Take the part off the car first.' };
    this.state.items = this.state.items.filter(i => i !== item); this.changed();
    return structuredClone(item);
  }

  reveal(itemId: string, method: RevealMethod): InventoryItem | Rejection {
    const item = this.find(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    if (item.revealedBy) return { rejected: 'Already inspected.' };
    item.revealedBy = method; this.changed();
    return structuredClone(item);
  }

  /** Fits the item into every slot its part needs, returning whatever it displaced to the trunk. */
  install(vehicleId: string, itemId: string): { installation: Installation; displaced: string[] } | Rejection {
    const item = this.find(itemId), part = item && partDefinition(item.partId);
    if (!item || !part) return { rejected: 'You do not have that part.' };
    if (!vehicleId) return { rejected: 'Choose a car.' };
    const current = this.installation(itemId);
    if (current) return { rejected: current.vehicleId === vehicleId ? 'Already installed.' : 'That part is on another car. Take it off first.' };
    const slots = { ...this.state.installed[vehicleId] };
    const displaced = [...new Set(part.slots.flatMap(slot => slots[slot] ? [slots[slot]!] : []))];
    // A displaced multi-slot part (coilovers) comes off entirely, not just the overlapping slot.
    for (const slot of Object.keys(slots) as PartSlot[]) if (displaced.includes(slots[slot]!)) delete slots[slot];
    for (const slot of part.slots) slots[slot] = itemId;
    this.state.installed[vehicleId] = slots; this.changed();
    return { installation: { vehicleId, slots: [...part.slots] }, displaced };
  }

  uninstall(itemId: string): InventoryItem | Rejection {
    const where = this.installation(itemId);
    if (!where) return { rejected: 'That part is not installed.' };
    const slots = this.state.installed[where.vehicleId];
    for (const slot of where.slots) delete slots[slot];
    if (Object.keys(slots).length === 0) delete this.state.installed[where.vehicleId];
    this.changed();
    return structuredClone(this.find(itemId)!);
  }

  private find(itemId: string) { return this.state.items.find(i => i.id === itemId); }
  private changed() {
    try { this.persist?.(this.snapshot()); } catch { /* Keep the in-memory inventory if storage fails, as VehicleSession does. */ }
    this.listeners.forEach(listener => listener());
  }
}

