"use client";

import { useVehicleDebugStore } from "@/state/vehicleDebugStore";
import { Bar, Row } from "./HandlingDebugPanel";

const kmh = (mps: number) => `${Math.round(mps * 3.6)} km/h`;
const m = (value: number) => `${value.toFixed(1)} m`;

/** Race AI readout: what the rival is doing and why. Only shown while a rival drives. */
export function AIDebugPanel() {
  const ai = useVehicleDebugStore((s) => s.ai);
  if (!ai) return null;
  return (
    <div className="pointer-events-auto w-full border border-white/20 bg-black/35 p-4 text-xs leading-relaxed" data-testid="ai-debug">
      <span className="tracking-widest uppercase">Race AI · {ai.driverId}</span>
      <div className="mt-2 flex flex-col gap-0.5">
        <Row label="State / phase" value={`${ai.state} · ${ai.phase}`} />
        <Row label="Road" value={ai.roadState} />
        <Row label="Recovery" value={`${ai.recovery} · stuck ${ai.stuckSeconds.toFixed(1)} s · tries ${ai.attempts}`} />
        <Row label="Speed / target / line" value={`${kmh(ai.speed)} / ${kmh(Math.min(ai.targetSpeed, 99))} / ${kmh(ai.lineSpeed)}`} />
        <Row label="Lookahead" value={`${m(ai.lookahead.immediate)} · ${m(ai.lookahead.tactical)} · ${m(ai.lookahead.braking)} · ${m(ai.lookahead.strategic)}`} />
        <Row label="Corner" value={ai.corner ? `${ai.corner.direction} · sev ${ai.corner.severity.toFixed(2)} · apex in ${m(ai.corner.toApex)}` : "none"} />
        <Row label="Offset line / race / target" value={`${m(ai.lineOffset)} / ${m(ai.racecraftOffset)} / ${m(ai.targetOffset)}`} />
        <Row label="Vehicle ahead / traffic limited" value={`${ai.vehicleAhead ? "yes" : "no"} / ${ai.trafficLimited ? "yes" : "no"}`} />
        <Row label="Progress" value={m(ai.routeS)} />
        <Bar label="Throttle" value={ai.throttle} />
        <Bar label="Brake" value={ai.brake} />
        <Bar label="Steer" value={ai.steering} signed />
        <Bar label="Front grip" value={ai.frontGrip} />
        <Bar label="Rear grip" value={ai.rearGrip} />
        <Bar label="Slip" value={ai.slip * 4} signed />
      </div>
    </div>
  );
}
