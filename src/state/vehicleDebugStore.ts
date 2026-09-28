import { create } from "zustand";
import type { GameEventMap, GameEventSource, VehicleDebugInfo, VehicleTelemetry } from "@/game";

/**
 * Handling tuning readout for the debug panel. Separate from the HUD store so the
 * ~10 Hz telemetry only re-renders the panel.
 */
type VehicleDebugState = {
  info: VehicleDebugInfo | null;
  telemetry: VehicleTelemetry | null;
  /** Race AI readout, ~5 Hz while a rival drives. */
  ai: GameEventMap["aiTelemetry"] | null;
  /** Per-corner tire readout, ~5 Hz. */
  tires: GameEventMap["tireTelemetry"] | null;
};

const initialState: VehicleDebugState = { info: null, telemetry: null, ai: null, tires: null };

export const useVehicleDebugStore = create<VehicleDebugState>(() => initialState);

/** Feeds the store from game events. Returns an unbind that also resets the store. */
export function bindVehicleDebugStore(events: GameEventSource): () => void {
  const set = useVehicleDebugStore.setState;
  const unsubscribers = [
    events.on("vehicleDebugInfo", (info) => set({ info })),
    events.on("vehicleTelemetry", (telemetry) => set({ telemetry })),
    events.on("aiTelemetry", (ai) => set({ ai })),
    events.on("tireTelemetry", (tires) => set({ tires })),
    events.on("sceneLoading", () => set(initialState)),
  ];

  return () => {
    unsubscribers.forEach((off) => off());
    set(initialState);
  };
}
