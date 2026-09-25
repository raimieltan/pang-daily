"use client";

import { useState } from "react";
import { useHudStore } from "@/state/hudStore";
import { useGraphicsStore } from "@/state/graphicsStore";
import { RaceIntro } from "./RaceIntro";
import { useGameUiStore } from "@/state/gameUiStore";
import { CommandNotice } from "./CommandNotice";
import { DialogueBox } from "./DialogueBox";
import type { SceneId } from "@/game";
import { DrivingHud } from "./DrivingHud";
import { GraphicsDebugPanel } from "./GraphicsDebugPanel";
import { HandlingDebugPanel } from "./HandlingDebugPanel";
import { LocationToast } from "./LocationToast";
import { InteractionPrompt } from "./InteractionPrompt";

const buttonClass = "tape-button";
const SCENES: { id: SceneId; label: string }[] = [
  { id: "hub", label: "Hub" },
  { id: "driving", label: "Handling track" },
  { id: "debug", label: "Bridge demo" },
];

/** Presentation-only overlay. Reads the UI store and sends intents via commands. */
export function HudOverlay() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const intro = useHudStore(s => s.raceIntro);
  const settings = useGraphicsStore(s => s.settings);
  const time = useGraphicsStore(s => s.timeOfDay);
  const status = useGameUiStore((s) => s.status);
  const errorMessage = useGameUiStore((s) => s.errorMessage);
  const paused = useGameUiStore((s) => s.paused);
  const fps = useGameUiStore((s) => s.fps);
  const commands = useGameUiStore((s) => s.commands);
  const activeScene = useGameUiStore((s) => s.activeScene);
  const loadingScene = useGameUiStore((s) => s.loadingScene);

  return (
    <div className={`tape-hud pointer-events-none absolute inset-0 flex flex-col justify-between ${settings?.reducedMotion ? "is-steady" : ""}`}>
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="tape-brand">PANG DAILY</p>
          <p className="mt-2 text-[10px] tracking-[0.24em] text-white/50">ILOILO, PH / {time === "night" ? "02:13 AM" : time === "morning" ? "06:24 AM" : "04:38 PM"}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          {settings?.analog && settings.analogPreset !== "CLEAN" && <span className="tape-rec hidden sm:inline"><i /> REC</span>}
          {status === "ready" && <>
            <button type="button" className={buttonClass} onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen}>{toolsOpen ? "Close settings" : "Settings"}</button>
            <button type="button" className={buttonClass} onClick={() => paused ? commands?.resume() : commands?.pause()}>{paused ? "Resume" : "Menu"}</button>
          </>}
        </div>
      </header>

      {(status === "loading" || loadingScene) && <div className="tape-loading"><p className="tape-eyebrow">PANG DAILY / VOL. 01</p><p className="mt-4 text-4xl font-light tracking-[0.16em]">FINDING SIGNAL</p><p className="mt-3 text-white/50">Loading {loadingScene ?? "the road"}…</p></div>}
      {status === "error" && <p className="self-center text-red-300">Failed to start: {errorMessage}</p>}

      {paused && status === "ready" && !toolsOpen && <nav className="tape-menu pointer-events-auto" aria-label="Pause menu">
        <p className="tape-eyebrow">TAPE PAUSED / ILOILO AFTER HOURS</p>
        <h1>NIGHT RUN</h1>
        <button onClick={() => commands?.resume()}>DRIVE <span>↗</span></button>
        <button onClick={() => setToolsOpen(true)}>SETTINGS</button>
        <p className="mt-10 text-[10px] tracking-[0.22em] text-white/40">OLD CARS. LATE NIGHTS. / VOL. 01</p>
      </nav>}

      {status === "ready" && toolsOpen && <div className="pointer-events-auto absolute top-24 right-4 z-30 flex max-h-[76dvh] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-auto sm:right-8">
        <GraphicsDebugPanel />
        <details className="bg-black/80 p-3 text-xs"><summary className="cursor-pointer tracking-widest">DEVELOPMENT / {fps} FPS</summary>
          <HandlingDebugPanel />
          <div className="mt-3 flex flex-wrap gap-3">
            {SCENES.filter(s => s.id !== activeScene).map(s => <button key={s.id} className={buttonClass} onClick={() => commands?.switchScene(s.id)}>{s.label}</button>)}
            {activeScene && <button className={buttonClass} onClick={() => commands?.switchScene(activeScene)}>Reload scene</button>}
            {activeScene === "debug" && <><button className={buttonClass} onClick={() => commands?.spawnAt("coffee_shop")}>Spawn at coffee shop</button><button className={buttonClass} onClick={() => commands?.startRace("debug_sprint")}>Start race</button></>}
          </div>
        </details>
      </div>}
      {status === "ready" && !paused && !intro && <div className="flex flex-col gap-3">
        <LocationToast /><CommandNotice /><DialogueBox /><InteractionPrompt /><DrivingHud />
      </div>}
      <RaceIntro />
    </div>
  );
}
