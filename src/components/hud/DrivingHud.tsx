"use client";

import { useGameUiStore } from "@/state/gameUiStore";
import { useHudStore } from "@/state/hudStore";

function formatGear(gear: number) {
  if (gear < 0) return "R";
  if (gear === 0) return "N";
  return String(gear);
}

/** Speedo + race standing. Renders only derived HUD state from the hud store. */
export function DrivingHud() {
  const progress = useHudStore((s) => s.raceProgress);
  const commands = useGameUiStore((s) => s.commands);
  const playerMode = useHudStore((s) => s.playerMode);
  const vehicle = useHudStore((s) => s.vehicle);
  const race = useHudStore((s) => s.race);
  const lastResult = useHudStore((s) => s.lastResult);

  if (playerMode === "walking" || (!vehicle && !lastResult)) return null;

  return (
    <div className="flex flex-col items-end gap-1" data-testid="driving-hud">
      {progress && <div className="race-readout text-right" aria-live="polite">
        {progress.phase === "READY" && <p>Barangay sprint · Meet the rival at the gold line east of Home.</p>}
        {progress.phase === "COUNTDOWN" && <p className="text-3xl">{progress.countdown || "GO!"}</p>}
        {progress.phase === "RUNNING" && <>
          <p>{(progress.elapsedMs / 1000).toFixed(1)}s · Gates {progress.checkpoint}/{progress.total}</p>
          <p>Next: {progress.next} · Follow the gold gate</p>
          {progress.invalidFinish && <p className="text-red-300">Finish blocked — return to {progress.next}.</p>}
        </>}
        {(progress.phase === "RUNNING" || progress.phase === "COUNTDOWN") && <button className="pointer-events-auto mt-2 underline" onClick={() => commands?.resetRace()}>Abandon race</button>}
        {progress.phase === "FINISHED" && <div className="pointer-events-auto flex justify-end gap-4">
          <button onClick={() => commands?.startRace(progress.raceId)}>Race again</button>
          <button onClick={() => commands?.resetRace()}>Back to hub</button>
        </div>}
      </div>}
      {race && (
        <span className="text-base text-white/90" data-testid="race-position">
          P{race.position}/{race.racers}
        </span>
      )}
      {!race && lastResult && (
        <span data-testid="race-result">
          Finished P{lastResult.position}/{lastResult.racers} · {(lastResult.timeMs / 1000).toFixed(2)}s
        </span>
      )}
      {vehicle && (
        <div className="speed-readout flex items-baseline gap-3 text-white/90">
          <span className="speed-number tabular-nums" data-testid="speed">
            {vehicle.speedKmh}
          </span>
          <span className="text-[10px] tracking-[0.18em] text-white/50">KM/H</span>
          <span className="ml-5 border-l border-white/25 pl-5 text-3xl font-light" data-testid="gear">
            {formatGear(vehicle.gear)}
          </span>
        </div>
      )}
    </div>
  );
}
