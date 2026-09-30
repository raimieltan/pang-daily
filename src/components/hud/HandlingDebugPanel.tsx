"use client";

import { SuspensionDebugReadout } from "./SuspensionDebugReadout";
import { useState } from "react";
import type { VehicleTelemetry } from "@/game";
import { useGameUiStore } from "@/state/gameUiStore";
import { useVehicleDebugStore } from "@/state/vehicleDebugStore";

const buttonClass = "rounded border border-white/30 px-2 py-0.5 hover:bg-white/10";

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
      className="pointer-events-auto w-full border border-white/20 bg-black/35 p-4 text-xs leading-relaxed"
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
              className="rounded border border-white/30 bg-black px-1 py-0.5"
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
            {preset && <span className="text-white/55">{preset.description}</span>}
          </label>
          {telemetry?.mechanics && <label className="flex flex-col gap-1">
            Driver assistance
            <select aria-label="Driver assistance" className="rounded border border-white/30 bg-black px-1 py-0.5"
              value={telemetry.mechanics.controls.profile}
              onChange={e => { commands?.setDriverAssistance(e.target.value); e.currentTarget.blur(); }}>
              {['assisted', 'standard', 'simulation', 'raw'].map(profile => <option key={profile} value={profile}>{profile}</option>)}
            </select>
          </label>}
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
          {telemetry?.suspension && <label><input type="checkbox" onChange={e => commands?.showSuspensionDebug(e.target.checked)} /> Suspension vectors</label>}
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
      <Bar label="handbrake" value={t.handbrake} />
      <Bar label="traction cut" value={t.tractionCut} />
      <Row label="slip body/F/R" value={`${t.bodySlipDeg}° / ${t.frontSlipDeg}° / ${t.rearSlipDeg}°`} />
      <Row label="g long/lat" value={`${t.longAccelG.toFixed(2)} / ${t.latAccelG.toFixed(2)}`} />
      <Row label="load shift F/L" value={`${(t.loadShift * 100).toFixed(1)}% / ${(t.lateralLoadShift * 100).toFixed(1)}%`} />
      <Row label="stability" value={t.stabilityYaw.toFixed(2)} />
      {t.suspension && <SuspensionDebugReadout state={t.suspension} />}
      {t.mechanics && <MechanicalReadout m={t.mechanics} />}
      {state && <span className="text-white/90">{state}</span>}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-white/55">{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** 0..1 bar; `signed` draws −1..1 from the centre. */
export function Bar({ label, value, signed = false, hint }: { label: string; value: number; signed?: boolean; hint?: string }) {
  const clamped = Math.max(signed ? -1 : 0, Math.min(1, value));
  const width = `${(signed ? Math.abs(clamped) / 2 : clamped) * 100}%`;
  const left = signed ? (clamped < 0 ? `${50 - Math.abs(clamped) * 50}%` : "50%") : "0%";
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span className="w-20 shrink-0 text-white/55">{label}</span>
      <div className="relative h-1.5 flex-1 bg-white/10">
        {signed && <div className="absolute top-0 left-1/2 h-full w-px bg-white/30" />}
        <div className="absolute top-0 h-full bg-amber-300/80" style={{ left, width }} />
      </div>
      <span className="w-9 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

function MechanicalReadout({ m }: { m: NonNullable<VehicleTelemetry['mechanics']> }) {
  const c = m.controls, degrees = (value: number) => (value * 180 / Math.PI).toFixed(1);
  return <div className="mt-2 flex flex-col gap-1" data-testid="mechanical-telemetry">
    <Row label="heading / velocity" value={`${m.headingDeg.toFixed(1)}° / ${m.velocityHeadingDeg.toFixed(1)}°`} />
    <Row label="yaw / drift" value={`${m.yawRateDeg.toFixed(1)}°/s · ${m.drifting ? 'DRIFT' : 'road'}`} />
    <Row label="device / steer input" value={`${c.device} / ${c.steeringInput.toFixed(2)}`} />
    <Row label="player / counter target" value={`${degrees(c.playerTarget)}° / ${degrees(c.counterTarget)}°`} />
    <Row label="target / actual rack" value={`${degrees(c.finalTarget)}° / ${degrees(c.actualSteering)}°`} />
    <Row label="rack velocity" value={`${degrees(c.steeringVelocity)}°/s`} />
    <Row label="throttle raw / ramp / assist" value={`${c.throttleRaw.toFixed(2)} / ${c.throttleFiltered.toFixed(2)} / ${c.throttleAssisted.toFixed(2)}`} />
    <Row label="RPM / gear / clutch" value={`${Math.round(m.engineRpm)} / ${m.gear} / ${m.clutch.toFixed(2)}`} />
    <Row label="diff / TCS / ESC" value={`${m.differentialLock.toFixed(2)} / ${m.tcs} / ${m.esc ? 'on' : 'off'}`} />
    <div className="overflow-x-auto">
      <table className="w-full text-right text-[10px]" aria-label="Individual tire telemetry">
        <thead><tr><th>Wheel</th><th>α°</th><th>κ</th><th>RPM</th><th>Load N</th><th>Grip</th><th>°C</th><th>Wear</th><th>PSI</th></tr></thead>
        <tbody>{m.wheels.map((w, i) => <tr key={i}>
          <th>{['FL', 'FR', 'RL', 'RR'][i]}{w.isLocked ? ' LOCK' : w.isSpinning ? ' SPIN' : ''}</th>
          <td>{degrees(w.slipAngle)}</td><td>{w.slipRatio.toFixed(2)}</td><td>{Math.round(w.wheelRPM)}</td>
          <td>{Math.round(w.verticalLoad)}</td><td>{w.surfaceGrip.toFixed(2)}</td><td>{w.temperature.toFixed(0)}</td>
          <td>{(w.wear * 100).toFixed(1)}%</td><td>{w.pressure.toFixed(1)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
