import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BANWA_DALAGAN_1996, type VehicleDefinition } from "@/game-core/vehicles";
import { VehicleModel, VehicleModelError } from "./VehicleModel";
import { VehicleVisual } from "./VehicleVisual";

const GLB = new Uint8Array(readFileSync("public/model/starter_sedan.glb"));

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

function withModel(change: (model: VehicleDefinition["visual"]["model"]) => void): VehicleDefinition {
  const definition = structuredClone(BANWA_DALAGAN_1996);
  change(definition.visual.model);
  return definition;
}

function worldPosition(node: TransformNode): Vector3 {
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
}

describe("VehicleModel import", () => {
  it("rigs the starter sedan in car space with wheel hubs at their centres on the ground", async () => {
    const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, GLB);

    const hubs = Object.fromEntries(model.wheels.map((w) => [w.id, worldPosition(w.hub)]));
    for (const wheel of model.wheels) {
      expect(wheel.radius).toBeCloseTo(0.3, 2);
      expect(hubs[wheel.id].y).toBeCloseTo(0.3, 2);
      expect(wheel.hub.parent).toBe(model.root);
      expect(wheel.socket.parent).toBe(wheel.hub);
      expect(wheel.socket.name).toBe(`wheel_${wheel.id}_socket`);
      expect(wheel.mesh.parent).toBe(wheel.socket);
    }
    expect(hubs.fl.z - hubs.rl.z).toBeCloseTo(2.5, 2);
    expect(Math.abs(hubs.fl.x - hubs.fr.x)).toBeCloseTo(1.456, 2);
    expect(model.wheels.filter((w) => w.front).map((w) => w.id)).toEqual(["fl", "fr"]);
  });

  it("reports render cost and non-fatal asset issues instead of failing", async () => {
    const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, GLB);
    expect(model.stats.materials).toBe(12);
    expect(model.stats.drawCalls).toBe(32);
    expect(model.stats.triangles).toBeGreaterThan(1000);
    expect(model.stats.triangles).toBeLessThan(BANWA_DALAGAN_1996.visual.model.budget.maxTriangles);
    // starter_sedan.glb has wheel_fl/rl on the car's right: flagged, not fatal.
    expect(model.warnings.some((w) => w.includes('"wheel_fl"') && w.includes("mirrored"))).toBe(true);
    expect(scene.materials.every((m) => m.isFrozen)).toBe(true);
  });

  it("moves the body but not the wheels with ride height, clamped to the definition's range", async () => {
    const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, GLB);
    const body = scene.getTransformNodeByName("body")!;
    const hood = model.attachments.get("hood")!.anchor;
    const bodyY = worldPosition(body).y;
    const hoodY = worldPosition(hood).y;
    const hubY = worldPosition(model.wheels[0].hub).y;

    expect(model.setRideHeight(-0.04)).toBe(-0.04);
    expect(worldPosition(body).y).toBeCloseTo(bodyY - 0.04, 5);
    expect(worldPosition(hood).y).toBeCloseTo(hoodY - 0.04, 5);
    expect(worldPosition(model.wheels[0].hub).y).toBeCloseTo(hubY, 5);

    expect(model.setRideHeight(-1)).toBe(BANWA_DALAGAN_1996.visual.rideHeight.minM);
    expect(model.setRideHeight(1)).toBe(BANWA_DALAGAN_1996.visual.rideHeight.maxM);
    expect(model.rideHeight).toBe(BANWA_DALAGAN_1996.visual.rideHeight.maxM);
  });

  it("exposes attachment anchors from data or the stock mesh, and swaps parts in and out", async () => {
    const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, GLB);
    expect([...model.attachments.keys()]).toEqual(BANWA_DALAGAN_1996.visual.model.attachments.map((a) => a.slot));

    const spoiler = model.attachments.get("spoiler")!;
    expect(spoiler.stock).toBeNull();
    expect(worldPosition(spoiler.anchor).z).toBeCloseTo(-1.95, 5);

    const exhaust = model.attachments.get("exhaust")!;
    expect(exhaust.stock?.name).toBe("exhaust");
    expect(worldPosition(exhaust.anchor).z).toBeLessThan(-2);

    const muffler = new TransformNode("big_muffler", scene);
    expect(model.mountPart("exhaust", muffler)).toBeNull();
    expect(muffler.parent).toBe(exhaust.anchor);
    expect(exhaust.stock!.isEnabled()).toBe(false);

    expect(model.mountPart("exhaust", null)).toBe(muffler);
    expect(muffler.parent).toBeNull();
    expect(exhaust.stock!.isEnabled()).toBe(true);
  });

  it("recolours only the paint material", async () => {
    const model = await VehicleModel.load(scene, BANWA_DALAGAN_1996, GLB);
    const paint = scene.getMaterialByName("paint") as PBRMaterial;
    const trim = scene.getMaterialByName("trim") as PBRMaterial;
    const trimBefore = trim.albedoColor.clone();

    model.setPaint("#c81e1e");
    expect(paint.albedoColor.equalsWithEpsilon(Color3.FromHexString("#c81e1e").toLinearSpace(), 1e-4)).toBe(true);
    expect(paint.isFrozen).toBe(true);
    expect(trim.albedoColor.equals(trimBefore)).toBe(true);
    expect(() => model.setPaint("red")).toThrow(/#rrggbb/);
  });

  it("fails with every missing node listed and leaves the scene clean", async () => {
    const definition = withModel((m) => {
      m.wheelNodes.fl = "wheel_front_left";
      m.bodyNodes.push("hood");
      m.paintMaterial = "candy_paint";
    });
    const error = await VehicleModel.load(scene, definition, GLB).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VehicleModelError);
    expect((error as VehicleModelError).problems).toEqual([
      'missing node "hood" (body)',
      'missing node "wheel_front_left" (wheel fl)',
      'missing material "candy_paint" (paint)',
    ]);
    expect((error as Error).message).toContain("/model/starter_sedan.glb");
    expect(scene.meshes).toHaveLength(0);
    expect(scene.transformNodes).toHaveLength(0);
    expect(scene.materials).toHaveLength(0);
  });

  it("fails on a wrong unit scale instead of spawning a giant car", async () => {
    const error = await VehicleModel.load(scene, withModel((m) => (m.unitScale = 100)), GLB).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VehicleModelError);
    expect((error as Error).message).toMatch(/"wheel_fl" radius is 30\.000 m, expected ~0\.300 m/);
    expect(scene.meshes).toHaveLength(0);
  });

  it("fails on a missing stock part for a declared slot", async () => {
    const definition = withModel((m) => (m.attachments.find((a) => a.slot === "spoiler")!.stockNode = "spoiler"));
    await expect(VehicleModel.load(scene, definition, GLB)).rejects.toThrow('missing node "spoiler" (stock spoiler)');
  });
});

describe("VehicleVisual wheel animation", () => {
  it("steers the front hubs toward +x for a right turn and rolls the top of the wheel forward", async () => {
    const parent = new TransformNode("car", scene);
    const visual = await VehicleVisual.load(scene, BANWA_DALAGAN_1996, parent, GLB);
    const [fl, , rl] = visual.model.wheels;

    visual.update(0, 0.3, 0);
    const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), fl.hub.computeWorldMatrix(true));
    expect(forward.x).toBeGreaterThan(0.2);
    const rearForward = Vector3.TransformNormal(new Vector3(0, 0, 1), rl.hub.computeWorldMatrix(true));
    expect(rearForward.x).toBeCloseTo(0, 5);

    visual.update(0.05, 0, 5);
    const top = Vector3.TransformNormal(new Vector3(0, 1, 0), rl.hub.computeWorldMatrix(true));
    expect(top.z).toBeGreaterThan(0);
  });
});
