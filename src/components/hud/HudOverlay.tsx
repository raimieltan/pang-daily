"use client";

import { useGameUiStore } from "@/state/gameUiStore";
import { CommandNotice } from "./CommandNotice";
import { DialogueBox } from "./DialogueBox";
import type { SceneId } from "@/game";
import { DrivingHud } from "./DrivingHud";
import { GraphicsDebugPanel } from "./GraphicsDebugPanel";
import { HandlingDebugPanel } from "./HandlingDebugPanel";
import { LocationToast } from "./LocationToast";
import { InteractionPrompt } from "./InteractionPrompt";

const buttonClass = "rounded border border-amber-200/30 px-2 py-1 hover:bg-amber-200/10";
const SCENES: { id: SceneId; label: string }[] = [
  { id: "hub", label: "Hub" },
  { id: "driving", label: "Handling track" },
  { id: "debug", label: "Bridge demo" },
];

/** Presentation-only overlay. Reads the UI store and sends intents via commands. */
export function HudOverlay() {
  const status = useGameUiStore((s) => s.status);
  const errorMessage = useGameUiStore((s) => s.errorMessage);
  const paused = useGameUiStore((s) => s.paused);
  const fps = useGameUiStore((s) => s.fps);
  const commands = useGameUiStore((s) => s.commands);
  const activeScene = useGameUiStore((s) => s.activeScene);
  const loadingScene = useGameUiStore((s) => s.loadingScene);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 font-mono text-xs text-amber-200/80">
      <div className="flex items-start justify-between">
        <span className="tracking-widest uppercase">Pang Daily</span>
        {status === "ready" && (
          <div className="pointer-events-auto flex items-center gap-3">
            <span>{fps} fps</span>
            {activeScene && (
              <>
                <span>scene: {activeScene}</span>
                {activeScene === "debug" && (
                  <>
                    <button type="button" onClick={() => commands?.spawnAt("coffee_shop")} className={buttonClass}>
                      Spawn at coffee shop
                    </button>
                    <button type="button" onClick={() => commands?.startRace("debug_sprint")} className={buttonClass}>
                      Start race
                    </button>
                  </>
                )}
                {SCENES.filter((s) => s.id !== activeScene).map((s) => (
                  <button key={s.id} type="button" onClick={() => commands?.switchScene(s.id)} className={buttonClass}>
                    {s.label}
                  </button>
                ))}
                <button type="button" onClick={() => commands?.switchScene(activeScene)} className={buttonClass}>
                  Reload scene
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => (paused ? commands?.resume() : commands?.pause())}
              className={buttonClass}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}
      </div>

      {status === "loading" && <p className="self-center">Loading…</p>}
      {status === "ready" && loadingScene && <p className="self-center">Loading {loadingScene}…</p>}
      {status === "error" && <p className="self-center text-red-400">Failed to start: {errorMessage}</p>}
      {status === "ready" && (
        <div className="absolute top-12 left-4">
          <HandlingDebugPanel />
        </div>
      )}
      {status === "ready" && (
        <div className="absolute top-12 right-4">
          <GraphicsDebugPanel />
        </div>
      )}
      {status === "ready" && (
        <div className="flex flex-col gap-3">
          <LocationToast />
          <CommandNotice />
          <DialogueBox />
          <InteractionPrompt />
          <DrivingHud />
        </div>
      )}
    </div>
  );
}
