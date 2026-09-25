import type { RaceProgress } from "@/game/races/Race";
import { create } from "zustand";
import type { GameEventSource, InteractionPrompt, PlayerMode, RaceResult, RaceStanding, VehicleSummary } from "@/game";

/**
 * Driving HUD state: what the speedo and race tower show.
 * Kept separate from the runtime store so HUD updates (~10 Hz while driving)
 * only re-render HUD components.
 */
type HudState = {
  playerMode: PlayerMode;
  interaction: InteractionPrompt | null;
  vehicle: VehicleSummary | null;
  race: RaceStanding | null;
  raceProgress: RaceProgress | null;
  lastResult: RaceResult | null;
  raceIntro: { title: string } | null;
};

const initialState: HudState = { playerMode: "driving", interaction: null, vehicle: null, raceProgress: null, race: null, lastResult: null, raceIntro: null };

export const useHudStore = create<HudState>(() => initialState);

/** Feeds the store from game events. Returns an unbind that also resets the store. */
export function bindHudStore(events: GameEventSource): () => void {
  const set = useHudStore.setState;
  const unsubscribers = [
    events.on("raceIntro", (raceIntro) => set({ raceIntro })),
    events.on("playerModeChanged", ({ mode }) => set({ playerMode: mode })),
    events.on("interactionPromptChanged", ({ prompt }) => set({ interaction: prompt })),
    events.on("vehicleStateUpdated", (vehicle) => set({ vehicle })),
    events.on("raceProgress", (raceProgress) => set({ raceProgress, ...(raceProgress.phase === "RESET" ? { race: null, lastResult: null } : {}) })),
    events.on("raceStarted", (race) => set({ race, lastResult: null })),
    events.on("raceStandingChanged", (race) => set({ race })),
    events.on("raceFinished", (lastResult) => set({ race: null, lastResult })),
    // A scene switch tears down whatever was driving/racing.
    events.on("sceneLoading", () => set(initialState)),
  ];

  return () => {
    unsubscribers.forEach((off) => off());
    set(initialState);
  };
}
