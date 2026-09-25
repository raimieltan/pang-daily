import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { WheelsView } from '@/game/vehicles/WheelSystem';
import type { MarketplaceView, PartInspection, PartPurchase } from '@/game-core/marketplace/MarketplaceSession';
type Board = { view: MarketplaceView | null; purchase: PartPurchase | null; inspection: PartInspection | null; error: string | null };
type State = Board & { wheels: WheelsView | null };
const board: Board = { view: null, purchase: null, inspection: null, error: null };
const initial: State = { ...board, wheels: null };
export const useMarketStore = create<State>(() => initial);
const MARKET_COMMANDS = new Set(['openMarketplace', 'buyListing', 'inspectPart', 'equipWheels']);
/** Read-only board snapshots. Listings, hidden condition and payment are decided game-side. */
export function bindMarketStore(events: GameEventSource) {
  const set = useMarketStore.setState;
  const release = [
    // Closing the board keeps the car's wheel state: it comes from the scene, not the board.
    events.on('marketplace', view => set(view ? { view } : board)),
    events.on('partPurchased', purchase => set({ purchase, inspection: null, error: null })),
    events.on('partInspected', inspection => set({ inspection, purchase: null, error: null })),
    events.on('wheelsState', wheels => set({ wheels, error: null })),
    events.on('commandRejected', ({ command, reason }) => { if (MARKET_COMMANDS.has(command)) set({ error: reason }); }),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
