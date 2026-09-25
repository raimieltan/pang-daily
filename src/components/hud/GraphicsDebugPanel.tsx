"use client";

import { WEATHER_TYPES } from "@/game/weather/Weather";
import { useState } from "react";
import { TIMES_OF_DAY, type GraphicsQuality, type GraphicsSettings } from "@/game";
import { useGameUiStore } from "@/state/gameUiStore";
import { useGraphicsStore } from "@/state/graphicsStore";
import { ANALOG_KEYS, ANALOG_LIMITS, ANALOG_PRESETS, ANALOG_PRESET_NAMES, type AnalogPreset } from "@/game/rendering/AnalogConfig";

const buttonClass = "rounded border border-white/30 px-2 py-0.5 hover:bg-white/10";
const QUALITIES: GraphicsQuality[] = ["high", "medium", "low"];
const TOGGLES: { key: keyof GraphicsSettings; label: string }[] = [
  { key: "analog", label: "analog video" },
  { key: "bloom", label: "bloom" },
  { key: "grain", label: "grain" },
  { key: "vignette", label: "vignette" },
  { key: "chromaticAberration", label: "chromatic ab." },
  { key: "fxaa", label: "fxaa" },
  { key: "lightPools", label: "light pools" },
  { key: "gpuTimer", label: "gpu timer" },
];

/**
 * Graphics panel (docs/NIGHT_LIGHTING.md): time of day, quality presets, per-effect toggles for
 * the expensive passes, the live frame cost, and the post on/off benchmark. Lit scenes only.
 */
export function GraphicsDebugPanel() {
  const settings = useGraphicsStore((s) => s.settings);
  const weather = useGraphicsStore((s) => s.weather);
  const timeOfDay = useGraphicsStore((s) => s.timeOfDay);
  const stats = useGraphicsStore((s) => s.stats);
  const benchmark = useGraphicsStore((s) => s.benchmark);
  const benchmarking = useGraphicsStore((s) => s.benchmarking);
  const commands = useGameUiStore((s) => s.commands);
  const [open, setOpen] = useState(true);

  if (!settings) return null;

  return (
    <div
      className="tape-settings pointer-events-auto w-72 max-h-[72dvh] overflow-y-auto border border-white/15 bg-black/85 p-4 text-[11px] leading-tight"
      data-testid="graphics-debug"
    >
      <div className="flex items-center justify-between">
        <span className="tracking-widest uppercase">Video / signal</span>
        <button type="button" className={buttonClass} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2 tabular-nums">
          <label className="flex flex-col gap-2">Tape preset
            <select aria-label="Tape preset" className="border border-white/25 bg-neutral-950 p-2" value={settings.analogPreset}
              onChange={e => { commands?.setGraphics({ analog: true, analogPreset: e.target.value as AnalogPreset, analogOverrides: {} }); e.currentTarget.blur(); }}>
              {ANALOG_PRESET_NAMES.map(name => <option key={name} value={name}>{name.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">Signal strength
            <input aria-label="Signal strength" type="range" min="0" max="1" step="0.05" value={settings.analogIntensity}
              onChange={e => commands?.setGraphics({ analogIntensity: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.reducedMotion} onChange={e => { commands?.setGraphics({ reducedMotion: e.target.checked }); e.currentTarget.blur(); }} />
            Reduced motion / steady signal
          </label>
          <details className="border-y border-white/10 py-2">
            <summary className="cursor-pointer">Individual signal controls</summary>
            <p className="my-2 text-white/50">Overrides lock a parameter while other effects follow speed. Clear with a preset.</p>
            {ANALOG_KEYS.map(key => {
              const [min, max, step] = ANALOG_LIMITS[key];
              const value = settings.analogOverrides[key] ?? ANALOG_PRESETS[settings.analogPreset][key];
              return <label key={key} className="my-2 grid grid-cols-[1fr_90px_32px] items-center gap-2">
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input aria-label={`Analog ${key}`} type="range" min={min} max={max} step={step} value={value}
                  onChange={e => commands?.setGraphics({ analogOverrides: { ...settings.analogOverrides, [key]: Number(e.target.value) } })} />
                <span className="text-right">{value.toFixed(2)}</span>
              </label>;
            })}
          </details>
          <div className="flex gap-1">
            {TIMES_OF_DAY.map((t) => (
              <button
                key={t}
                type="button"
                className={`${buttonClass} ${timeOfDay === t ? "bg-white/20" : ""}`}
                onClick={(e) => {
                  commands?.setTimeOfDay(t);
                  e.currentTarget.blur();
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {WEATHER_TYPES.map(w => <button key={w} type="button" className={`${buttonClass} ${weather === w ? "bg-white/20" : ""}`} onClick={e => { commands?.setWeather(w); e.currentTarget.blur(); }}>{w}</button>)}
          </div>
          <div className="flex gap-1">
            {QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                className={`${buttonClass} ${settings.quality === q ? "bg-white/20" : ""}`}
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
      <span className="text-white/55">{label}</span>
      <span>{value}</span>
    </div>
  );
}
