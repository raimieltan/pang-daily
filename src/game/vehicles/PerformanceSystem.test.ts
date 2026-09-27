import { expect, it, vi } from 'vitest';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { BANWA_DALAGAN_1996 as car } from '../../game-core/vehicles/catalog';
import { calculateVehiclePerformance } from '../../game-core/performance/calculator';
import { PerformanceSystem } from './PerformanceSystem';
import { performanceHandling } from '../maintenance/conditionHandling';
import { resolveHandlingPreset } from './handling/HandlingConfig';
import { HANDLING_PRESETS } from './handling/presets';

it('synchronizes restored inventory, subsequent installs, removal and disposal', () => {
  const inventory = new InventorySession();
  const part = inventory.add({ partId: 'cone_intake', condition: .55, origin: { kind: 'grant', reason: 'test' } });
  if ('rejected' in part) throw new Error(part.rejected);
  inventory.install(car.id, part.id, { vehicle: car, mechanicLevel: 3, reputation: 0 });
  const restored = new InventorySession(inventory.snapshot());
  const vehicle = { id: car.id, setPerformanceParts: vi.fn() };
  const system = new PerformanceSystem(restored, vehicle);
  expect(vehicle.setPerformanceParts).toHaveBeenLastCalledWith([expect.objectContaining({ partId: 'cone_intake', condition: .55 })]);
  restored.uninstall(part.id);
  expect(vehicle.setPerformanceParts).toHaveBeenLastCalledWith([]);
  const calls = vehicle.setPerformanceParts.mock.calls.length;
  system.dispose();
  restored.install(car.id, part.id, { vehicle: car, mechanicLevel: 3, reputation: 0 });
  expect(vehicle.setPerformanceParts).toHaveBeenCalledTimes(calls);
});

it('maps calculated power-to-weight and lag into driving without compounding or reading parts', () => {
  const base = resolveHandlingPreset(HANDLING_PRESETS, 'fwd_worn_sedan');
  const stock = calculateVehiclePerformance(car).stats;
  const boosted = calculateVehiclePerformance(car, ['efi_wiring', 'efi_conversion', 'turbo_oil_lines', 'used_small_turbo']
    .map(partId => ({ id: partId, partId, condition: 1 }))).stats;
  const applied = performanceHandling(base, stock, boosted);
  expect(applied.drive.accelerationMps2).toBeGreaterThan(base.drive.accelerationMps2);
  expect(applied.pedals.throttleRise).toBeLessThan(base.pedals.throttleRise);
  expect(performanceHandling(base, stock, stock)).toEqual(base);
  expect(performanceHandling(base, stock, boosted)).toEqual(applied);
});
