// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameBridge } from '@/game/bridge';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles/catalog';
import { MarketplaceSession } from '@/game-core/marketplace/MarketplaceSession';
import { MarketplaceService } from '@/game/marketplace/MarketplaceService';
import { TalyerPerformanceSystem } from '@/game/vehicles/TalyerPerformanceSystem';
import { bindPerformanceStore } from '@/state/performanceStore';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { RepairPanel } from './RepairPanel';

let root: Root, container: HTMLDivElement;
const cleanup: (() => void)[] = [];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); cleanup.splice(0).reverse().forEach(off => off()); container.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.startsWith(text))!;
const click = (element: HTMLElement) => act(() => element.click());
function setup(partId?: string, known = true) {
  const bridge = new GameBridge(), inventory = new InventorySession(), session = new VehicleSession();
  if (partId) inventory.add({ partId, condition: .57, revealedBy: known ? 'known' : null, origin: { kind: 'grant', reason: 'test' } });
  const market = new MarketplaceService(bridge.runtime, new MarketplaceSession(session, inventory));
  market.useWorkshop({ rejection: () => null });
  cleanup.push(() => bridge.dispose(), () => market.dispose(), bindGameUiStore(bridge.ui), bindMaintenanceStore(bridge.ui.events), bindPerformanceStore(bridge.ui.events));
  const system = new TalyerPerformanceSystem(bridge.runtime, inventory, session, car, () => null);
  cleanup.push(() => system.dispose());
  act(() => {
    bridge.runtime.emit('maintenanceState', session.summary(car)); bridge.runtime.emit('repairQuote', session.quote(car));
    root.render(<RepairPanel />);
  });
  click(button('Performance'));
  return { inventory, session, bridge };
}

it('opens from talyer services, previews stats, pays and shows receipt plus installed state', () => {
  const s = setup('cone_intake');
  expect(container.querySelector('[aria-label="Performance workshop"]')).not.toBeNull();
  click(button('Preview install'));
  expect(container.querySelector('table')?.textContent).toContain('Turbo lag');
  expect(container.querySelector('table')?.textContent).toContain('Before');
  expect(container.textContent).toContain('Cash after work: ₱4,750');
  expect(s.inventory.installedOn(car.id)).toEqual({});
  click(button('Pay ₱250'));
  expect(container.textContent).toContain('Paid ₱250 labor');
  expect(s.session.snapshot().walletPhp).toBe(4750);
  expect(button('Preview removal')).toBeDefined();
  expect(container.querySelector('[aria-label="Performance quote"]')).toBeNull();
});

it('hides condition until paid inspection and enables the preview afterward', () => {
  const s = setup('cone_intake', false);
  expect(container.textContent).toContain('Condition unknown'); expect(container.textContent).not.toContain('57%');
  click(button('Inspect · ₱150'));
  expect(container.textContent).toContain('57% condition'); expect(s.session.snapshot().walletPhp).toBe(4850);
  click(button('Preview install')); expect(button('Pay ₱250').disabled).toBe(false);
});

it('shows missing supports, disables incompatible installs and explains the empty inventory', () => {
  const s = setup('efi_conversion');
  expect(container.textContent).toContain('Requires Surplus EFI harness');
  expect(button('Preview install').disabled).toBe(true);
  act(() => { s.inventory.remove(s.inventory.items()[0].id); });
  expect(container.textContent).toContain('No performance parts');
  expect(button('Browse Marketplace')).toBeDefined();
});

it('disables payment when cash changes and clears quotes on tab switch', () => {
  const s = setup('cone_intake'); click(button('Preview install'));
  act(() => { s.session.spend(4900, { kind: 'fee', source: 'test', description: 'Other expense' }); });
  expect(button('Pay ₱250').disabled).toBe(true); expect(container.textContent).toContain('short ₱150');
  click(button('Repairs')); click(button('Performance'));
  expect(container.querySelector('[aria-label="Performance quote"]')).toBeNull();
});
