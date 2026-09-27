import { afterEach, expect, it } from 'vitest';
import { GameBridge } from '../bridge';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { AutoPartsShopSystem, autoPartsShopRejection, type AutoPartsQuote } from './AutoPartsShopSystem';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { interactablesFromZones, resolveInteraction } from '../interaction/Interaction';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { PlayerMode } from '../player/PlayerMode';

const release: (() => void)[] = [];
afterEach(() => release.splice(0).reverse().forEach(off => off()));
const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap(c => c.zones));
function setup() {
  const bridge = new GameBridge(), wallet = new VehicleSession(), inventory = new InventorySession();
  wallet.earn(50000, { kind: 'test', description: 'Savings', source: 'test' });
  const focus = { position: new Vector3(58, 0, 150), mode: 'walking' as PlayerMode, racing: false };
  const interactions = new InteractionSystem(bridge.runtime, focus, [() => zones]);
  const shop = new AutoPartsShopSystem(bridge.runtime, wallet, inventory, interactions, () => autoPartsShopRejection(focus, zones));
  const result: { quote: AutoPartsQuote | null; open: boolean; errors: string[] } = { quote: null, open: false, errors: [] };
  bridge.ui.events.on('autoPartsShop', view => { result.open = !!view; });
  bridge.ui.events.on('autoPartsQuote', quote => { result.quote = quote; });
  bridge.ui.events.on('commandRejected', e => result.errors.push(e.reason));
  release.push(() => bridge.dispose(), () => interactions.dispose(), () => shop.dispose());
  return { bridge, wallet, inventory, focus, shop, result, commands: bridge.ui.commands };
}
it('opens at the authored counter, buys once on duplicate clicks and keeps stock available', () => {
  const s = setup();
  expect(resolveInteraction(zones, 58, 150, 'walking')?.action).toBe('browse_auto_parts');
  s.commands.interact(); expect(s.result.open).toBe(true);
  s.commands.quoteAutoPart('new_efi_wiring'); const quote = s.result.quote!;
  s.commands.buyAutoPart(quote.id); s.commands.buyAutoPart(quote.id);
  expect(s.inventory.items()).toHaveLength(1); expect(s.wallet.snapshot().walletPhp).toBe(37500);
  s.commands.quoteAutoPart('new_efi_wiring'); expect(s.result.quote).not.toBeNull();
  s.commands.buyAutoPart(s.result.quote!.id); expect(s.inventory.items()).toHaveLength(2);
});
it('requires walking at the counter, rejects remote payment and clears quotes on departure', () => {
  const s = setup(); s.focus.mode = 'driving'; s.commands.openAutoPartsShop(); expect(s.result.open).toBe(false);
  s.focus.mode = 'walking'; s.commands.openAutoPartsShop(); s.commands.quoteAutoPart('new_efi_wiring'); const id = s.result.quote!.id;
  s.focus.position.x = 16; s.commands.buyAutoPart(id); expect(s.result.open).toBe(false); expect(s.inventory.items()).toHaveLength(0);
  s.focus.position.x = 58; s.commands.openAutoPartsShop(); s.commands.quoteAutoPart('new_efi_wiring');
  s.focus.racing = true; s.shop.update(); expect(s.result.open).toBe(false); expect(s.result.quote).toBeNull();
});
it('rechecks funds, closes cleanly and rejects stale quotes after reopening', () => {
  const s = setup(); s.commands.openAutoPartsShop(); s.commands.quoteAutoPart('new_efi_wiring'); const id = s.result.quote!.id;
  s.wallet.spend(55000, { kind: 'test', description: 'Spent savings', source: 'test' });
  s.commands.buyAutoPart(id); expect(s.inventory.items()).toHaveLength(0); expect(s.result.errors.at(-1)).toMatch(/money/);
  s.commands.closeAutoPartsShop(); expect(s.result.open).toBe(false);
  s.commands.openAutoPartsShop(); s.commands.buyAutoPart(id); expect(s.result.errors.at(-1)).toMatch(/fresh/);
});
