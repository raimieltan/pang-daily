import { describe, expect, it } from 'vitest';
import { EXTERIOR_SLOTS } from '../vehicles/VehicleDefinition';
import { PART_SLOTS, PART_TEMPLATES } from '../parts/parts';
import { InventorySession, type AddItem, type InventoryItem, type InventorySave } from './InventorySession';

const grant = (partId: string, condition: number | null = .7, key?: string): AddItem => ({ partId, condition, key, origin: { kind: 'grant', reason: 'test' } });
const ok = <T,>(result: T | { rejected: string }): T => { if (result && typeof result === 'object' && 'rejected' in result) throw new Error(String(result.rejected)); return result as T; };
function setup(saved?: unknown) {
  const saves: InventorySave[] = [];
  return { inventory: new InventorySession(saved, save => saves.push(save), () => 1234), saves };
}

describe('part definitions', () => {
  it('reuse the vehicle exterior slots and give every part at least one known slot', () => {
    for (const slot of EXTERIOR_SLOTS) expect(PART_SLOTS).toContain(slot);
    for (const part of PART_TEMPLATES) {
      expect(part.slots.length).toBeGreaterThan(0);
      for (const slot of part.slots) expect(PART_SLOTS).toContain(slot);
    }
  });
});

describe('InventorySession', () => {
  it('starts empty and keeps identical parts as separate items with their own condition', () => {
    const { inventory } = setup();
    expect(inventory.items()).toEqual([]);
    const a = ok(inventory.add(grant('tires_195_55', .8))), b = ok(inventory.add(grant('tires_195_55', .3)));
    expect(a.id).not.toBe(b.id);
    expect(inventory.items().map(i => [i.partId, i.condition])).toEqual([['tires_195_55', .8], ['tires_195_55', .3]]);
    expect(a).toMatchObject({ acquiredAt: 1234, revealedBy: null });
  });

  it('treats a repeated key as the same acquisition, and rejects unknown parts or bad condition', () => {
    const { inventory } = setup();
    const first = ok(inventory.add(grant('clutch_kit', .5, 'k1')));
    expect(inventory.add(grant('clutch_kit', .9, 'k1'))).toEqual(first);
    expect(inventory.items()).toHaveLength(1);
    expect(inventory.add(grant('flux_capacitor'))).toEqual({ rejected: 'Unknown part.' });
    expect(inventory.add(grant('clutch_kit', 1.5))).toHaveProperty('rejected');
    expect(ok(inventory.add(grant('muffler_canister', null))).revealedBy).toBe('known');
  });

  it('returns copies, so callers cannot mutate owned items', () => {
    const { inventory } = setup();
    const item = ok(inventory.add(grant('bucket_seat')));
    (item as InventoryItem).condition = 0;
    inventory.items()[0].condition = 0;
    expect(inventory.item(item.id)?.condition).toBe(.7);
  });

  it('installs by reference, swaps whole multi-slot parts out and refuses double ownership', () => {
    const { inventory } = setup();
    const coilovers = ok(inventory.add(grant('used_coilovers_01')));
    const springs = ok(inventory.add(grant('lowering_springs')));
    const shocks = ok(inventory.add(grant('stock_shocks_set')));
    expect(ok(inventory.install('car_a', coilovers.id)).installation.slots).toEqual(['shocks', 'springs']);
    expect(inventory.installedOn('car_a')).toEqual({ shocks: coilovers.id, springs: coilovers.id });
    expect(inventory.install('car_b', coilovers.id)).toHaveProperty('rejected');
    // Springs displace the coilovers entirely: they do not stay half-fitted in the shocks slot.
    expect(ok(inventory.install('car_a', springs.id)).displaced).toEqual([coilovers.id]);
    expect(inventory.installedOn('car_a')).toEqual({ springs: springs.id });
    ok(inventory.install('car_a', shocks.id));
    expect(inventory.installation(coilovers.id)).toBeNull();
    expect(inventory.installation(shocks.id)).toEqual({ vehicleId: 'car_a', slots: ['shocks'] });
    expect(inventory.items()).toHaveLength(3); // Installing never adds or removes items.
  });

  it('removes loose items only, and uninstalls back to the trunk', () => {
    const { inventory } = setup();
    const lights = ok(inventory.add(grant('projector_headlights')));
    ok(inventory.install('car_a', lights.id));
    expect(inventory.installedOn('car_a')).toEqual({ headlight_l: lights.id, headlight_r: lights.id });
    expect(inventory.remove(lights.id)).toEqual({ rejected: 'Take the part off the car first.' });
    ok(inventory.uninstall(lights.id));
    expect(inventory.installedOn('car_a')).toEqual({});
    expect(inventory.uninstall(lights.id)).toHaveProperty('rejected');
    expect(ok(inventory.remove(lights.id)).id).toBe(lights.id);
    expect(inventory.items()).toEqual([]);
    expect(inventory.remove(lights.id)).toHaveProperty('rejected');
  });

  it('reveals once, persists every change and restores items, keys and installs', () => {
    const { inventory, saves } = setup();
    const head = ok(inventory.add(grant('surplus_head', .2, 'k')));
    ok(inventory.reveal(head.id, 'mechanic'));
    expect(inventory.reveal(head.id, 'mechanic')).toEqual({ rejected: 'Already inspected.' });
    ok(inventory.install('car_a', head.id));
    const restored = setup(JSON.parse(JSON.stringify(saves.at(-1)))).inventory;
    expect(restored.items()).toEqual(inventory.items());
    expect(restored.installedOn('car_a')).toEqual({ cylinder_head: head.id });
    expect(restored.add(grant('surplus_head', .9, 'k'))).toMatchObject({ id: head.id });
    expect(ok(restored.add(grant('surplus_head'))).id).not.toBe(head.id); // Serial survives: no id reuse.
  });

  it('falls back to an empty inventory for inconsistent saves', () => {
    const { inventory, saves } = setup();
    const item = ok(inventory.add(grant('clutch_kit')));
    ok(inventory.install('car_a', item.id));
    const save = saves.at(-1)!;
    expect(setup({ ...save, items: [] }).inventory.items()).toEqual([]); // install → missing item
    expect(setup({ ...save, items: [save.items[0], save.items[0]] }).inventory.items()).toEqual([]);
    expect(setup({ ...save, items: [{ ...save.items[0], partId: 'gone' }], installed: {} }).inventory.items()).toEqual([]);
  });
});
