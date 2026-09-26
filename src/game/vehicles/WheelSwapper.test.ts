import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventorySession } from "@/game-core/inventory/InventorySession";
import { BANWA_DALAGAN_1996 } from "@/game-core/vehicles";
import { calculateFitment, wheelPart, type Fitment, type WheelPart } from "@/game-core/wheels";
import { GameBridge } from "../bridge";
import { VehicleModel } from "./VehicleModel";
import { WheelSwapper } from "./WheelSwapper";
import { WheelSystem, type WheelVehicle } from "./WheelSystem";

const GLB = new Uint8Array(readFileSync("public/model/banwa_dalagan_1996_modular.glb"));
const fromPublic = (path: string) => new Uint8Array(readFileSync(`public${path}`));
const car = BANWA_DALAGAN_1996;
const mags = wheelPart("mags_15_4x100")!;
const dish = wheelPart("oversized_17_deep_dish")!;

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

function bounds(node: TransformNode) {
  node.computeWorldMatrix(true);
  for (const child of node.getDescendants(false)) (child as TransformNode).computeWorldMatrix?.(true);
  const { min, max } = node.getHierarchyBoundingVectors(true);
  return { min, max, size: max.subtract(min), center: min.add(max).scaleInPlace(0.5) };
}

describe("WheelSwapper", () => {
  it("clones one asset onto all four sockets, sized to the part and outboard on both sides", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const load = vi.fn(fromPublic);
    const swapper = new WheelSwapper(scene, model, load);

    expect(await swapper.equip(dish)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(swapper.equipped).toBe(dish);
    for (const wheel of model.wheels) {
      expect(wheel.mesh.isEnabled()).toBe(false);
      expect(wheel.mounted?.parent).toBe(wheel.socket);
      expect(wheel.fit).toEqual(dish.fit);
      const b = bounds(wheel.mounted!);
      expect(b.size.y).toBeCloseTo(dish.fit.diameterM, 2);
      expect(b.size.x).toBeCloseTo(dish.fit.widthM, 2);
      // On the ground, pushed out by the lower offset.
      expect(b.min.y).toBeCloseTo(0, 2);
      const stockX = wheel.hub.getAbsolutePosition().x;
      expect(Math.sign(b.center.x - stockX)).toBe(wheel.side);
      expect(Math.abs(b.center.x - stockX)).toBeCloseTo(0.03, 2);
      expect(wheel.radius).toBeCloseTo(0.32, 2);
      // The rim face (chrome lip on this set) is on the outboard side.
      const chrome = wheel.mounted!.getChildMeshes().find((m) => m.material?.name === "chrome")!;
      expect(Math.sign(bounds(chrome).center.x - b.center.x)).toBe(wheel.side);
    }

    await swapper.equip(dish);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("lifts the body with a taller tire on top of ride height, and restores stock", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new WheelSwapper(scene, model, fromPublic);
    const bodyY = model.chassis.position.y;
    const hubY = model.wheels[0].hub.position.y;

    await swapper.equip(dish);
    expect(model.chassis.position.y).toBeCloseTo(bodyY + 0.02, 5);
    expect(model.wheels[0].hub.position.y).toBeCloseTo(hubY + 0.02, 5);
    model.setRideHeight(-0.03);
    expect(model.chassis.position.y).toBeCloseTo(-0.03 + 0.02, 5);
    expect(model.rideHeight).toBe(-0.03);

    const clone = model.wheels[0].mounted!;
    await swapper.equip(null);
    expect(clone.isDisposed()).toBe(true);
    for (const wheel of model.wheels) {
      expect(wheel.mounted).toBeNull();
      expect(wheel.mesh.isEnabled()).toBe(true);
      expect(wheel.socket.position.x).toBeCloseTo(0, 9);
      expect(wheel.fit).toEqual({ diameterM: 0.6, widthM: 0.175, offsetMm: 45, massKg: 13 });
    }
    expect(model.wheels[0].hub.position.y).toBeCloseTo(hubY, 5);
    expect(model.chassis.position.y).toBeCloseTo(-0.03, 5);
  });

  it("lets the latest equip win when loads overlap, and keeps the wheels if a load fails", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new WheelSwapper(scene, model, fromPublic);
    const [first, second] = await Promise.all([swapper.equip(dish), swapper.equip(mags)]);
    expect([first, second]).toEqual([false, true]);
    expect(model.wheels.every((w) => w.fit.offsetMm === mags.fit.offsetMm)).toBe(true);

    const broken: WheelPart = { ...mags, id: "broken_wheels", assetPath: "/model/wheels/missing.glb" };
    await expect(swapper.equip(broken)).rejects.toThrow();
    expect(swapper.equipped).toBe(mags);
    expect(model.wheels.every((w) => w.mounted !== null)).toBe(true);
  });
});

describe("WheelSystem", () => {
  function setup(saved?: unknown) {
    const bridge = new GameBridge();
    const inventory = new InventorySession(saved);
    const equipped: [string | null, number | null][] = [];
    let current: WheelPart | null = null;
    const vehicle: WheelVehicle = {
      id: car.id,
      definition: { spec: car },
      get fitment(): Fitment { return calculateFitment(car, current?.fit ?? car.wheels.stock); },
      equipWheels: async (part, condition) => { current = part; equipped.push([part?.id ?? null, condition]); return true; },
    };
    const views: unknown[] = [];
    bridge.ui.events.on("wheelsState", (view) => views.push(view));
    const system = new WheelSystem(bridge.runtime, inventory, vehicle);
    return { bridge, inventory, system, equipped, views };
  }
  const grant = { kind: "grant", reason: "test" } as const;
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  it("starts on stock and equips an owned set through the inventory install", async () => {
    const { bridge, inventory, equipped, views } = setup();
    const item = inventory.add({ partId: "oversized_17_deep_dish", condition: 0.4, origin: grant });
    if ("rejected" in item) throw new Error(item.rejected);
    await flush();
    expect(equipped).toEqual([[null, null]]);

    bridge.ui.commands.equipWheels(item.id);
    await flush();
    expect(inventory.installedOn(car.id)).toEqual({ wheels: item.id });
    expect(equipped.at(-1)).toEqual(["oversized_17_deep_dish", 0.4]);
    expect(views.at(-1)).toMatchObject({ itemId: item.id, partId: "oversized_17_deep_dish", fitment: { state: "poke" } });
    // Listed effects only: the item's hidden condition doesn't show through the grip number.
    expect(views.at(-1)).toMatchObject({ effects: { grip: 1.04 } });

    bridge.ui.commands.equipWheels(null);
    await flush();
    expect(inventory.installedOn(car.id)).toEqual({});
    expect(equipped.at(-1)).toEqual([null, null]);
    expect(views.at(-1)).toMatchObject({ itemId: null, name: "Stock wheels", fitment: { state: "clean" } });
  });

  it("re-equips a saved install on load and ignores unrelated inventory changes", async () => {
    const first = setup();
    const item = first.inventory.add({ partId: "mags_15_4x100", condition: 0.9, origin: grant });
    if ("rejected" in item) throw new Error(item.rejected);
    first.inventory.install(car.id, item.id);
    const { inventory, equipped } = setup(first.inventory.snapshot());
    await flush();
    expect(equipped).toEqual([["mags_15_4x100", 0.9]]);
    inventory.add({ partId: "clutch_kit", condition: 0.5, origin: grant });
    await flush();
    expect(equipped).toHaveLength(1);
  });

  it("refuses non-wheel parts and parts you don't own", () => {
    const { bridge, inventory } = setup();
    const clutch = inventory.add({ partId: "clutch_kit", condition: 0.5, origin: grant });
    if ("rejected" in clutch) throw new Error(clutch.rejected);
    const rejected: string[] = [];
    bridge.ui.events.on("commandRejected", ({ reason }) => rejected.push(reason));
    bridge.ui.commands.equipWheels(clutch.id);
    bridge.ui.commands.equipWheels("item-999");
    expect(rejected).toEqual(["That is not a wheel set.", "You do not have that part."]);
  });
});
