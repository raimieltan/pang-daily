import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { CarDealerView, CarDealerQuote, CarPurchase } from '@/game/marketplace/CarDealerSystem';
type State = { view: CarDealerView | null; quote: CarDealerQuote | null; receipt: CarPurchase | null; error: string | null };
const initial: State = { view: null, quote: null, receipt: null, error: null };
export const useCarDealerStore = create<State>(() => initial);
export function bindCarDealerStore(events: GameEventSource) {
  const set = useCarDealerStore.setState;
  const release = [
    events.on('carDealer', view => set(view ? { view } : initial)),
    events.on('carDealerQuote', quote => set({ quote, error: null, ...(quote ? { receipt: null } : {}) })),
    events.on('carPurchased', receipt => set({ receipt, error: null })),
    events.on('commandRejected', ({ command, reason }) => { if (['openCarDealer', 'quoteCar', 'buyCar'].includes(command)) set({ error: reason }); }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
