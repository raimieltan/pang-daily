"use client";

import { useVehicleDebugStore } from "@/state/vehicleDebugStore";
import { useGameUiStore } from "@/state/gameUiStore";
import { Row } from "./HandlingDebugPanel";

const kN = (n: number) => `${(n / 1000).toFixed(2)}`;
const FAILURES = ["SLOW_LEAK", "RAPID_LEAK", "BLOWOUT"] as const;

/** Per-corner tire readout and dev puncture buttons. */
export function TireDebugPanel() {
  const tires = useVehicleDebugStore((s) => s.tires);
  const commands = useGameUiStore((s) => s.commands);
  if (!tires) return null;
  return (
    <div className="pointer-events-auto w-full border border-white/20 bg-black/35 p-4 text-xs leading-relaxed" data-testid="tire-debug">
      <span className="tracking-widest uppercase">Tires · per corner</span>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {tires.corners.map((c) => (
          <div key={c.corner} className="flex flex-col gap-0.5">
            <span className="font-bold">{c.corner} · {c.spec} · {c.failure}{c.raised ? " · JACKED" : ""}</span>
            <Row label="Pressure / health / rim" value={`${Math.round(c.pressureKpa)} kPa / ${Math.round(c.health * 100)}% / ${Math.round(c.rimDamage * 100)}%`} />
            <Row label="Surface / grip / slip×" value={`${c.surface} / ${c.grip.toFixed(2)} / ${c.slipScale.toFixed(2)}`} />
            <Row label="Load / Fx / Fy (kN)" value={`${kN(c.normalLoadN)} / ${kN(c.fx)} / ${kN(c.fy)}`} />
            <Row label="Slip angle / ratio" value={`${c.slipAngleDeg.toFixed(1)}° / ${c.slipRatio.toFixed(2)}`} />
            <Row label="Wheel speed" value={`${c.wheelSpeed.toFixed(1)} m/s${c.grounded ? "" : " · airborne"}`} />
            <Row label="Drive / brake / roll (N)" value={`${Math.round(c.driveN)} / ${Math.round(c.brakeN)} / ${Math.round(c.rollingN)}`} />
            <div className="flex gap-1">
              {FAILURES.map((f) => (
                <button key={f} type="button" className="border border-white/30 px-1 hover:bg-white/10" onClick={() => commands?.debugPuncture(c.corner, f)}>
                  {f.replace("_", " ").toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="mt-2 border border-white/30 px-2 hover:bg-white/10" onClick={() => commands?.debugResetTires()}>Reset tires</button>
    </div>
  );
}
