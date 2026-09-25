"use client";

import { useHudStore } from "@/state/hudStore";

function formatGear(gear: number) {
  if (gear < 0) return "R";
  if (gear === 0) return "N";
  return String(gear);
}

/** Speedo + race standing. Renders only derived HUD state from the hud store. */
export function DrivingHud() {
  const playerMode = useHudStore((s) => s.playerMode);
  const vehicle = useHudStore((s) => s.vehicle);
  const race = useHudStore((s) => s.race);
  const lastResult = useHudStore((s) => s.lastResult);

  if (playerMode === "walking" || (!vehicle && !lastResult)) return null;

  return (
    <div className="flex flex-col items-end gap-1" data-testid="driving-hud">
      {race && (
        <span className="text-base text-amber-100" data-testid="race-position">
          P{race.position}/{race.racers}
        </span>
      )}
      {!race && lastResult && (
        <span data-testid="race-result">
          Finished P{lastResult.position}/{lastResult.racers} · {(lastResult.timeMs / 1000).toFixed(2)}s
        </span>
      )}
      {vehicle && (
        <div className="flex items-baseline gap-3 text-amber-100">
          <span className="text-3xl tabular-nums" data-testid="speed">
            {vehicle.speedKmh}
          </span>
          <span>km/h</span>
          <span className="text-2xl" data-testid="gear">
            {formatGear(vehicle.gear)}
          </span>
        </div>
      )}
    </div>
  );
}
