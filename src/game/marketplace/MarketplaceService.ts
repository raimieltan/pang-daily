import type { MarketplaceSession } from '../../game-core/marketplace/MarketplaceSession';
import type { CommandOutcome, RuntimePort } from '../bridge';

/** Where a part can go on the bench. Scenes with a talyer register one; null means "you can inspect here". */
export type Workshop = { rejection(): string | null };
const NO_WORKSHOP = 'Bring the part to Mang Boy’s talyer to have it inspected.';
/** Countdowns on the phone refresh at this rate while it is open. */
const VIEW_INTERVAL_S = 1;

/**
 * Runtime-level adapter: the phone works in every scene, so browsing and buying are not
 * scene systems. Scenes lend a `Workshop` for inspections. Listings, prices, hidden
 * condition and payment are decided by `MarketplaceSession`; this only routes and publishes.
 */
export class MarketplaceService {
  private open = false;
  private elapsed = 0;
  private workshop: Workshop | null = null;
  private readonly release: (() => void)[];

  constructor(private readonly bridge: RuntimePort, private readonly market: MarketplaceSession) {
    this.release = [
      market.subscribe(() => this.publish()),
      bridge.handle('openMarketplace', () => { this.open = true; market.sync(); this.publish(); }),
      bridge.handle('closeMarketplace', () => { this.open = false; bridge.emit('marketplace', null); }),
      bridge.handle('buyListing', ({ listingId }) => this.buy(listingId)),
      bridge.handle('inspectPart', ({ partId }) => this.inspect(partId)),
    ];
  }

  /** Lend the scene's talyer; returns the release to call on scene teardown. */
  useWorkshop(workshop: Workshop): () => void {
    this.workshop = workshop;
    return () => { if (this.workshop === workshop) this.workshop = null; };
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    if (this.elapsed < VIEW_INTERVAL_S) return;
    this.elapsed = 0;
    // Expiry runs even with the phone closed, so the board has moved on when you come back.
    if (!this.market.sync() && this.open) this.publish();
  }

  private buy(listingId: string): CommandOutcome {
    const result = this.market.buy(listingId);
    if ('rejected' in result) return result;
    this.bridge.emit('partPurchased', result);
  }

  private inspect(partId: string): CommandOutcome {
    const rejection = this.workshop ? this.workshop.rejection() : NO_WORKSHOP;
    if (rejection) return { rejected: rejection };
    const result = this.market.inspect(partId);
    if ('rejected' in result) return result;
    this.bridge.emit('partInspected', result);
  }

  private publish() { if (this.open) this.bridge.emit('marketplace', this.market.view()); }

  dispose() { this.release.forEach(off => off()); }
}
