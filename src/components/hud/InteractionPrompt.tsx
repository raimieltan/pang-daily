"use client";

import { useGameUiStore } from "@/state/gameUiStore";
import { useHudStore } from "@/state/hudStore";

export function InteractionPrompt() {
  const racePhase = useHudStore((s) => s.raceProgress?.phase);
  const racing = racePhase === "COUNTDOWN" || racePhase === "RUNNING";
  const mode = useHudStore((s) => s.playerMode);
  const prompt = useHudStore((s) => s.interaction);
  const commands = useGameUiStore((s) => s.commands);
  const scene = useGameUiStore((s) => s.activeScene);
  const paused = useGameUiStore((s) => s.paused);
  if (scene !== "hub" || paused) return null;

  return (
    <div className="self-center text-center" data-testid="player-controls">
      <p className="mb-2">{mode === "walking" ? "WASD / left stick · Walk — Q/E / right stick · Look" : racing ? "WASD / left stick · Drive — Space / B · Handbrake" : "Stop the car to get out"}</p>
      {!racing && (mode === "driving" || prompt) && (
        <button type="button" className="pointer-events-auto rounded border border-amber-200/40 bg-black/70 px-4 py-2 text-sm text-amber-100"
          onClick={() => mode === "driving" && !prompt ? commands?.exitVehicle() : commands?.interact()}
          data-testid="interaction-prompt">
          F / RB · {prompt?.label ?? "Get out"}
        </button>
      )}
    </div>
  );
}
