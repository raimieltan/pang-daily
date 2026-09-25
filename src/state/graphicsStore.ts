import { create } from "zustand";
import type { GameEventMap, GameEventSource, GraphicsSettings, RenderStats, TimeOfDay } from "@/game";

/** Graphics settings, time of day, the ~1 Hz render readout and the last benchmark, for the graphics debug panel. */
type GraphicsState = {
  settings: GraphicsSettings | null;
  timeOfDay: TimeOfDay | null;
  stats: RenderStats | null;
  benchmark: GameEventMap["graphicsBenchmark"] | null;
  benchmarking: boolean;
};

const initialState: GraphicsState = { settings: null, timeOfDay: null, stats: null, benchmark: null, benchmarking: false };

export const useGraphicsStore = create<GraphicsState>(() => initialState);

/** Feeds the store from game events. Returns an unbind that also resets the store. */
export function bindGraphicsStore(events: GameEventSource): () => void {
  const set = useGraphicsStore.setState;
  const unsubscribers = [
    events.on("graphicsState", (settings) => set({ settings })),
    events.on("timeOfDay", ({ time }) => set({ timeOfDay: time })),
    events.on("renderStats", (stats) => set({ stats })),
    events.on("graphicsBenchmark", (benchmark) => set({ benchmark, benchmarking: false })),
    events.on("commandRejected", ({ command }) => {
      if (command === "runGraphicsBenchmark") set({ benchmarking: false });
    }),
    events.on("sceneLoading", () => set(initialState)),
  ];

  return () => {
    unsubscribers.forEach((off) => off());
    set(initialState);
  };
}
