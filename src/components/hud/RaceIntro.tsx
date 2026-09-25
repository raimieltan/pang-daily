"use client";

import { useHudStore } from "@/state/hudStore";
import { useGameUiStore } from "@/state/gameUiStore";
import { useGraphicsStore } from "@/state/graphicsStore";

export function RaceIntro() {
  const intro = useHudStore(s => s.raceIntro);
  const paused = useGameUiStore(s => s.paused);
  const reduced = useGraphicsStore(s => s.settings?.reducedMotion);
  const time = useGraphicsStore(s => s.timeOfDay);
  if (!intro) return null;
  return <div className={`race-intro ${paused ? "is-paused" : ""} ${reduced ? "is-steady" : ""}`} data-testid="race-intro">
    <div className="race-intro-fade" />
    <div className="race-intro-title">
      <p className="tape-eyebrow">PANG DAILY / UNDERGROUND TAPES</p>
      <h1>NIGHT RUN</h1>
      <p className="tracking-[0.28em] uppercase">{intro.title}</p>
      <p className="mt-3 text-xs tracking-[0.22em] text-white/60">ILOILO, PH · {time === "morning" ? "06:24 AM" : time === "afternoon" ? "04:38 PM" : "02:13 AM"}</p>
    </div>
  </div>;
}
