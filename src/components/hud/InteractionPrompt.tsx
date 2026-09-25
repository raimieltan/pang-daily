"use client";

import { useGameUiStore } from "@/state/gameUiStore";
import { useHudStore } from "@/state/hudStore";

export function InteractionPrompt() {
  const mode = useHudStore((s) => s.playerMode);
  const prompt = useHudStore((s) => s.interaction);
  const commands = useGameUiStore((s) => s.commands);
  const scene = useGameUiStore((s) => s.activeScene);
  const paused = useGameUiStore((s) => s.paused);
  if (scene !== "hub" || paused) return null;

  return (
    <div className="self-center text-center" data-testid="player-controls">
      <p className="mb-2">{mode === "walking" ? "WASD / left stick · Walk — Q/E / right stick · Look" : "Stop the car to get out"}</p>
      {(mode === "driving" || prompt) && (
        <button type="button" className="pointer-events-auto rounded border border-amber-200/40 bg-black/70 px-4 py-2 text-sm text-amber-100"
          onClick={() => mode === "driving" ? commands?.exitVehicle() : commands?.interact()}
          data-testid="interaction-prompt">
          F / RB · {mode === "driving" ? "Get out" : prompt?.label}
        </button>
      )}
    </div>
  );
}
