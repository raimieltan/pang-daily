import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { PerformanceQuote, PerformanceReceipt, PerformanceWorkshopView } from '@/game/vehicles/TalyerPerformanceSystem';

type State = { view: PerformanceWorkshopView | null; quote: PerformanceQuote | null; receipt: PerformanceReceipt | null; error: string | null };
const initial: State = { view: null, quote: null, receipt: null, error: null };
export const usePerformanceStore = create<State>(() => initial);
export function bindPerformanceStore(events: GameEventSource) {
  const set = usePerformanceStore.setState;
  const release = [
    events.on('performanceWorkshop', view => set(view ? { view } : initial)),
    events.on('performanceQuote', quote => set({ quote, error: null, ...(quote ? { receipt: null } : {}) })),
    events.on('performanceInstalled', receipt => set({ receipt, quote: null, error: null })),
    events.on('partInspected', () => set({ error: null })),
    events.on('commandRejected', ({ command, reason }) => {
      if (command === 'quotePerformancePart' || command === 'installPerformancePart' || command === 'inspectPart') set({ error: reason });
    }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
