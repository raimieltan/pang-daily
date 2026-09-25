import { describe, expect, it } from 'vitest';
import { VehicleSession } from '../maintenance/VehicleSession';
import { GRADES, generateListing, gradeFor, listingView, verdictFor } from './listings';
import { InventorySession, type InventorySave } from '../inventory/InventorySession';
import { BOARD_SIZE, MarketplaceSession, MECHANIC_INSPECTION_PHP, type MarketSave } from './MarketplaceSession';

function setup(saved?: unknown, wallet = new VehicleSession(), savedInventory?: unknown) {
  let time = 1_000_000;
  const saves: MarketSave[] = [], inventorySaves: InventorySave[] = [];
  const inventory = new InventorySession(savedInventory, save => inventorySaves.push(save), () => time);
  const market = new MarketplaceSession(wallet, inventory, saved, save => saves.push(save), () => time, 42);
  return { market, wallet, inventory, saves, inventorySaves, advance: (ms: number) => { time += ms; } };
}
const cheapest = (market: MarketplaceSession) => [...market.view().listings].sort((a, b) => a.askingPricePhp - b.askingPricePhp)[0];

describe('listing generation', () => {
  it('is deterministic per seed and always within template bounds', () => {
    expect(generateListing(7, 'a', 0)).toEqual(generateListing(7, 'a', 0));
    for (let seed = 0; seed < 500; seed++) {
      const l = generateListing(seed, `l${seed}`, 0);
      expect(l.actualCondition).toBeGreaterThanOrEqual(0);
      expect(l.actualCondition).toBeLessThanOrEqual(1);
      expect(l.askingPricePhp % 50).toBe(0);
      expect(l.expiresAt).toBeGreaterThan(l.postedAt);
    }
  });
  it('advertises honestly or oversells, with rare undersold finds', () => {
    const verdicts = new Set(Array.from({ length: 800 }, (_, seed) => {
      const l = generateListing(seed, 'x', 0);
      return verdictFor(l.advertisedGrade, l.actualCondition);
    }));
    expect(verdicts).toEqual(new Set(['as_described', 'oversold', 'scammed', 'better']));
    expect(gradeFor(.9)).toBe('like_new');
    expect(gradeFor(.1)).toBe('as_is');
  });
  it('never exposes the actual condition in a listing view', () => {
    const listing = generateListing(3, 'x', 0);
    const view = listingView(listing, 60_000);
    expect(JSON.stringify(view)).not.toContain('actual');
    expect(Object.values(view)).not.toContain(listing.actualCondition);
    expect(view.postedSecondsAgo).toBe(60);
    expect(GRADES).toContain(view.advertised.grade);
  });
});

describe('MarketplaceSession', () => {
  it('fills the board with staggered expiry, then replaces expired listings', () => {
    const { market, advance } = setup();
    const first = market.view();
    expect(first.listings).toHaveLength(BOARD_SIZE);
    const expiries = first.listings.map(l => l.expiresInSeconds);
    expect(new Set(expiries).size).toBeGreaterThan(1);
    advance(first.nextExpirySeconds! * 1000);
    expect(market.sync()).toBe(true);
    const next = market.view();
    expect(next.listings).toHaveLength(BOARD_SIZE);
    expect(next.listings.map(l => l.id)).not.toEqual(first.listings.map(l => l.id));
    expect(market.sync()).toBe(false);
  });

  it('charges the asking price once, removes the listing and adds an unrevealed part', () => {
    const { market, wallet } = setup();
    const listing = cheapest(market);
    const bought = market.buy(listing.id);
    if ('rejected' in bought) throw new Error(bought.rejected);
    expect(bought.part).toMatchObject({ title: listing.title, paidPhp: listing.askingPricePhp, actual: null });
    expect(wallet.snapshot().walletPhp).toBe(5000 - listing.askingPricePhp);
    expect(market.view().listings.some(l => l.id === listing.id)).toBe(false);
    expect(market.buy(listing.id)).toHaveProperty('rejected');
    const txs = wallet.snapshot().transactions.filter(t => t.kind === 'parts_purchase');
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ relatedEntityId: listing.id, source: expect.stringMatching(/^marketplace:/) });
  });

  it('refuses expired listings and unaffordable parts without charging', () => {
    const { market, wallet, advance } = setup(undefined, new VehicleSession());
    wallet.spend(4990, { kind: 'test', description: 'broke', source: 'test' });
    expect(market.buy(cheapest(market).id)).toEqual({ rejected: 'Not enough money.' });
    const id = market.view().listings[0].id;
    advance(60 * 60_000);
    expect(market.buy(id)).toHaveProperty('rejected');
    expect(wallet.snapshot().walletPhp).toBe(10);
  });

  it('reveals the true condition only through a paid mechanic inspection', () => {
    const { market, wallet } = setup();
    const bought = market.buy(cheapest(market).id);
    if ('rejected' in bought) throw new Error(bought.rejected);
    const cash = wallet.snapshot().walletPhp;
    const inspected = market.inspect(bought.part.id);
    if ('rejected' in inspected) throw new Error(inspected.rejected);
    expect(inspected.part.actual).toMatchObject({ method: 'mechanic', verdict: expect.any(String) });
    expect(market.view().parts[0].actual?.condition).toBe(inspected.part.actual!.condition);
    expect(wallet.snapshot().walletPhp).toBe(cash - MECHANIC_INSPECTION_PHP);
    expect(market.inspect(bought.part.id)).toEqual({ rejected: 'Already inspected.' });
    expect(market.inspect('nope')).toHaveProperty('rejected');
  });

  it('buys into the shared inventory with the listing’s hidden condition and origin', () => {
    const { market, inventory } = setup();
    const listing = cheapest(market);
    const bought = market.buy(listing.id);
    if ('rejected' in bought) throw new Error(bought.rejected);
    const [item] = inventory.items();
    expect(item).toMatchObject({ id: bought.part.id, revealedBy: null, key: `marketplace:${listing.id}`,
      origin: { kind: 'marketplace', listingId: listing.id, paidPhp: listing.askingPricePhp, advertisedGrade: listing.advertised.grade } });
    expect(item.condition).toBeTypeOf('number');
  });

  it('settles a purchase or inspection that a lost save missed, without charging or adding twice', () => {
    const { market, wallet, saves, inventorySaves } = setup();
    const marketBefore = saves.at(-1)!;
    const bought = market.buy(cheapest(market).id);
    if ('rejected' in bought) throw new Error(bought.rejected);
    const inventoryAfterBuy = inventorySaves.at(-1)!;
    // Both saves lost after the wallet recorded payment: reload delivers once.
    const lostBoth = setup(marketBefore, wallet);
    expect(lostBoth.inventory.items()).toHaveLength(1);
    // Only the market save lost: the keyed add finds the existing item instead of copying it.
    const lostMarket = setup(marketBefore, wallet, inventoryAfterBuy);
    expect(lostMarket.inventory.items().map(i => i.id)).toEqual([bought.part.id]);
    expect(lostMarket.market.view().listings.some(l => l.id === bought.listingId)).toBe(false);
    lostMarket.market.inspect(bought.part.id);
    // Inspection paid but the inventory reveal was lost: reload reveals, no second fee.
    const lostReveal = setup(lostMarket.saves.at(-1), wallet, inventoryAfterBuy);
    expect(lostReveal.market.view().parts[0].actual).not.toBeNull();
    expect(wallet.snapshot().transactions.filter(t => t.kind === 'part_inspection')).toHaveLength(1);
    expect(wallet.snapshot().transactions.filter(t => t.kind === 'parts_purchase')).toHaveLength(1);
    expect(setup({ version: 99 }).market.view().listings).toHaveLength(BOARD_SIZE);
  });
});
