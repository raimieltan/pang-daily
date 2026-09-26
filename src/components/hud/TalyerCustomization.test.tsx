// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameBridge } from '@/game/bridge';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car, type ExteriorSlot } from '@/game-core/vehicles';
import { exteriorEffects, resolveBodyPartLook, type FittedBodyPart, type VehicleAppearance } from '@/game-core/exterior';
import { calculateFitment } from '@/game-core/wheels';
import { ExteriorSystem, type ExteriorVehicle } from '@/game/vehicles/ExteriorSystem';
import { CustomizationSystem } from '@/game/vehicles/CustomizationSystem';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMarketStore, useMarketStore } from '@/state/marketStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { RepairPanel } from './RepairPanel';

let root: Root, container: HTMLDivElement;
const release: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); release.splice(0).reverse().forEach(off => off()); container.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent === label)!;
const click = async (element: HTMLElement) => { await act(async () => { element.click(); await new Promise(resolve => setTimeout(resolve)); }); };
const change = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
};
function setup(withParts = true) {
  const bridge = new GameBridge(), inventory = new InventorySession(), session = new VehicleSession();
  const grant = (partId: string) => {
    const result = inventory.add({ partId, condition: 0.8, origin: { kind: 'grant', reason: 'test' } });
    if ('rejected' in result) throw Error(result.rejected);
    return result;
  };
  if (withParts) grant('dalagan_ducktail');
  const mounted = new Map<ExteriorSlot, FittedBodyPart>();
  let appearance: VehicleAppearance = { paint: car.visual.defaultPaint, rideHeightM: 0 };
  let rejection: string | null = null;
  const vehicle: ExteriorVehicle & { setAppearance(value: VehicleAppearance): void; readonly fitment: ReturnType<typeof calculateFitment> } = {
    id: car.id, definition: { spec: car }, get paint() { return appearance.paint; },
    get exterior() { return [...mounted.values()]; }, get exteriorEffects() { return exteriorEffects([...mounted.values()]); },
    get fitment() { return calculateFitment(car, car.wheels.stock, appearance.rideHeightM); },
    setAppearance(value) { appearance = value; },
    async equipBodyPart(socket, fitting) {
      if (fitting) mounted.set(socket, { part: fitting.part, look: resolveBodyPartLook(fitting.part, {
        condition: fitting.condition, finish: fitting.finish, bodyColor: appearance.paint, vehicleTags: car.tags,
      }) });
      else mounted.delete(socket);
      return true;
    },
  };
  release.push(() => bridge.dispose(), bindGameUiStore(bridge.ui), bindMarketStore(bridge.ui.events), bindMaintenanceStore(bridge.ui.events));
  const customization = new CustomizationSystem(bridge.runtime, inventory, vehicle, () => rejection);
  const exterior = new ExteriorSystem(bridge.runtime, inventory, vehicle, () => rejection);
  release.push(() => customization.dispose(), () => exterior.dispose());
  bridge.runtime.emit('repairQuote', session.quote(car));
  bridge.runtime.handle('dismissRepair', () => bridge.runtime.emit('repairQuote', null));
  act(() => root.render(<RepairPanel />));
  return { inventory, grant, vehicle, bridge, block: () => { rejection = 'Bring the car back to the talyer.'; } };
}

it('installs, refinishes and removes owned parts without opening the phone', async () => {
  const { inventory, vehicle } = setup();
  expect(useMarketStore.getState().view).toBeNull();
  await click(button('Exterior parts'));
  expect(container.textContent).toContain('Dalagan ducktail');
  await click(button('Install part'));
  expect(vehicle.exterior).toHaveLength(1);
  expect(container.textContent).toContain('Fitted · flush · clean');
  const select = container.querySelector('select')!;
  await act(async () => { change(select, 'primer'); });
  expect(vehicle.exterior[0].look.finish).toBe('primer');
  expect(inventory.items()[0].finish).toBe('primer');
  await click(button('Remove part'));
  expect(vehicle.exterior).toEqual([]);
  expect(inventory.items()).toHaveLength(1);
  expect(inventory.installedOn(car.id)).toEqual({});
});

it('resprays body-colour parts and saves suspension settings with a rubbing warning', async () => {
  const { inventory, vehicle } = setup();
  await click(button('Exterior parts')); await click(button('Install part'));
  await click(button('Paint booth')); await click(container.querySelector<HTMLButtonElement>('[aria-label="Choose #8e2a2a"]')!);
  expect(inventory.appearance(car.id)?.paint).toBe('#8e2a2a');
  expect(vehicle.exterior[0].look.color).toBe('#8e2a2a');
  await click(button('Suspension'));
  act(() => { change(container.querySelector<HTMLInputElement>('[aria-label="Ride height"]')!, '-60'); });
  expect(inventory.appearance(car.id)?.rideHeightM).toBe(-0.06);
  expect(container.textContent).toContain('Rubbing');
  const restored = new InventorySession(JSON.parse(JSON.stringify(inventory.snapshot())));
  expect(restored.appearance(car.id)).toEqual({ paint: '#8e2a2a', rideHeightM: -0.06 });
  expect(restored.installedOn(car.id)).toEqual(inventory.installedOn(car.id));
});

it('shows empty inventory and rejects workshop changes after access is lost', async () => {
  const { block, inventory } = setup(false);
  await click(button('Exterior parts'));
  expect(container.textContent).toContain('No exterior parts');
  await click(button('Paint booth'));
  block(); await click(container.querySelector<HTMLButtonElement>('[aria-label="Choose #8e2a2a"]')!);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('back to the talyer');
  expect(inventory.appearance(car.id)).toBeNull();
  await click(container.querySelector<HTMLButtonElement>('[aria-label="Close inspection"]')!);
  expect(container.querySelector('[aria-label="Talyer inspection and repair"]')).toBeNull();
});
