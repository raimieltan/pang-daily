import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { GameBridge, type GameEventMap } from "../bridge";
import { HUB_LAYOUT } from "../world/hub/hubLayout";
import { buildChunk, WorldKit } from "../world/WorldChunk";
import { GraphicsSystem } from "./GraphicsSystem";
import { GRAPHICS_PRESETS } from "./LightingConfig";
import { NightLighting } from "./NightLighting";

let engine: NullEngine | null = null;
afterEach(() => {
  engine?.dispose();
  engine = null;
});

function setup(baseScaling = 1) {
  engine = new NullEngine();
  // NullEngine always reports 1; stand in for a real engine's level.
  let level = baseScaling;
  engine.getHardwareScalingLevel = () => level;
  engine.setHardwareScalingLevel = (value: number) => void (level = value);
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(130, 3, 90), scene);
  const kit = new WorldKit(scene);
  const chunk = buildChunk(scene, HUB_LAYOUT.chunks.find((c) => c.id === "coffee_shop")!, kit, { physics: false });
  const lighting = new NightLighting(scene, HUB_LAYOUT.chunks.flatMap((c) => c.lamps), kit.litMaterials, 8);
  const bridge = new GameBridge();
  const events: { name: keyof GameEventMap; payload: unknown }[] = [];
  for (const name of ["graphicsState", "renderStats", "graphicsBenchmark", "commandRejected"] as const) {
    bridge.ui.events.on(name, (payload) => events.push({ name, payload }));
  }
  const graphics = new GraphicsSystem(scene, engine, camera, bridge.runtime, lighting, chunk.pools ? [chunk.pools] : [], "high");
  const frames = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      lighting.update(1 / 60);
      graphics.update(1 / 60);
      scene.render();
    }
  };
  return { scene, graphics, lighting, commands: bridge.ui.commands, events, frames, pools: chunk.pools! };
}

describe("GraphicsSystem", () => {
  it("applies a preset, then single-effect overrides on top of it", () => {
    const { graphics, lighting, commands, pools } = setup();
    commands.setGraphics({ quality: "low" });
    expect(graphics.current).toEqual(GRAPHICS_PRESETS.low);
    expect(lighting.poolSize).toBe(GRAPHICS_PRESETS.low.lightPoolSize);

    commands.setGraphics({ bloom: true, lightPools: false });
    expect(graphics.current).toMatchObject({ quality: "low", bloom: true, lightPools: false });
    expect(graphics.pipeline?.bloomEnabled).toBe(true);
    expect(pools.isEnabled()).toBe(false);
  });

  it("drops the post pipeline when only in-shader effects are left, keeping tone mapping in the materials", () => {
    const { scene, graphics, commands } = setup();
    expect(graphics.pipeline).not.toBeNull();

    // Low keeps only the vignette: no offscreen targets, no full-screen passes.
    commands.setGraphics({ quality: "low" });
    expect(graphics.pipeline).toBeNull();
    const ip = scene.imageProcessingConfiguration;
    expect(ip.isEnabled).toBe(true);
    expect(ip.applyByPostProcess).toBe(false);
    expect(ip.toneMappingEnabled).toBe(true);
    expect(ip.vignetteEnabled).toBe(true);

    commands.setGraphics({ quality: "high" });
    expect(graphics.pipeline?.bloomEnabled).toBe(true);
  });

  it("keeps the GPU timer off unless asked for, across preset changes", () => {
    const { graphics, commands } = setup();
    expect(graphics.current.gpuTimer).toBe(false);
    commands.setGraphics({ gpuTimer: true });
    commands.setGraphics({ quality: "medium" });
    expect(graphics.current.gpuTimer).toBe(true);
  });

  it("scales resolution relative to the screen's pixel ratio, and hands it back on dispose", () => {
    // A 2× HiDPI screen: the engine starts at 0.5 (two device pixels per CSS pixel).
    const { graphics, commands } = setup(0.5);
    expect(engine!.getHardwareScalingLevel()).toBe(0.5);
    commands.setGraphics({ quality: "low" });
    expect(engine!.getHardwareScalingLevel()).toBe(0.5 * GRAPHICS_PRESETS.low.hardwareScaling);
    graphics.dispose();
    expect(engine!.getHardwareScalingLevel()).toBe(0.5);
  });

  it("rejects unknown quality levels", () => {
    const { commands, events } = setup();
    commands.setGraphics({ quality: "ultra" as never });
    expect(events.some((e) => e.name === "commandRejected")).toBe(true);
  });

  it("publishes render stats about once a second", () => {
    const { events, frames } = setup();
    frames(2.1);
    const stats = events.filter((e) => e.name === "renderStats");
    expect(stats.length).toBe(2);
    expect(stats[0].payload).toMatchObject({ drawCalls: expect.any(Number), lights: expect.any(Number) });
  });

  it("benchmarks with post off then on, and restores the settings it started from", () => {
    const { graphics, commands, events, frames } = setup();
    commands.setGraphics({ quality: "medium" });
    commands.runGraphicsBenchmark(1);
    expect(graphics.pipeline).toBeNull();
    commands.setGraphics({ quality: "high" });
    expect(events.at(-1)?.name).toBe("commandRejected");

    frames(4.5);
    const result = events.find((e) => e.name === "graphicsBenchmark")?.payload as GameEventMap["graphicsBenchmark"];
    expect(result.settings.quality).toBe("medium");
    expect(result.off.frames).toBeGreaterThan(30);
    expect(result.on.frames).toBeGreaterThan(30);
    expect(graphics.current).toEqual(GRAPHICS_PRESETS.medium);
    expect(graphics.pipeline?.bloomEnabled).toBe(true);
  });

  it("never re-syncs mesh light lists while the pool moves between lamps", () => {
    const { scene, lighting } = setup();
    const car = { position: new Vector3(-100, 0, 0), forward: new Vector3(1, 0, 0) };
    lighting.attachCar(car, []);
    const lights = new Set(scene.lights);
    const enabledBefore = scene.lights.map((l) => l.isEnabled());
    // Drive the focus across the whole hub so every slot changes lamp several times.
    for (let i = 0; i < 600; i++) {
      car.position.x = -150 + i * 0.65;
      lighting.update(1 / 60);
    }
    expect(new Set(scene.lights)).toEqual(lights);
    expect(scene.lights.map((l) => l.isEnabled())).toEqual(enabledBefore);
  });
});
