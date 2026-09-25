// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarketplaceApp } from './MarketplaceApp';
import { GameBridge } from '@/game/bridge';
import { MarketplaceService } from '@/game/marketplace/MarketplaceService';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { MarketplaceSession } from '@/game-core/marketplace/MarketplaceSession';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { bindMarketStore } from '@/state/marketStore';
import { bindGameUiStore } from '@/state/gameUiStore';

const release: (() => void)[] = [];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); release.splice(0).reverse().forEach(off => off()); vi.unstubAllGlobals(); });
const click = (element: Element) => act(() => (element as HTMLElement).click());
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(el => el.textContent?.startsWith(text))!;
function setup() {
  const bridge = new GameBridge(), wallet = new VehicleSession();
  const market = new MarketplaceSession(wallet, new InventorySession(), undefined, undefined, () => 1_000_000, 5);
  const service = new MarketplaceService(bridge.runtime, market);
  release.push(() => bridge.dispose(), () => service.dispose(), bindGameUiStore(bridge.ui), bindMarketStore(bridge.ui.events));
  act(() => root.render(<MarketplaceApp />));
  act(() => bridge.ui.commands.openMarketplace());
  return { bridge, wallet, market, service };
}

it('browses listings with price, place and advertised condition but never the hidden condition', () => {
  const { market } = setup();
  const cards = container.querySelectorAll('ul li button');
  expect(cards).toHaveLength(8);
  click(cards[0]);
  expect(container.querySelector('[data-testid="advertised-grade"]')?.textContent).toBeTruthy();
  expect(container.textContent).toMatch(/★ \d\.\d/);
  expect(container.textContent).toContain('listing ends in');
  const hidden = market.snapshot().listings.map(l => `${Math.round(l.actualCondition * 100)}%`);
  for (const pct of hidden) expect(container.textContent).not.toContain(pct);
});

it('buys after confirmation, then reveals true condition at the talyer', () => {
  const { wallet, service } = setup();
  const priced = Array.from(container.querySelectorAll('ul li button')).map(el => ({ el, price: Number(el.getAttribute('aria-label')!.split('₱')[1].replace(/,/g, '')) }));
  const target = priced.sort((a, b) => a.price - b.price)[0];
  click(target.el);
  click(button('Buy now'));
  expect(wallet.snapshot().walletPhp).toBe(5000);
  click(button('Pay '));
  expect(wallet.snapshot().walletPhp).toBe(5000 - target.price);
  expect(container.querySelector('[role="status"]')?.textContent).toContain('in your trunk');
  click(button('Your parts'));
  expect(container.querySelectorAll('[data-testid="owned-part"]')).toHaveLength(1);
  click(button('Have Mang Boy inspect'));
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/talyer/);
  release.push(service.useWorkshop({ rejection: () => null }));
  click(button('Have Mang Boy inspect'));
  expect(container.querySelector('[data-testid="actual-condition"]')?.textContent).toMatch(/^\d+%$/);
  expect(wallet.snapshot().walletPhp).toBe(5000 - target.price - 150);
  click(container.querySelector('[aria-label="Close marketplace"]')!);
  expect(container.querySelector('[aria-label="Baligya marketplace"]')).toBeNull();
});
