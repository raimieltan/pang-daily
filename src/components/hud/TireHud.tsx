"use client";

import { useEffect, useState } from "react";
import { useGameEvent } from "@/components/game/useGameEvent";
import type { GameEventMap } from "@/game";

const DISMISS_AFTER_MS = 4000;
const SHORT: Record<string, string> = { FL: "FL", FR: "FR", RL: "RL", RR: "RR" };

/**
 * Tire warnings: a small four-corner diagram whenever anything is off (low, flat, spare fitted,
 * mid wheel change), plus toasts for punctures, inspection results and wheel-change steps.
 */
export function TireHud() {
  const [status, setStatus] = useState<GameEventMap["tireStatus"] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useGameEvent("tireStatus", setStatus);
  useGameEvent("tireEvent", ({ text }) => setNotice(text));
  useGameEvent("tireInspection", ({ text }) => setNotice(text));
  useGameEvent("sceneLoading", () => { setStatus(null); setNotice(null); });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const attention = status && (status.corners.some((c) => c.low || c.flat || !c.installed || c.spec === "donut") || status.jacked || status.held);
  if (!attention && !notice) return null;
  return (
    <div className="self-center flex flex-col items-center gap-1 text-xs" data-testid="tire-hud">
      {notice && <p className="text-amber-200">{notice}</p>}
      {attention && status && (
        <div className="flex items-center gap-3 rounded border border-white/20 bg-black/50 px-3 py-1.5">
          <div className="grid grid-cols-2 gap-1" aria-label="Tire status">
            {status.corners.map((c) => (
              <span key={c.corner} title={`${c.corner}: ${c.failure}`}
                className={`w-9 rounded px-1 text-center ${!c.installed ? "bg-white/10 text-white/40" : c.flat ? "bg-red-600/80" : c.low ? "bg-amber-500/80 text-black" : c.spec === "donut" ? "bg-sky-500/70" : "bg-white/15"}`}>
                {!c.installed ? "--" : c.flat ? "FLAT" : `${SHORT[c.corner]} ${Math.round(c.pressureRatio * 100)}`}
              </span>
            ))}
          </div>
          <div className="flex flex-col">
            {status.advisoryKph && <span className="text-sky-200">Spare fitted: max {status.advisoryKph} km/h</span>}
            {status.driveBlock && <span className="text-amber-200">{status.driveBlock}</span>}
            {status.held && <span>Holding a {status.held === "donut" ? "spare" : "wheel"}</span>}
            <span className="text-white/60">Spare: {status.spare ? (status.spare === "donut" ? "space-saver" : "road tire") : "none"}{!status.jack && " · no jack"}{!status.wrench && " · no wrench"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
