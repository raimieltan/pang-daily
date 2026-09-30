import type { VehicleTelemetry } from '@/game/bridge';
import { DEG } from '@/game-core/suspension/schema';
export function SuspensionDebugReadout({ state }: { state: NonNullable<VehicleTelemetry['suspension']> }) {
  return <details className="mt-2 border-t border-white/20 pt-2" open><summary>Suspension · live corner forces</summary>
    <div className="grid grid-cols-2 gap-2 py-2" aria-label="Suspension diagnostics">{state.corners.map((c, i) => <div className="border border-white/10 p-2 text-[10px]" key={c.corner}>
      <strong>{c.corner} · {c.status}</strong>
      <p>Travel {(c.compression * 1000).toFixed(0)} mm · bump {(c.travelRemainingCompression * 1000).toFixed(0)} / droop {(c.travelRemainingDroop * 1000).toFixed(0)} mm</p>
      <p>Spring {(c.springForce / 1000).toFixed(2)} · damper {(c.damperForce / 1000).toFixed(2)} · stop {(c.bumpStopForce / 1000).toFixed(2)} kN</p>
      <p>Load {(c.wheelLoad / 1000).toFixed(2)} kN · ARB {(c.arbForce / 1000).toFixed(2)} kN</p>
      <p>Camber {(c.camber / DEG).toFixed(2)}° · toe {(c.toe / DEG).toFixed(2)}° · steer {(c.steeringAngle / DEG).toFixed(1)}°</p>
      <p>Damper {Math.round(state.saved.damage[i].health.damper * 100)}% · arm {Math.round(state.saved.damage[i].health.lowerControlArm * 100)}%{c.rubbing ? ' · RUBBING' : ''}</p>
    </div>)}</div>
  </details>;
}
