import { it, expect } from 'vitest';
import { MarketplaceSession } from './MarketplaceSession';
import { generateListing, listingView } from './listings';
import { VehicleSession } from '../maintenance/VehicleSession';
import { InventorySession } from '../inventory/InventorySession';
it('keeps countdowns responsive from server metadata without generating authoritative client listings', async () => {
  let now = 100000;
  const market = new MarketplaceSession(new VehicleSession(), new InventorySession(), undefined, undefined, () => now);
  const listing = listingView(generateListing(123, 'server-listing', now, [10000,10000]), now);
  market.usePersistence({ marketplace: async () => [listing], execute: async () => { throw new Error('Not used'); } });
  await market.refresh(); expect(market.view().nextExpirySeconds).toBe(10);
  now += 3000; expect(market.view().listings[0].expiresInSeconds).toBe(7);
  now += 8000; expect(market.view().nextExpirySeconds).toBe(0);
  market.sync(); expect(market.snapshot().listings).toEqual([]);
});
