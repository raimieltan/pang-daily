import { expect, it } from 'vitest';
import { GameBridge } from '../bridge';
import type { MarketplaceView } from '../../game-core/marketplace/MarketplaceSession';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { MarketplaceSession } from '../../game-core/marketplace/MarketplaceSession';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { MarketplaceService } from './MarketplaceService';

function setup() {
  let time = 0;
  const bridge = new GameBridge(), wallet = new VehicleSession();
  const market = new MarketplaceSession(wallet, new InventorySession(), undefined, undefined, () => time, 9);
  const service = new MarketplaceService(bridge.runtime, market);
  const views: (MarketplaceView | null)[] = [], rejected: string[] = [];
  bridge.ui.events.on('marketplace', view => views.push(view));
  bridge.ui.events.on('commandRejected', ({ reason }) => rejected.push(reason));
  return { bridge, wallet, service, views, rejected, commands: bridge.ui.commands, advance: (ms: number) => { time += ms; } };
}

it('publishes only while open and routes purchases through the session', () => {
  const { commands, views, wallet, service } = setup();
  service.update(2);
  expect(views).toHaveLength(0);
  commands.openMarketplace();
  const listing = views.at(-1)!.listings.sort((a, b) => a.askingPricePhp - b.askingPricePhp)[0];
  commands.buyListing(listing.id);
  expect(views.at(-1)!.parts).toHaveLength(1);
  expect(wallet.snapshot().walletPhp).toBe(5000 - listing.askingPricePhp);
  commands.closeMarketplace();
  expect(views.at(-1)).toBeNull();
});

it('inspects only where a scene lends a workshop that accepts the visit', () => {
  const { commands, views, rejected, service } = setup();
  commands.openMarketplace();
  const listing = views.at(-1)!.listings.sort((a, b) => a.askingPricePhp - b.askingPricePhp)[0];
  commands.buyListing(listing.id);
  const partId = views.at(-1)!.parts[0].id;
  commands.inspectPart(partId);
  expect(rejected.at(-1)).toMatch(/talyer/);
  let blocked: string | null = 'Park at the talyer and get out to talk to Mang Boy.';
  const release = service.useWorkshop({ rejection: () => blocked });
  commands.inspectPart(partId);
  expect(rejected.at(-1)).toBe(blocked);
  blocked = null;
  commands.inspectPart(partId);
  expect(views.at(-1)!.parts[0].actual).not.toBeNull();
  release();
  commands.inspectPart(partId);
  expect(rejected.at(-1)).toMatch(/talyer/);
});

it('ticks countdowns ~1 Hz and refreshes the board as listings expire', () => {
  const { commands, views, service, advance } = setup();
  commands.openMarketplace();
  const first = views.at(-1)!;
  const count = views.length;
  service.update(.5);
  expect(views).toHaveLength(count);
  advance(1000); service.update(.6);
  expect(views).toHaveLength(count + 1);
  advance(first.nextExpirySeconds! * 1000); service.update(1);
  expect(views.at(-1)!.listings.map(l => l.id)).not.toEqual(first.listings.map(l => l.id));
});
