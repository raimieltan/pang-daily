import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { MarketplaceView, PartInspection, PartPurchase } from '@/game-core/marketplace/MarketplaceSession';
type State = { view: MarketplaceView | null; purchase: PartPurchase | null; inspection: PartInspection | null; error: string | null };
const initial: State = { view: null, purchase: null, inspection: null, error: null };
export const useMarketStore = create<State>(() => initial);
const MARKET_COMMANDS = new Set(['openMarketplace', 'buyListing', 'inspectPart']);
/** Read-only board snapshots. Listings, hidden condition and payment are decided game-side. */
export function bindMarketStore(events: GameEventSource) {
  const set = useMarketStore.setState;
  const release = [
    events.on('marketplace', view => set(view ? { view } : initial)),
    events.on('partPurchased', purchase => set({ purchase, inspection: null, error: null })),
    events.on('partInspected', inspection => set({ inspection, purchase: null, error: null })),
    events.on('commandRejected', ({ command, reason }) => { if (MARKET_COMMANDS.has(command)) set({ error: reason }); }),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
