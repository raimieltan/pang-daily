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
import { WheelSystem } from '@/game/vehicles/WheelSystem';
import { BANWA_DALAGAN_1996 } from '@/game-core/vehicles';
import { calculateFitment, type WheelPart } from '@/game-core/wheels';

const release: (() => void)[] = [];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); release.splice(0).reverse().forEach(off => off()); vi.unstubAllGlobals(); });
const click = (element: Element) => act(() => (element as HTMLElement).click());
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(el => el.textContent?.startsWith(text))!;
function setup() {
  const bridge = new GameBridge(), wallet = new VehicleSession(), inventory = new InventorySession();
  const market = new MarketplaceSession(wallet, inventory, undefined, undefined, () => 1_000_000, 5);
  const service = new MarketplaceService(bridge.runtime, market);
  release.push(() => bridge.dispose(), () => service.dispose(), bindGameUiStore(bridge.ui), bindMarketStore(bridge.ui.events));
  act(() => root.render(<MarketplaceApp />));
  act(() => bridge.ui.commands.openMarketplace());
  return { bridge, wallet, market, service, inventory };
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

it('bolts an owned wheel set on and takes it off, showing fitment and listed effects', async () => {
  const { bridge, inventory } = setup();
  const car = BANWA_DALAGAN_1996;
  let current: WheelPart | null = null;
  const wheels = new WheelSystem(bridge.runtime, inventory, {
    id: car.id, definition: { spec: car },
    get fitment() { return calculateFitment(car, current?.fit ?? car.wheels.stock); },
    equipWheels: async part => { current = part; return true; },
  });
  release.push(() => wheels.dispose());
  const flush = () => act(() => new Promise(resolve => setTimeout(resolve)));
  act(() => { inventory.add({ partId: 'oversized_17_deep_dish', condition: 0.3, origin: { kind: 'grant', reason: 'test' } }); });
  click(button('Your parts'));
  expect(container.querySelector('[data-testid="wheel-fitment"]')).toBeNull();

  click(button('Bolt on'));
  await flush();
  expect(container.textContent).toContain('Installed on your car');
  expect(container.querySelector('[data-testid="wheel-fitment"]')?.textContent).toBe('Poke · grip +4% · braking -4% · acceleration -6% · +24 kg');

  click(button('Take off'));
  await flush();
  expect(container.textContent).not.toContain('Installed on your car');
  expect(container.querySelector('[data-testid="wheel-fitment"]')).toBeNull();
  expect(button('Bolt on')).toBeTruthy();
});
