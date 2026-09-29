import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { TuningView, TuneReceipt } from '@/game/vehicles/TuningSystem';
type State = { view: TuningView | null; receipt: TuneReceipt | null; pending: boolean; error: string | null };
const initial: State = { view: null, receipt: null, pending: false, error: null };
export const useTuningStore = create<State>(() => initial);
export function bindTuningStore(events: GameEventSource) {
  const set = useTuningStore.setState;
  const release = [
    events.on('tuningState', view => set(view ? { view, pending: false } : initial)),
    events.on('vehicleTuned', receipt => set({ receipt, pending: false, error: null })),
    events.on('commandRejected', ({ command, reason }) => { if (command === 'setVehicleTune') set({ error: reason, pending: false }); }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
