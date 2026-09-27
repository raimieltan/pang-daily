import type { PersistencePort } from '../persistence/PersistencePort';
import { discountedPrice, type SocialAccess } from '../social/eligibility';
import { opportunity } from '../social/opportunities';
import { z } from 'zod';
import type { PaintFinish } from '../exterior/BodyPart';
import type { VehicleSession } from '../maintenance/VehicleSession';
import type { InventoryItem, InventorySession, RevealMethod } from '../inventory/InventorySession';
import { partDefinition, type PartCategory } from '../parts/parts';
import { generateListing, GRADE_LABEL, listingSchema, listingView, seller, verdictFor, type Grade, type Listing, type ListingView, type Verdict } from './listings';

/** Visible listings at once; expired ones are replaced on the next sync. */
export const BOARD_SIZE = 8;
/** Mang Boy's fee to put a part on the bench and tell you what it really is. */
export const MECHANIC_INSPECTION_PHP = 150;

const marketSaveSchema = z.object({ version: z.literal(1), seed: z.number().int().nonnegative(), serial: z.number().int().nonnegative(),
  listings: z.array(listingSchema) });
export type MarketSave = z.infer<typeof marketSaveSchema>;

/** An inventory item as the phone shows it: condition only once revealed. */
export type OwnedPartView = {
  id: string; partId: string; title: string; category: PartCategory; paidPhp: number | null; seller: string | null; advertised: { grade: Grade; label: string } | null;
  installedOn: string | null;
  /** Body parts: the owner's refinish, null = as it came. */
  finish: PaintFinish | null;
  actual: { condition: number; label: string; verdict: Verdict | null; method: RevealMethod } | null;
};
export type MarketplaceView = { listings: ListingView[]; parts: OwnedPartView[]; inspectionFeePhp: number; nextExpirySeconds: number | null };
export type PartPurchase = { listingId: string; sellerId: string; part: OwnedPartView; pricePhp: number; transactionId: number };
export type PartInspection = { part: OwnedPartView; feePhp: number; transactionId: number };
type Wallet = Pick<VehicleSession, 'spend' | 'snapshot'>;
type Inventory = Pick<InventorySession, 'add' | 'reveal' | 'item' | 'items' | 'byKey' | 'installation' | 'subscribe'>;
const purchaseKey = (listingId: string) => `marketplace:${listingId}`;

/**
 * Marketplace authority (TECH_ARCHITECTURE §18): generates listings, holds their hidden actual
 * condition, and sells through the PAN-11 wallet into the shared inventory. Views are the only
 * thing that leaves it. Purchases are keyed by listing id in both the ledger and the inventory,
 * so a save that lost part of a purchase or inspection is settled on load, never charged twice.
 */
export class MarketplaceSession {
  private state: MarketSave;
  private remote?: PersistencePort & { marketplace(): Promise<ListingView[]> };
  get persistent() { return !!this.remote; }
  private remoteListings: ListingView[] = [];
  private remoteLoadedAt = 0;
  usePersistence(remote: PersistencePort & { marketplace(): Promise<ListingView[]> }) { this.remote = remote; this.state.listings = []; }
  async refresh() {
    if (!this.remote) { this.sync(); return; }
    this.remoteListings = await this.remote.marketplace(); this.remoteLoadedAt = this.now(); this.listeners.forEach(listener => listener());
  }
  async buyConfirmed(listingId: string, offerId?: string): Promise<PartPurchase | { rejected: string }> {
    if (!this.remote) return this.buy(listingId, offerId);
    const receipt = await this.remote.execute({ type: 'market_purchase', listingId, ...(offerId ? { offerId } : {}) });
    const item = receipt.resourceId && this.inventory.item(receipt.resourceId);
    if (!item) throw new Error('The purchase committed but its inventory could not be loaded. Reload your save.');
    this.remoteListings = this.remoteListings.filter(listing => listing.id !== listingId);
    this.listeners.forEach(listener => listener());
    return { listingId, sellerId: String(receipt.details.sellerId), part: this.partView(item), pricePhp: Number(receipt.details.pricePhp), transactionId: Number(receipt.sequence) };
  }
  async inspectConfirmed(itemId: string): Promise<PartInspection | { rejected: string }> {
    if (!this.remote) return this.inspect(itemId);
    const receipt = await this.remote.execute({ type: 'part_inspect', partId: itemId });
    const item = this.inventory.item(itemId); if (!item) throw new Error('Inspected part could not be loaded.');
    return { part: this.partView(item), feePhp: MECHANIC_INSPECTION_PHP, transactionId: Number(receipt.sequence) };
  }
  private socialAccess?: SocialAccess;
  useSocialAccess(access: SocialAccess) { this.socialAccess = access; }
  private readonly listeners = new Set<() => void>();

  constructor(private readonly wallet: Wallet, private readonly inventory: Inventory, saved?: unknown,
    private readonly persist?: (save: MarketSave) => void, private readonly now: () => number = Date.now, seed = Math.floor(Math.random() * 2 ** 31)) {
    const parsed = marketSaveSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, seed, serial: 0, listings: [] };
    this.state.listings = this.state.listings.filter(l => partDefinition(l.templateId));
    this.settleFromLedger();
    this.sync(true);
    // Owned parts show on the phone, so inventory changes (installs, reveals) republish too.
    inventory.subscribe(() => this.listeners.forEach(listener => listener()));
  }

  snapshot(): MarketSave { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  /** Drops expired listings and posts fresh ones. The first fill staggers expiry so the board turns over gradually. */
  sync(initial = false): boolean {
    if (this.remote) return false;
    const now = this.now(), before = this.state.listings.length;
    this.state.listings = this.state.listings.filter(l => l.expiresAt > now);
    let changed = this.state.listings.length !== before;
    const stagger = initial && this.state.listings.length === 0;
    while (this.state.listings.length < BOARD_SIZE) {
      const serial = ++this.state.serial;
      const listing = generateListing(this.state.seed ^ Math.imul(serial, 0x9e3779b1), `listing-${serial}`, now);
      // Pretend a fresh board was posted over the last while, so not everything expires at once.
      if (stagger) { const age = Math.floor((listing.expiresAt - now) * this.state.listings.length / BOARD_SIZE); listing.postedAt -= age; listing.expiresAt -= age; }
      this.state.listings.push(listing); changed = true;
    }
    if (changed) this.changed();
    return changed;
  }

  view(): MarketplaceView {
    const now = this.now();
    const listings = [...this.state.listings].sort((a, b) => b.postedAt - a.postedAt);
    const age = Math.max(0, Math.floor((now - this.remoteLoadedAt) / 1000));
    const remoteViews = this.remoteListings.map(listing => ({ ...listing, expiresInSeconds: Math.max(0, listing.expiresInSeconds - age), postedSecondsAgo: listing.postedSecondsAgo + age }));
    return {
      listings: this.remote ? structuredClone(remoteViews) : listings.map(l => ({ ...listingView(l, now), ...this.offer(l) })), parts: this.inventory.items().map(item => this.partView(item)),
      inspectionFeePhp: MECHANIC_INSPECTION_PHP,
      nextExpirySeconds: this.remote ? (remoteViews.length ? Math.min(...remoteViews.map(view => view.expiresInSeconds)) : 0) : listings.length ? Math.max(0, Math.ceil((Math.min(...listings.map(l => l.expiresAt)) - now) / 1000)) : null,
    };
  }

  buy(listingId: string, offerId?: string): PartPurchase | { rejected: string } {
    this.sync();
    const listing = this.state.listings.find(l => l.id === listingId);
    if (!listing) return { rejected: 'Sorry boss, sold na / listing expired.' };
    let pricePhp = listing.askingPricePhp;
    if (offerId) {
      if (offerId !== 'jun_suki_offer') return { rejected: 'Unknown seller offer.' };
      const rule = opportunity(offerId);
      if (rule.benefit.kind !== 'seller' || listing.sellerId !== rule.benefit.sellerId) return { rejected: 'This seller offer does not apply to that listing.' };
      const access = this.socialAccess?.(offerId);
      if (!access?.eligible) return { rejected: `Seller offer unavailable. ${access?.unmetRequirements.join('; ') ?? 'Ask for a current offer.'}` };
      pricePhp = discountedPrice(listing.askingPricePhp, rule.benefit.discountPercent);
    }
    const payment = this.wallet.spend(pricePhp, { kind: 'parts_purchase', description: `Marketplace: ${partDefinition(listing.templateId)!.name}`,
      source: `marketplace:${listing.sellerId}`, relatedEntityId: listing.id });
    if ('rejected' in payment) return { rejected: payment.rejected };
    const item = this.deliver(listing, pricePhp);
    if ('rejected' in item) return item; // Unreachable for catalog parts; the ledger replay retries on load.
    return { listingId, sellerId: listing.sellerId, part: this.partView(item), pricePhp, transactionId: payment.id };
  }

  /** Paid reveal of an owned item's true condition. Any inventory item can go on the bench. */
  inspect(itemId: string, method: RevealMethod = 'mechanic'): PartInspection | { rejected: string } {
    const item = this.inventory.item(itemId);
    if (!item) return { rejected: 'You do not have that part.' };
    if (item.revealedBy) return { rejected: 'Already inspected.' };
    const payment = this.wallet.spend(MECHANIC_INSPECTION_PHP, { kind: 'part_inspection', description: `Inspection: ${partDefinition(item.partId)!.name}`, source: 'talyer', relatedEntityId: item.id });
    if ('rejected' in payment) return { rejected: payment.rejected };
    const revealed = this.inventory.reveal(itemId, method);
    if ('rejected' in revealed) return revealed;
    return { part: this.partView(revealed), feePhp: MECHANIC_INSPECTION_PHP, transactionId: payment.id };
  }

  /** Inventory first (keyed, so repeatable), then take the listing down. */
  private deliver(listing: Listing, paidPhp = listing.askingPricePhp) {
    const item = this.inventory.add({ partId: listing.templateId, condition: listing.actualCondition, key: purchaseKey(listing.id),
      origin: { kind: 'marketplace', listingId: listing.id, sellerId: listing.sellerId, paidPhp, advertisedGrade: listing.advertisedGrade } });
    this.state.listings = this.state.listings.filter(l => l.id !== listing.id);
    this.changed();
    return item;
  }

  /** The wallet saves first; replay anything it recorded that the inventory or this save missed. */
  private settleFromLedger() {
    for (const tx of this.wallet.snapshot().transactions) {
      if (!tx.relatedEntityId) continue;
      if (tx.kind === 'parts_purchase') {
        const listing = this.state.listings.find(l => l.id === tx.relatedEntityId);
        if (listing) this.deliver(listing, -tx.amountPhp);
      } else if (tx.kind === 'part_inspection') {
        const item = this.inventory.item(tx.relatedEntityId);
        if (item && !item.revealedBy) this.inventory.reveal(item.id, 'mechanic');
      }
    }
  }

  private offer(listing: Listing): { offerId?: string; offerPricePhp?: number; offerLabel?: string } {
    const rule = opportunity('jun_suki_offer');
    if (rule.benefit.kind !== 'seller' || listing.sellerId !== rule.benefit.sellerId || !this.socialAccess?.(rule.id).eligible) return {};
    return { offerId: rule.id, offerPricePhp: discountedPrice(listing.askingPricePhp, rule.benefit.discountPercent), offerLabel: rule.name };
  }

  private partView(item: InventoryItem): OwnedPartView {
    const origin = item.origin.kind === 'marketplace' ? item.origin : null;
    const shown = item.revealedBy && item.condition !== null ? item.condition : null;
    const part = partDefinition(item.partId)!;
    return {
      id: item.id, partId: item.partId, title: part.name, category: part.category, paidPhp: item.origin.kind === 'grant' ? null : item.origin.paidPhp,
      seller: origin ? seller(origin.sellerId)?.name ?? 'Unknown seller' : item.origin.kind === 'parts_shop' ? 'Banwa Auto Supply' : null,
      advertised: origin ? { grade: origin.advertisedGrade, label: GRADE_LABEL[origin.advertisedGrade] } : null,
      installedOn: this.inventory.installation(item.id)?.vehicleId ?? null, finish: item.finish,
      actual: shown === null ? null : { condition: shown, label: `${Math.round(shown * 100)}%`, verdict: origin ? verdictFor(origin.advertisedGrade, shown) : null, method: item.revealedBy! },
    };
  }

  private changed() {
    try { this.persist?.(this.snapshot()); } catch { /* Keep the in-memory market if storage fails, as VehicleSession does. */ }
    this.listeners.forEach(listener => listener());
  }
}
