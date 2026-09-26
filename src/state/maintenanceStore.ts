import type { FuelQuote, FuelReceipt } from '@/game/maintenance/FuelSystem';
import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { MaintenanceSummary, RepairQuote, RepairReceipt } from '@/game-core/maintenance/VehicleSession';
type State = { fuelOpen: boolean; fuelQuote: FuelQuote | null; fuelReceipt: FuelReceipt | null; fuelError: string | null; summary: MaintenanceSummary | null; quote: RepairQuote | null; receipt: RepairReceipt | null; error: string | null };
const initial: State = { fuelOpen: false, fuelQuote: null, fuelReceipt: null, fuelError: null, summary: null, quote: null, receipt: null, error: null };
export const useMaintenanceStore = create<State>(() => initial);
type CustomizationState = { view: import('@/game/vehicles/CustomizationSystem').CustomizationView | null; error: string | null };
export const useCustomizationStore = create<CustomizationState>(() => ({ view: null, error: null }));
/** Read-only presentation snapshots. Money and condition are mutated only by the game session. */
export function bindMaintenanceStore(events: GameEventSource) {
  const set = useMaintenanceStore.setState;
  const release = [
    events.on('customizationState', view => useCustomizationStore.setState({ view, error: null })),
    events.on('sceneLoading', () => useCustomizationStore.setState({ view: null, error: null })),
    events.on('fuelPanel', fuelOpen => set({ fuelOpen, fuelQuote: null, fuelReceipt: null, fuelError: null })),
    events.on('fuelQuote', fuelQuote => set({ fuelQuote, fuelError: null, ...(fuelQuote ? { fuelReceipt: null } : {}) })),
    events.on('fuelPurchased', fuelReceipt => set({ fuelReceipt, fuelError: null })),
    events.on('maintenanceState', summary => set({ summary })),
    events.on('repairQuote', quote => set({ quote, error: null, ...(!quote ? { receipt: null } : {}) })),
    events.on('repairCompleted', receipt => set({ receipt, error: null })),
    events.on('commandRejected', ({ command, reason }) => {
      if (command === 'setVehiclePaint' || command === 'setRideHeight') useCustomizationStore.setState({ error: reason });
      if (command === 'quoteFuel' || command === 'purchaseFuel') set({ fuelError: reason });
      if (command === 'inspectVehicle' || command === 'repairVehicle') set({ error: reason });
    }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); useCustomizationStore.setState({ view: null, error: null }); };
}
