import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { MOODS } from "./LightingConfig";
import { SceneLighting } from "./SceneLighting";
import { bodyDirection, Sky, skyLast } from "./Sky";

let engine: NullEngine | null = null;
afterEach(() => engine?.dispose());

describe("Sky", () => {
  it("puts the morning sun low in the east and the afternoon sun high in the west", () => {
    const morning = bodyDirection(MOODS.morning);
    expect(morning.x).toBeGreaterThan(0.8);
    expect(Math.asin(morning.y) * (180 / Math.PI)).toBeCloseTo(MOODS.morning.sky.body.elevationDeg, 5);
    const afternoon = bodyDirection(MOODS.afternoon);
    expect(afternoon.x).toBeLessThan(0);
    expect(afternoon.length()).toBeCloseTo(1, 5);
  });

  it("sorts the dome after every other opaque mesh", () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const sky = CreateBox("sky", {}, scene);
    const box = CreateBox("box", {}, scene);
    const sort = skyLast(sky, () => 0);
    const [skySub, boxSub] = [sky.subMeshes[0], box.subMeshes[0]] as [SubMesh, SubMesh];
    expect([skySub, boxSub].sort(sort)[1]).toBe(skySub);
    expect([boxSub, skySub].sort(sort)[1]).toBe(skySub);
  });

  it("follows the lighting's time of day", () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const lighting = new SceneLighting(scene, [], [], [], 0, "night");
    const sky = new Sky(scene, lighting);
    const stars = () => (sky.mesh.material as unknown as { _floats: Record<string, number> })._floats.stars;
    expect(stars()).toBe(1);
    lighting.setTimeOfDay("afternoon");
    sky.update(1 / 60);
    expect(stars()).toBe(0);
    sky.dispose();
    expect(sky.mesh.isDisposed()).toBe(true);
  });
});
