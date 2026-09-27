// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AutoPartsShopPanel } from './AutoPartsShopPanel';
import { GameBridge } from '@/game/bridge';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { AutoPartsShopSystem } from '@/game/marketplace/AutoPartsShopSystem';
import { bindAutoPartsStore } from '@/state/autoPartsStore';
import { bindGameUiStore } from '@/state/gameUiStore';
let root: Root, container: HTMLDivElement;
const release: (() => void)[] = [];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); release.splice(0).reverse().forEach(off => off()); container.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.startsWith(label))!;
const click = (element: HTMLElement) => act(() => element.click());
function setup(funds = 50000) {
  const bridge = new GameBridge(), inventory = new InventorySession(), wallet = new VehicleSession();
  if (funds) wallet.earn(funds, { kind: 'test', source: 'test', description: 'Savings' });
  release.push(() => bridge.dispose(), bindGameUiStore(bridge.ui), bindAutoPartsStore(bridge.ui.events));
  const shop = new AutoPartsShopSystem(bridge.runtime, wallet, inventory, { handle: () => () => {} }, () => null);
  release.push(() => shop.dispose());
  act(() => { root.render(<AutoPartsShopPanel />); bridge.ui.commands.openAutoPartsShop(); });
  return { wallet, inventory };
}
it('shows the guaranteed harness, five-times pricing and confirmed new-condition purchase', () => {
  const s = setup();
  expect(container.textContent).toContain('100% condition'); expect(container.textContent).toContain('₱3,500 × 5');
  click(button('Select New EFI harness')); expect(s.inventory.items()).toHaveLength(0);
  expect(container.textContent).toContain('Cash after purchase: ₱37,500');
  click(button('Pay ₱17,500'));
  expect(container.querySelector('[role="status"]')?.textContent).toContain('no inspection fee');
  expect(s.inventory.items()[0]).toMatchObject({ partId: 'new_efi_wiring', condition: 1, revealedBy: 'known' });
  click(button('Close shop')); expect(container.querySelector('[aria-label="Auto parts shop"]')).toBeNull();
});
it('keeps unaffordable purchases disabled with a readable shortfall', () => {
  const s = setup(0); click(button('Select New EFI harness'));
  expect(button('Pay ₱17,500').disabled).toBe(true); expect(container.textContent).toContain('Short ₱12,500');
  expect(s.wallet.snapshot().walletPhp).toBe(5000); expect(s.inventory.items()).toEqual([]);
});
