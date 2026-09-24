import { create } from "zustand";
import type { GameCommands, GameEventSource, SceneId } from "@/game";

export type GameStatus = "loading" | "ready" | "error";

/**
 * UI-facing snapshot of the runtime itself (boot status, pause, scene, fps),
 * plus the bridge handles React uses to talk to the game.
 * Derived, low-frequency values only — never frame-level simulation state.
 */
type GameUiState = {
  status: GameStatus;
  errorMessage: string | null;
  paused: boolean;
  fps: number;
  /** Scene currently rendering; null while a scene is loading. */
  activeScene: SceneId | null;
  loadingScene: SceneId | null;
  commands: GameCommands | null;
  /** Subscribe-only; see `useGameEvent` for transient events. */
  events: GameEventSource | null;
};

const initialState: GameUiState = {
  status: "loading",
  errorMessage: null,
  paused: false,
  fps: 0,
  activeScene: null,
  loadingScene: null,
  commands: null,
  events: null,
};

export const useGameUiStore = create<GameUiState>(() => initialState);

/** Feeds the store from a running game. Returns an unbind that also resets the store. */
export function bindGameUiStore(game: { events: GameEventSource; commands: GameCommands }): () => void {
  const set = useGameUiStore.setState;
  const { events } = game;
  const unsubscribers = [
    events.on("ready", () => set({ status: "ready" })),
    events.on("paused", ({ paused }) => set({ paused })),
    events.on("statsUpdated", ({ fps }) => set({ fps })),
    events.on("sceneLoading", ({ sceneId }) => set({ activeScene: null, loadingScene: sceneId })),
    events.on("sceneReady", ({ sceneId }) => set({ activeScene: sceneId, loadingScene: null })),
    events.on("error", ({ message }) => set({ status: "error", errorMessage: message, loadingScene: null })),
  ];
  set({ commands: game.commands, events });

  return () => {
    unsubscribers.forEach((off) => off());
    set(initialState);
  };
}
