import { expect, it } from 'vitest';
import { AutoPartsShop, AUTO_PARTS_STOCK } from './AutoPartsShop';
import { InventorySession } from '../inventory/InventorySession';
import { VehicleSession } from '../maintenance/VehicleSession';
import { generateListing } from '../marketplace/listings';
import { BANWA_DALAGAN_1996 as car } from '../vehicles/catalog';
import { NEW_PERFORMANCE_PARTS, USED_PERFORMANCE_PARTS, performancePart } from '../performance/catalog';
import { checkPerformanceCompatibility } from '../performance/compatibility';
import { calculateVehiclePerformance } from '../performance/calculator';
const funded = () => { const wallet = new VehicleSession(); wallet.earn(500000, { kind: 'test', source: 'test', description: 'Test funds' }); return wallet; };

it('stocks every performance equivalent at exactly five times its used midpoint, including EFI harness', () => {
  expect(AUTO_PARTS_STOCK).toHaveLength(USED_PERFORMANCE_PARTS.length);
  for (const product of AUTO_PARTS_STOCK) {
    expect(product.pricePhp).toBe(product.usedReferencePhp * 5);
    expect(performancePart(product.partId)).toMatchObject({ sketchiness: 0, conditionRange: [1, 1] });
    expect(product.name).not.toMatch(/surplus|used|unknown|repaired/i);
  }
  expect(AUTO_PARTS_STOCK.find(p => p.partId === 'new_efi_wiring')).toMatchObject({ pricePhp: 17500, usedReferencePhp: 3500 });
  for (let seed = 0; seed < 300; seed++) expect(NEW_PERFORMANCE_PARTS.some(p => p.id === generateListing(seed, 'test', 0).templateId)).toBe(false);
});

it('charges once per purchase and delivers known brand-new condition with a shop receipt', () => {
  const wallet = funded(), inventory = new InventorySession(), shop = new AutoPartsShop(wallet, inventory);
  const before = wallet.snapshot().walletPhp;
  const bought = shop.buy('new_efi_wiring');
  if ('rejected' in bought) throw new Error(bought.rejected);
  expect(wallet.snapshot().walletPhp).toBe(before - 17500);
  expect(inventory.item(bought.itemId)).toMatchObject({ partId: 'new_efi_wiring', condition: 1, revealedBy: 'known', origin: { kind: 'parts_shop', paidPhp: 17500 } });
  const restored = new InventorySession(inventory.snapshot());
  new AutoPartsShop(new VehicleSession(wallet.snapshot()), restored).recover();
  expect(restored.items()).toHaveLength(1);
});

it('rejects unknown and unaffordable purchases without changing money or inventory', () => {
  const wallet = new VehicleSession(), inventory = new InventorySession(), shop = new AutoPartsShop(wallet, inventory);
  const before = wallet.snapshot();
  expect(shop.buy('efi_wiring')).toHaveProperty('rejected');
  expect(shop.buy('new_efi_wiring')).toHaveProperty('rejected');
  expect(wallet.snapshot()).toEqual(before); expect(inventory.items()).toEqual([]);
});

it('recovers a paid receipt missing inventory exactly once and never resurrects removed parts', () => {
  const wallet = funded(), inventory = new InventorySession();
  new AutoPartsShop(wallet, inventory).buy('new_efi_wiring');
  const missingInventory = new InventorySession();
  const recovered = new AutoPartsShop(new VehicleSession(wallet.snapshot()), missingInventory);
  recovered.recover(); expect(missingInventory.items()).toHaveLength(1);
  missingInventory.remove(missingInventory.items()[0].id);
  const restored = new InventorySession(missingInventory.snapshot());
  new AutoPartsShop(new VehicleSession(wallet.snapshot()), restored).recover();
  expect(restored.items()).toHaveLength(0);
});

it('new supports satisfy used kits, used supports satisfy new kits, and builds retain one part per slot', () => {
  const items = (...ids: string[]) => ids.map(partId => ({ id: partId, partId, condition: 1 }));
  expect(checkPerformanceCompatibility(car, items('new_efi_wiring', 'efi_conversion')).compatible).toBe(true);
  expect(checkPerformanceCompatibility(car, items('efi_wiring', 'new_efi_conversion')).compatible).toBe(true);
  const newBuild = items('new_efi_wiring', 'new_efi_conversion', 'new_turbo_oil_lines', 'new_used_small_turbo');
  expect(checkPerformanceCompatibility(car, newBuild).compatible).toBe(true);
  const stats = calculateVehiclePerformance(car, newBuild).stats;
  expect(stats.fuelSystem).toBe('efi'); expect(stats.boostBar).toBeGreaterThan(0);
  expect(stats.sketchiness).toBe(0);
  expect(checkPerformanceCompatibility(car, items('efi_wiring', 'new_efi_wiring')).compatible).toBe(false);
});
