import { create } from "zustand";
import type { GameCommands } from "@/game";

export type GameStatus = "loading" | "ready" | "error";

/**
 * UI-facing snapshot of the game, fed by bridge events.
 * Derived, low-frequency values only — never frame-level simulation state.
 */
type GameUiState = {
  status: GameStatus;
  errorMessage: string | null;
  paused: boolean;
  fps: number;
  commands: GameCommands | null;
};

export const useGameUiStore = create<GameUiState>(() => ({
  status: "loading",
  errorMessage: null,
  paused: false,
  fps: 0,
  commands: null,
}));
