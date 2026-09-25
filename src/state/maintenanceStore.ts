import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { MaintenanceSummary, RepairQuote, RepairReceipt } from '@/game-core/maintenance/VehicleSession';
type State = { summary: MaintenanceSummary | null; quote: RepairQuote | null; receipt: RepairReceipt | null; error: string | null };
const initial: State = { summary: null, quote: null, receipt: null, error: null };
export const useMaintenanceStore = create<State>(() => initial);
/** Read-only presentation snapshots. Money and condition are mutated only by the game session. */
export function bindMaintenanceStore(events: GameEventSource) {
  const set = useMaintenanceStore.setState;
  const release = [
    events.on('maintenanceState', summary => set({ summary })),
    events.on('repairQuote', quote => set({ quote, error: null, ...(!quote ? { receipt: null } : {}) })),
    events.on('repairCompleted', receipt => set({ receipt, error: null })),
    events.on('commandRejected', ({ command, reason }) => {
      if (command === 'inspectVehicle' || command === 'repairVehicle') set({ error: reason });
    }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
