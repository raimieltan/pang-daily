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
    <div className="flex flex-wrap items-center gap-2 self-start text-left text-xs text-white/60" data-testid="player-controls">
      <p>{mode === "walking" ? "WASD / left stick · Walk — Q/E / right stick · Look" : racing ? "WASD / left stick · Drive — Space / B · Handbrake" : "Stop to exit"}</p>
      {!racing && (mode === "driving" || prompt) && (
        <button type="button" className="pointer-events-auto rounded border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/70"
          onClick={() => mode === "driving" && !prompt ? commands?.exitVehicle() : commands?.interact()}
          data-testid="interaction-prompt">
          F / RB · {prompt?.label ?? "Get out"}
        </button>
      )}
    </div>
  );
}
