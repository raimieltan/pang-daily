import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { AutoPartsShopView, AutoPartsQuote } from '@/game/marketplace/AutoPartsShopSystem';
import type { AutoPartsPurchase } from '@/game-core/shops/AutoPartsShop';
type State = { view: AutoPartsShopView | null; quote: AutoPartsQuote | null; receipt: AutoPartsPurchase | null; error: string | null };
const initial: State = { view: null, quote: null, receipt: null, error: null };
export const useAutoPartsStore = create<State>(() => initial);
export function bindAutoPartsStore(events: GameEventSource) {
  const set = useAutoPartsStore.setState;
  const release = [
    events.on('autoPartsShop', view => set(view ? { view } : initial)),
    events.on('autoPartsQuote', quote => set({ quote, error: null, ...(quote ? { receipt: null } : {}) })),
    events.on('autoPartPurchased', receipt => set({ receipt, error: null })),
    events.on('commandRejected', ({ command, reason }) => { if (['openAutoPartsShop', 'quoteAutoPart', 'buyAutoPart'].includes(command)) set({ error: reason }); }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
