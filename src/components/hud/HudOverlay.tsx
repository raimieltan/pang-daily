"use client";

import { useGameUiStore } from "@/state/gameUiStore";

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
                <button
                  type="button"
                  onClick={() => commands?.switchScene(activeScene)}
                  className="rounded border border-amber-200/30 px-2 py-1 hover:bg-amber-200/10"
                >
                  Reload scene
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => (paused ? commands?.resume() : commands?.pause())}
              className="rounded border border-amber-200/30 px-2 py-1 hover:bg-amber-200/10"
            >
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}
      </div>

      {status === "loading" && <p className="self-center">Loading…</p>}
      {status === "ready" && loadingScene && <p className="self-center">Loading {loadingScene}…</p>}
      {status === "error" && <p className="self-center text-red-400">Failed to start: {errorMessage}</p>}
    </div>
  );
}
