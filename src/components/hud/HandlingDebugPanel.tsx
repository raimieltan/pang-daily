"use client";

import { useState } from "react";
import type { VehicleTelemetry } from "@/game";
import { useGameUiStore } from "@/state/gameUiStore";
import { useVehicleDebugStore } from "@/state/vehicleDebugStore";

const buttonClass = "rounded border border-amber-200/30 px-2 py-0.5 hover:bg-amber-200/10";

/**
 * Handling tuning panel: preset swap, spawn/reset, and the live telemetry the
 * tuning doc talks about (docs/HANDLING_TUNING.md). Driving scene only.
 */
export function HandlingDebugPanel() {
  const info = useVehicleDebugStore((s) => s.info);
  const telemetry = useVehicleDebugStore((s) => s.telemetry);
  const commands = useGameUiStore((s) => s.commands);
  const [open, setOpen] = useState(true);

  if (!info) return null;
  const preset = info.presets.find((p) => p.id === info.presetId);

  return (
    <div
      className="pointer-events-auto w-72 rounded border border-amber-200/20 bg-black/70 p-2 text-[11px] leading-tight"
      data-testid="handling-debug"
    >
      <div className="flex items-center justify-between">
        <span className="tracking-widest uppercase">Handling</span>
        <button type="button" className={buttonClass} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <select
              className="rounded border border-amber-200/30 bg-black px-1 py-0.5"
              value={info.presetId}
              onChange={(e) => {
                commands?.setHandlingPreset(e.target.value);
                // Hand the arrow keys back to the car.
                e.currentTarget.blur();
              }}
            >
              {info.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {preset && <span className="text-amber-200/60">{preset.description}</span>}
          </label>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={buttonClass} onClick={() => commands?.resetVehicle()}>
              Reset (R)
            </button>
            {info.spawnPoints.map((id) => (
              <button key={id} type="button" className={buttonClass} onClick={() => commands?.spawnAt(id)}>
                {id}
              </button>
            ))}
          </div>
          {telemetry && <TelemetryReadout t={telemetry} />}
        </div>
      )}
    </div>
  );
}

function TelemetryReadout({ t }: { t: VehicleTelemetry }) {
  const state = [t.reversing && "REV", t.held && "HOLD", t.groundedWheels < 4 && `${t.groundedWheels}/4 wheels`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-1 tabular-nums">
      <Row label="speed" value={`${t.speedKmh} km/h`} />
      <Row label="steer / lock" value={`${t.steerDeg.toFixed(1)}° / ${t.maxSteerDeg.toFixed(1)}°`} />
      <Bar label="throttle" value={t.throttle} />
      <Bar label="brake" value={t.brake} />
      <Bar label="understeer" value={t.understeer} signed hint="+ push · − rotate" />
      <Bar label="front grip" value={t.frontGripUse} />
      <Bar label="rear grip" value={t.rearGripUse} />
      <Bar label="lift-off" value={t.liftOff} />
      <Bar label="traction cut" value={t.tractionCut} />
      <Row label="slip body/F/R" value={`${t.bodySlipDeg}° / ${t.frontSlipDeg}° / ${t.rearSlipDeg}°`} />
      <Row label="g long/lat" value={`${t.longAccelG.toFixed(2)} / ${t.latAccelG.toFixed(2)}`} />
      <Row label="load shift" value={`${(t.loadShift * 100).toFixed(1)}% front`} />
      <Row label="stability" value={t.stabilityYaw.toFixed(2)} />
      {state && <span className="text-amber-100">{state}</span>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-amber-200/60">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** 0..1 bar; `signed` draws −1..1 from the centre. */
function Bar({ label, value, signed = false, hint }: { label: string; value: number; signed?: boolean; hint?: string }) {
  const clamped = Math.max(signed ? -1 : 0, Math.min(1, value));
  const width = `${(signed ? Math.abs(clamped) / 2 : clamped) * 100}%`;
  const left = signed ? (clamped < 0 ? `${50 - Math.abs(clamped) * 50}%` : "50%") : "0%";
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span className="w-20 shrink-0 text-amber-200/60">{label}</span>
      <div className="relative h-1.5 flex-1 bg-amber-200/10">
        {signed && <div className="absolute top-0 left-1/2 h-full w-px bg-amber-200/30" />}
        <div className="absolute top-0 h-full bg-amber-300/80" style={{ left, width }} />
      </div>
      <span className="w-9 text-right">{value.toFixed(2)}</span>
    </div>
  );
}
