"use client";

import { useState } from "react";
import type { GraphicsQuality, GraphicsSettings } from "@/game";
import { useGameUiStore } from "@/state/gameUiStore";
import { useGraphicsStore } from "@/state/graphicsStore";

const buttonClass = "rounded border border-amber-200/30 px-2 py-0.5 hover:bg-amber-200/10";
const QUALITIES: GraphicsQuality[] = ["high", "medium", "low"];
const TOGGLES: { key: keyof GraphicsSettings; label: string }[] = [
  { key: "bloom", label: "bloom" },
  { key: "grain", label: "grain" },
  { key: "vignette", label: "vignette" },
  { key: "chromaticAberration", label: "chromatic ab." },
  { key: "fxaa", label: "fxaa" },
  { key: "lightPools", label: "light pools" },
  { key: "gpuTimer", label: "gpu timer" },
];

/**
 * Night graphics panel (docs/NIGHT_LIGHTING.md): quality presets, per-effect toggles for the
 * expensive passes, the live frame cost, and the post on/off benchmark. Night scenes only.
 */
export function GraphicsDebugPanel() {
  const settings = useGraphicsStore((s) => s.settings);
  const stats = useGraphicsStore((s) => s.stats);
  const benchmark = useGraphicsStore((s) => s.benchmark);
  const benchmarking = useGraphicsStore((s) => s.benchmarking);
  const commands = useGameUiStore((s) => s.commands);
  const [open, setOpen] = useState(true);

  if (!settings) return null;

  return (
    <div
      className="pointer-events-auto w-60 rounded border border-amber-200/20 bg-black/70 p-2 text-[11px] leading-tight"
      data-testid="graphics-debug"
    >
      <div className="flex items-center justify-between">
        <span className="tracking-widest uppercase">Graphics</span>
        <button type="button" className={buttonClass} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2 tabular-nums">
          <div className="flex gap-1">
            {QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                className={`${buttonClass} ${settings.quality === q ? "bg-amber-200/20" : ""}`}
                onClick={(e) => {
                  commands?.setGraphics({ quality: q });
                  e.currentTarget.blur();
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {TOGGLES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(e) => {
                    commands?.setGraphics({ [key]: e.target.checked });
                    e.currentTarget.blur();
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <Row label="lamp lights / scale" value={`${settings.lightPoolSize} / ${settings.hardwareScaling}×`} />
          {stats && (
            <>
              <Row label="fps" value={String(stats.fps)} />
              <Row label="cpu frame" value={`${stats.frameMs.toFixed(2)} ms`} />
              <Row label="gpu frame" value={stats.gpuMs === null ? (settings.gpuTimer ? "n/a (no timer query)" : "off") : `${stats.gpuMs.toFixed(2)} ms`} />
              <Row label="draw calls / meshes" value={`${stats.drawCalls} / ${stats.activeMeshes}`} />
              <Row label="lights" value={String(stats.lights)} />
            </>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={benchmarking}
            onClick={(e) => {
              useGraphicsStore.setState({ benchmarking: true });
              commands?.runGraphicsBenchmark(4);
              e.currentTarget.blur();
            }}
          >
            {benchmarking ? "Measuring… (hold still)" : "Benchmark post (off vs on)"}
          </button>
          {benchmark && (
            <div className="flex flex-col gap-0.5">
              <Row label="post off" value={cost(benchmark.off)} />
              <Row label={`post on (${benchmark.settings.quality})`} value={cost(benchmark.on)} />
              <Row
                label="post cost"
                value={`${benchmark.postCostMs} ms cpu${benchmark.postGpuCostMs === null ? "" : ` · ${benchmark.postGpuCostMs} ms gpu`}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function cost(c: { frameMs: number; gpuMs: number | null }): string {
  return `${c.frameMs} ms${c.gpuMs === null ? "" : ` · ${c.gpuMs} gpu`}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-amber-200/60">{label}</span>
      <span>{value}</span>
    </div>
  );
}
