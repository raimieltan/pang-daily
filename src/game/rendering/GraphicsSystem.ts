import "@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery";
import "@babylonjs/core/Engines/Extensions/engine.query";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";
import type { FrameCost, RenderStats, RuntimePort } from "../bridge";
import type { GameSystem } from "../engine/types";
import {
  DEFAULT_GRAPHICS_QUALITY,
  GRAPHICS_PRESETS,
  POST_TUNING,
  type GraphicsQuality,
  type GraphicsSettings,
} from "./LightingConfig";
import type { NightLighting } from "./NightLighting";

const STATS_INTERVAL_SECONDS = 1;
const BENCHMARK_WARMUP_SECONDS = 1;
const POST_OFF = { bloom: false, grain: false, vignette: false, chromaticAberration: false, fxaa: false } as const;

type Benchmark = { phase: "off" | "on"; elapsed: number; samples: { off: FrameSample[]; on: FrameSample[] }; seconds: number; restore: GraphicsSettings };
type FrameSample = { frameMs: number; gpuMs: number | null };

/**
 * Post-processing and quality settings for the night scenes, plus the performance readout:
 *
 * - A `DefaultRenderingPipeline` (HDR, bloom, grain, chromatic aberration, FXAA), created only
 *   while one of those is on. Tone mapping, exposure, contrast and vignette live on the scene's
 *   image-processing config: with the pipeline up it applies them in its last pass; without it
 *   the materials apply them in-shader, so low quality renders straight to the canvas with no
 *   offscreen targets or full-screen passes. Values from `POST_TUNING`, presets from
 *   `GRAPHICS_PRESETS`.
 * - `setGraphics` applies a preset and/or overrides; `graphicsState` reports the result.
 * - `renderStats` (1 Hz): fps, CPU frame time, draw calls, active meshes and lights, plus GPU
 *   frame time while `gpuTimer` is on and the browser exposes the timer query (null otherwise).
 *   The timer is off by default: per-frame timer queries are not free on every driver.
 * - `runGraphicsBenchmark`: averages frame cost with all post effects off, then with the
 *   current settings, and emits `graphicsBenchmark`: the measured cost of the post stack.
 */
export class GraphicsSystem implements GameSystem {
  readonly name = "graphics";
  /** Null while no pipeline effect is on. */
  pipeline: DefaultRenderingPipeline | null = null;
  private settings: GraphicsSettings;
  private readonly sceneStats: SceneInstrumentation;
  private readonly engineStats: EngineInstrumentation;
  /** The engine's own level (1/devicePixelRatio on HiDPI screens); presets scale relative to it. */
  private readonly baseScaling: number;
  private statsClock = 0;
  private benchmark: Benchmark | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly engine: AbstractEngine,
    private readonly camera: Camera,
    private readonly bridge: RuntimePort,
    private readonly lighting: NightLighting,
    private readonly pools: readonly Mesh[],
    quality: GraphicsQuality = DEFAULT_GRAPHICS_QUALITY,
  ) {
    this.baseScaling = engine.getHardwareScalingLevel();
    configureImageProcessing(scene.imageProcessingConfiguration);

    this.sceneStats = new SceneInstrumentation(scene);
    this.sceneStats.captureFrameTime = true;
    this.engineStats = new EngineInstrumentation(engine);

    this.settings = { ...GRAPHICS_PRESETS[quality] };
    this.apply(this.settings);

    bridge.handle("setGraphics", (patch) => {
      if (patch.quality && !(patch.quality in GRAPHICS_PRESETS)) return { rejected: `Unknown quality "${patch.quality}"` };
      if (this.benchmark) return { rejected: "A graphics benchmark is running" };
      const base = patch.quality ? GRAPHICS_PRESETS[patch.quality] : this.settings;
      // The GPU timer is a debug choice, not part of a preset: switching preset keeps it.
      this.apply({ ...base, gpuTimer: this.settings.gpuTimer, ...patch, quality: patch.quality ?? this.settings.quality });
    });
    bridge.handle("runGraphicsBenchmark", ({ seconds = 4 }) => {
      if (this.benchmark) return { rejected: "A graphics benchmark is already running" };
      const restore = { ...this.settings };
      this.benchmark = { phase: "off", elapsed: 0, samples: { off: [], on: [] }, seconds, restore };
      this.apply({ ...restore, ...POST_OFF, gpuTimer: true }, false);
    });
  }

  get current(): Readonly<GraphicsSettings> {
    return this.settings;
  }

  update(dt: number): void {
    const sample = this.sample();
    if (this.benchmark) this.stepBenchmark(dt, sample);
    this.statsClock += dt;
    if (this.statsClock < STATS_INTERVAL_SECONDS) return;
    this.statsClock = 0;
    this.bridge.emit("renderStats", this.stats());
  }

  dispose(): void {
    this.setPipeline(false);
    this.sceneStats.dispose();
    this.engineStats.dispose();
    // Hardware scaling is engine-wide; don't leak it into the next scene.
    this.engine.setHardwareScalingLevel(this.baseScaling);
  }

  /** Builds or tears down the post pipeline. Only on settings changes: it recompiles shaders. */
  private setPipeline(on: boolean): DefaultRenderingPipeline | null {
    if (on && !this.pipeline) {
      const p = new DefaultRenderingPipeline("night", POST_TUNING.hdr, this.scene, [this.camera]);
      const t = POST_TUNING;
      p.bloomThreshold = t.bloom.threshold;
      p.bloomWeight = t.bloom.weight;
      p.bloomKernel = t.bloom.kernel;
      p.bloomScale = t.bloom.scale;
      p.grain.intensity = t.grain.intensity;
      p.grain.animated = t.grain.animated;
      p.chromaticAberration.aberrationAmount = t.chromaticAberration.amount;
      p.chromaticAberration.radialIntensity = t.chromaticAberration.radialIntensity;
      this.pipeline = p;
    } else if (!on && this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
      // Hand image processing back to the materials (the pipeline doesn't on dispose).
      const ip = this.scene.imageProcessingConfiguration;
      ip.isEnabled = true;
      ip.applyByPostProcess = false;
    }
    return this.pipeline;
  }

  private apply(settings: GraphicsSettings, publish = true): void {
    const p = this.setPipeline(settings.bloom || settings.grain || settings.chromaticAberration || settings.fxaa);
    if (p) {
      p.bloomEnabled = settings.bloom;
      p.grainEnabled = settings.grain;
      p.chromaticAberrationEnabled = settings.chromaticAberration;
      p.fxaaEnabled = settings.fxaa;
    }
    this.scene.imageProcessingConfiguration.vignetteEnabled = settings.vignette;
    this.engineStats.captureGPUFrameTime = settings.gpuTimer;
    for (const pool of this.pools) pool.setEnabled(settings.lightPools);
    if (settings.lightPoolSize !== this.lighting.poolSize) this.lighting.setPoolSize(settings.lightPoolSize);
    const level = this.baseScaling * settings.hardwareScaling;
    if (level !== this.engine.getHardwareScalingLevel()) this.engine.setHardwareScalingLevel(level);
    this.settings = settings;
    if (publish) this.bridge.emit("graphicsState", { ...settings });
  }

  private sample(): FrameSample {
    const gpu = this.engineStats.gpuFrameTimeCounter;
    return {
      frameMs: this.sceneStats.frameTimeCounter.current,
      // Nanoseconds; zero until (or unless) the timer query extension reports.
      gpuMs: gpu && gpu.current > 0 ? gpu.current / 1e6 : null,
    };
  }

  private stats(): RenderStats {
    const gpu = this.engineStats.gpuFrameTimeCounter;
    return {
      fps: Math.round(this.engine.getFps()),
      frameMs: round(this.sceneStats.frameTimeCounter.lastSecAverage),
      gpuMs: gpu && gpu.lastSecAverage > 0 ? round(gpu.lastSecAverage / 1e6) : null,
      drawCalls: this.sceneStats.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      lights: this.scene.lights.filter((l) => l.isEnabled()).length,
    };
  }

  private stepBenchmark(dt: number, sample: FrameSample): void {
    const b = this.benchmark!;
    b.elapsed += dt;
    if (b.elapsed > BENCHMARK_WARMUP_SECONDS) b.samples[b.phase].push(sample);
    if (b.elapsed < BENCHMARK_WARMUP_SECONDS + b.seconds) return;
    if (b.phase === "off") {
      b.phase = "on";
      b.elapsed = 0;
      this.apply(b.restore, false);
      return;
    }
    this.benchmark = null;
    this.apply(b.restore);
    const off = summarize(b.samples.off);
    const on = summarize(b.samples.on);
    this.bridge.emit("graphicsBenchmark", {
      settings: { ...b.restore },
      off,
      on,
      postCostMs: round(on.frameMs - off.frameMs),
      postGpuCostMs: on.gpuMs !== null && off.gpuMs !== null ? round(on.gpuMs - off.gpuMs) : null,
    });
  }
}

function configureImageProcessing(ip: ImageProcessingConfiguration): void {
  const t = POST_TUNING;
  ip.isEnabled = true;
  ip.toneMappingEnabled = t.toneMapping.aces;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = t.toneMapping.exposure;
  ip.contrast = t.toneMapping.contrast;
  ip.vignetteWeight = t.vignette.weight;
  ip.vignetteStretch = t.vignette.stretch;
  ip.vignetteColor = Color4.FromHexString(`${t.vignette.color}ff`);
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
}

function summarize(samples: readonly FrameSample[]): FrameCost {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const gpu = samples.map((s) => s.gpuMs).filter((x): x is number => x !== null);
  return {
    frames: samples.length,
    frameMs: round(mean(samples.map((s) => s.frameMs))),
    gpuMs: gpu.length ? round(mean(gpu)) : null,
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
