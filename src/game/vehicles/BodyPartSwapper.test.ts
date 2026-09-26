import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BODY_PARTS,
  bodyPart, exteriorEffects, resolveBodyPartLook, type BodyPartLook, type ExteriorEffects, type FittedBodyPart, type PaintFinish,
} from "@/game-core/exterior";
import { InventorySession } from "@/game-core/inventory/InventorySession";
import { BANWA_DALAGAN_1996, type ExteriorSlot } from "@/game-core/vehicles";
import { GameBridge } from "../bridge";
import { BodyPartSwapper, PANEL_MATERIAL } from "./BodyPartSwapper";
import { ExteriorSystem, type ExteriorVehicle } from "./ExteriorSystem";
import type { BodyPartFitting } from "./PlayerVehicle";
import { VehicleModel } from "./VehicleModel";
import { NPC_CAR_BUILDS } from '@/game-core/exterior/npcBuilds';
import { WheelSwapper } from './WheelSwapper';
import { wheelPart } from '@/game-core/wheels';

const GLB = new Uint8Array(readFileSync("public/model/banwa_dalagan_1996_modular.glb"));
const fromPublic = (path: string) => new Uint8Array(readFileSync(`public${path}`));
const car = BANWA_DALAGAN_1996;
const look = (id: string, condition: number, finish: PaintFinish | null = null): BodyPartLook =>
  resolveBodyPartLook(bodyPart(id)!, { condition, finish, bodyColor: "#2f5d8a", vehicleTags: car.tags });
const fitted = (id: string, condition = 1, finish: PaintFinish | null = null): FittedBodyPart =>
  ({ part: bodyPart(id)!, look: look(id, condition, finish) });

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

function panelOf(node: TransformNode) {
  return node.getChildMeshes().find((m) => m.material?.name.endsWith(PANEL_MATERIAL))!.material as PBRMaterial;
}

describe("BodyPartSwapper", () => {
  it("builds independent NPC kits from a modified player rig without inheriting its parts", async () => {
    const player = await VehicleModel.load(scene, car, GLB);
    const playerParts = new BodyPartSwapper(scene, player, fromPublic);
    const playerWheels = new WheelSwapper(scene, player, fromPublic);
    player.setPaint('#ff0000'); player.setRideHeight(-0.06);
    await playerParts.equip('spoiler', fitted('marketplace_gt_wing'));
    await playerWheels.equip(wheelPart('oversized_17_deep_dish')!);
    for (const [name, build] of Object.entries(NPC_CAR_BUILDS)) {
      const npc = player.clone(name);
      expect(npc.paint).toBe(car.visual.defaultPaint);
      expect(npc.attachments.get('spoiler')!.mounted).toBeNull();
      expect(npc.wheels.every(w => w.mounted === null && w.mesh.isEnabled())).toBe(true);
      expect(npc.wheels[0].hub.position.y).toBeCloseTo(0.3);
      npc.setPaint('#345678'); npc.setRideHeight(build.rideHeightM);
      const parts = new BodyPartSwapper(scene, npc, fromPublic);
      const wheels = new WheelSwapper(scene, npc, fromPublic);
      for (const entry of build.parts) {
        const part = bodyPart(entry.id)!;
        await parts.equip(part.socket, { part, look: resolveBodyPartLook(part, {
          condition: entry.condition, finish: 'finish' in entry ? entry.finish : null, bodyColor: npc.paint, vehicleTags: car.tags,
        }) });
      }
      if ('wheels' in build) await wheels.equip(wheelPart(build.wheels)!);
      expect(parts.equipped).toHaveLength(build.parts.length);
      expect(player.paint).toBe('#ff0000');
      expect(playerParts.equipped[0].part.id).toBe('marketplace_gt_wing');
      parts.dispose(); wheels.dispose(); npc.dispose();
      expect(player.root.isDisposed()).toBe(false);
      expect(player.attachments.get('spoiler')!.mounted!.getChildMeshes()[1].getTotalVertices()).toBeGreaterThan(0);
    }
  });
  it("fits replacement panels to the modular stock seams and removes the complete stock panel", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new BodyPartSwapper(scene, model, fromPublic);
    for (const id of ["dalagan_red_fender_fl", "dalagan_primer_bumper", "vented_carbon_look_hood", "dalagan_fiberglass_skirts"]) {
      const fitting = fitted(id);
      fitting.look = { ...fitting.look, gapM: 0, tiltDeg: 0 };
      const socket = model.attachments.get(fitting.part.socket)!;
      const before = socket.stock!.getHierarchyBoundingVectors(true);
      await swapper.equip(fitting.part.socket, fitting);
      const after = socket.mounted!.getHierarchyBoundingVectors(true);
      expect(socket.stock!.isEnabled()).toBe(false);
      for (const axis of ["x", "z"] as const) {
        expect(after.min[axis], `${id} min ${axis}`).toBeCloseTo(before.min[axis], 4);
        expect(after.max[axis], `${id} max ${axis}`).toBeCloseTo(before.max[axis], 4);
      }
      await swapper.equip(fitting.part.socket, null);
      expect(socket.stock!.isEnabled()).toBe(true);
    }
    swapper.dispose();
  });

  it("loads every catalog GLB and respects each part's local transform", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new BodyPartSwapper(scene, model, fromPublic);
    for (const part of BODY_PARTS) {
      const fitting = fitted(part.id);
      fitting.part = { ...part, transform: { positionM: { x: 0.1, y: 0.2, z: 0.3 }, rotationDeg: { x: 0, y: 90, z: 0 }, scale: 0.9 } };
      await swapper.equip(part.socket, fitting);
      const node = model.attachments.get(part.socket)!.mounted!;
      expect(node.parent).toBe(model.attachments.get(part.socket)!.anchor);
      expect(node.position.asArray()).toEqual([0.1, 0.2 - fitting.look.gapM, 0.3]);
      expect(node.scaling.asArray()).toEqual([0.9, 0.9, 0.9]);
      expect(node.rotationQuaternion!.toEulerAngles().y).toBeCloseTo(Math.PI / 2);
      expect(panelOf(node)).toBeInstanceOf(PBRMaterial);
    }
    swapper.dispose();
  });

  it("keeps the mounted part on a failed load, retries, and does not load after disposal", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const load = vi.fn(fromPublic);
    const swapper = new BodyPartSwapper(scene, model, load);
    await swapper.equip("spoiler", fitted("dalagan_ducktail"));
    const previous = model.attachments.get("spoiler")!.mounted;
    load.mockImplementationOnce(() => { throw new Error("offline"); });
    await expect(swapper.equip("spoiler", fitted("marketplace_gt_wing"))).rejects.toThrow("offline");
    expect(model.attachments.get("spoiler")!.mounted).toBe(previous);
    expect(previous!.isDisposed()).toBe(false);
    expect(await swapper.equip("spoiler", fitted("marketplace_gt_wing"))).toBe(true);
    swapper.dispose();
    const loads = load.mock.calls.length;
    expect(await swapper.equip("spoiler", fitted("dalagan_ducktail"))).toBe(false);
    expect(load).toHaveBeenCalledTimes(loads);
  });

  it("rejects incompatible parts and illegal paint even outside the UI", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new BodyPartSwapper(scene, model, fromPublic);
    const wrong = fitted("dalagan_ducktail");
    wrong.part = { ...wrong.part, compatibleTags: ["other_car"] };
    await expect(swapper.equip("spoiler", wrong)).rejects.toThrow(/incompatible/);
    await expect(swapper.equip("chin", fitted("acp_chin_splitter", 1, "body_color"))).rejects.toThrow(/cannot use/);
  });
  it("mounts a clone on the socket, replaces the part in the same socket and restores stock", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const load = vi.fn(fromPublic);
    const swapper = new BodyPartSwapper(scene, model, load);
    const socket = model.attachments.get("spoiler")!;

    expect(await swapper.equip("spoiler", fitted("dalagan_ducktail"))).toBe(true);
    const ducktail = socket.mounted!;
    expect(ducktail.name).toBe("spoiler_dalagan_ducktail");
    expect(ducktail.parent).toBe(socket.anchor);
    expect(socket.anchor.name).toBe("spoiler_socket");
    expect(ducktail.getChildMeshes().length).toBeGreaterThan(0);

    expect(await swapper.equip("spoiler", fitted("marketplace_gt_wing"))).toBe(true);
    expect(ducktail.isDisposed()).toBe(true);
    expect(socket.mounted!.name).toBe("spoiler_marketplace_gt_wing");
    expect(swapper.equipped.map((f) => f.part.id)).toEqual(["marketplace_gt_wing"]);
    // Zip-tied: it hangs off its socket and pitches.
    expect(socket.mounted!.position.y).toBeLessThan(0);

    expect(await swapper.equip("spoiler", null)).toBe(true);
    expect(socket.mounted).toBeNull();
    expect(swapper.equipped).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives each copy its own panel material for its finish and leaves hardware alone", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new BodyPartSwapper(scene, model, fromPublic);
    await swapper.equip("fender_fl", fitted("dalagan_red_fender_fl"));
    await swapper.equip("hood", fitted("vented_carbon_look_hood"));
    await swapper.equip("bumper_front", fitted("dalagan_primer_bumper", 0.5));
    const panel = (slot: ExteriorSlot) => panelOf(model.attachments.get(slot)!.mounted!);

    expect(panel("fender_fl").albedoColor.toGammaSpace().toHexString().toLowerCase()).toBe("#8e2a2a");
    expect(panel("hood").clearCoat.isEnabled).toBe(true);
    expect(panel("bumper_front").roughness).toBe(1);
    expect(panel("hood")).not.toBe(panel("bumper_front"));
    const grille = model.attachments.get("bumper_front")!.mounted!.getChildMeshes().find((m) => m.material?.name === "hardware");
    expect(grille).toBeDefined();

    // A respray restyles the mounted copy instead of reloading it.
    const bumper = model.attachments.get("bumper_front")!.mounted!;
    expect(await swapper.equip("bumper_front", fitted("dalagan_primer_bumper", 0.5, "body_color"))).toBe(true);
    expect(model.attachments.get("bumper_front")!.mounted).toBe(bumper);
    expect(panel("bumper_front").albedoColor.toGammaSpace().toHexString().toLowerCase()).not.toBe("#8b8e89");
    expect(swapper.equipped.find((f) => f.part.id === "dalagan_primer_bumper")!.look.finish).toBe("body_color");
  });

  it("lets a later equip on the same socket win and rejects a part for another socket", async () => {
    const model = await VehicleModel.load(scene, car, GLB);
    const swapper = new BodyPartSwapper(scene, model, fromPublic);
    const first = swapper.equip("spoiler", fitted("dalagan_ducktail"));
    const second = swapper.equip("spoiler", fitted("marketplace_gt_wing"));
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(model.attachments.get("spoiler")!.mounted!.name).toBe("spoiler_marketplace_gt_wing");
    await expect(swapper.equip("hood", fitted("dalagan_ducktail"))).rejects.toThrow(/mounts on spoiler/);

    swapper.dispose();
    expect(model.attachments.get("spoiler")!.mounted).toBeNull();
  });
});

describe("ExteriorSystem", () => {
  function setup(saved?: unknown, workshopRejection: () => string | null = () => null) {
    const bridge = new GameBridge();
    const inventory = new InventorySession(saved);
    const calls: [ExteriorSlot, string | null, PaintFinish | null][] = [];
    const on = new Map<ExteriorSlot, FittedBodyPart>();
    const vehicle: ExteriorVehicle = {
      id: car.id,
      definition: { spec: car },
      get exterior() { return [...on.values()]; },
      get exteriorEffects(): ExteriorEffects { return exteriorEffects([...on.values()]); },
      equipBodyPart: async (socket, fitting: BodyPartFitting | null) => {
        calls.push([socket, fitting?.part.id ?? null, fitting?.finish ?? null]);
        if (fitting) on.set(socket, { part: fitting.part, look: look(fitting.part.id, fitting.condition ?? 1, fitting.finish) });
        else on.delete(socket);
        return true;
      },
    };
    const views: unknown[] = [];
    bridge.ui.events.on("exteriorState", (view) => views.push(view));
    const rejected: string[] = [];
    bridge.ui.events.on("commandRejected", ({ reason }) => rejected.push(reason));
    const system = new ExteriorSystem(bridge.runtime, inventory, vehicle, workshopRejection);
    return { bridge, inventory, system, calls, views, rejected, vehicle };
  }
  const grant = { kind: "grant", reason: "test" } as const;
  const flush = () => new Promise((resolve) => setTimeout(resolve));
  const add = (inventory: InventorySession, partId: string, condition = 0.8) => {
    const item = inventory.add({ partId, condition, origin: grant });
    if ("rejected" in item) throw new Error(item.rejected);
    return item;
  };

  it("enforces workshop access for all mutations but restores saved parts anywhere", async () => {
    let rejection: string | null = null;
    const first = setup(undefined, () => rejection);
    const lip = add(first.inventory, "universal_rubber_lip");
    first.bridge.ui.commands.equipBodyPart(lip.id);
    await flush();
    rejection = "Park at the talyer first.";
    first.bridge.ui.commands.removeBodyPart(lip.id);
    first.bridge.ui.commands.refinishBodyPart(lip.id, "primer");
    first.bridge.ui.commands.equipBodyPart(lip.id);
    expect(first.rejected).toEqual([rejection, rejection, rejection]);
    expect(first.inventory.item(lip.id)!.finish).toBeNull();
    const restored = setup(JSON.parse(JSON.stringify(first.inventory.snapshot())), () => rejection);
    await flush();
    expect(restored.vehicle.exterior[0].part.id).toBe(lip.partId);
  });

  it("publishes a retryable failure without assigning the old mesh to the new inventory item", async () => {
    const { bridge, inventory, vehicle, views } = setup();
    const ducktail = add(inventory, "dalagan_ducktail");
    const wing = add(inventory, "marketplace_gt_wing");
    bridge.ui.commands.equipBodyPart(ducktail.id);
    await flush();
    const states: import('./ExteriorSystem').ExteriorInventoryView[] = [];
    bridge.ui.events.on('exteriorInventory', view => states.push(view));
    const equip = vi.spyOn(vehicle, 'equipBodyPart');
    equip.mockRejectedValueOnce(new Error('offline'));
    bridge.ui.commands.equipBodyPart(wing.id);
    await flush();
    expect(states.at(-1)).toMatchObject({ pending: false, error: expect.stringContaining('offline') });
    expect(views.at(-1)).toMatchObject({ parts: [] });
    expect(inventory.installedOn(car.id).spoiler).toBe(wing.id);
    bridge.ui.commands.equipBodyPart(wing.id);
    await flush();
    expect(states.at(-1)).toMatchObject({ pending: false, error: null });
    expect(views.at(-1)).toMatchObject({ parts: [{ itemId: wing.id, partId: wing.partId }] });
    expect(JSON.stringify(states)).not.toContain('condition');
  });

  it("restores stock when a failed replacement is removed", async () => {
    const { bridge, inventory, vehicle } = setup();
    const ducktail = add(inventory, "dalagan_ducktail");
    const wing = add(inventory, "marketplace_gt_wing");
    bridge.ui.commands.equipBodyPart(ducktail.id);
    await flush();
    vi.spyOn(vehicle, 'equipBodyPart').mockRejectedValueOnce(new Error('offline'));
    bridge.ui.commands.equipBodyPart(wing.id);
    await flush();
    bridge.ui.commands.removeBodyPart(wing.id);
    await flush();
    expect(vehicle.exterior).toEqual([]);
    expect(inventory.installedOn(car.id)).toEqual({});
  });

  it("fits, refinishes, replaces and removes parts through the inventory", async () => {
    const { bridge, inventory, calls, views } = setup();
    expect(views).toEqual([{ vehicleId: car.id, parts: [], effects: expect.objectContaining({ reputation: 0, addedWeightKg: 0 }) }]);
    const ducktail = add(inventory, "dalagan_ducktail");
    const wing = add(inventory, "marketplace_gt_wing", 0.5);

    bridge.ui.commands.equipBodyPart(ducktail.id, "primer");
    await flush();
    expect(inventory.installedOn(car.id)).toEqual({ spoiler: ducktail.id });
    expect(inventory.item(ducktail.id)!.finish).toBe("primer");
    expect(calls.at(-1)).toEqual(["spoiler", "dalagan_ducktail", "primer"]);
    expect(views.at(-1)).toMatchObject({ parts: [{ socket: "spoiler", itemId: ducktail.id, finish: "primer", wear: "clean", fit: "flush" }] });

    bridge.ui.commands.equipBodyPart(wing.id);
    await flush();
    expect(inventory.installedOn(car.id)).toEqual({ spoiler: wing.id });
    expect(views.at(-1)).toMatchObject({ parts: [{ partId: "marketplace_gt_wing", wear: "scratched", fit: "zip_tied" }] });
    expect((views.at(-1) as { effects: { drag: number } }).effects.drag).toBeGreaterThan(0.08);
    // The view never carries the hidden condition.
    expect(JSON.stringify(views.at(-1))).not.toContain("condition");

    bridge.ui.commands.removeBodyPart(wing.id);
    await flush();
    expect(inventory.installedOn(car.id)).toEqual({});
    expect(calls.at(-1)).toEqual(["spoiler", null, null]);
    expect(views.at(-1)).toMatchObject({ parts: [] });
  });

  it("re-fits a saved car on load and ignores unrelated inventory changes", async () => {
    const first = setup();
    const hood = add(first.inventory, "vented_carbon_look_hood");
    first.bridge.ui.commands.equipBodyPart(hood.id, "body_color");
    await flush();
    const { inventory, calls, views } = setup(first.inventory.snapshot());
    await flush();
    expect(calls).toEqual([["hood", "vented_carbon_look_hood", "body_color"]]);
    expect(views.at(-1)).toMatchObject({ parts: [{ socket: "hood", finish: "body_color" }] });
    add(inventory, "clutch_kit");
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("resprays loose and fitted parts, and restyles the fitted one", async () => {
    const { bridge, inventory, calls, views, rejected } = setup();
    const lip = add(inventory, "universal_rubber_lip");
    bridge.ui.commands.refinishBodyPart(lip.id, "primer");
    await flush();
    expect(inventory.item(lip.id)!.finish).toBe("primer");
    expect(calls).toEqual([]);
    bridge.ui.commands.equipBodyPart(lip.id);
    await flush();
    bridge.ui.commands.refinishBodyPart(lip.id, "bare_plastic");
    await flush();
    expect(calls.at(-1)).toEqual(["front_lip", "universal_rubber_lip", "bare_plastic"]);
    expect(views.at(-1)).toMatchObject({ parts: [{ finish: "bare_plastic" }] });
    bridge.ui.commands.refinishBodyPart(add(inventory, "vented_carbon_look_hood").id, "bare_plastic");
    expect(rejected).toEqual(["Can't do bare plastic on that part."]);
  });

  it("refuses parts that aren't body parts, finishes the part can't take and parts it doesn't own", () => {
    const { bridge, inventory, rejected } = setup();
    const clutch = add(inventory, "clutch_kit");
    const chin = add(inventory, "acp_chin_splitter");
    bridge.ui.commands.equipBodyPart(clutch.id);
    bridge.ui.commands.equipBodyPart(chin.id, "body_color");
    bridge.ui.commands.equipBodyPart("item-999");
    bridge.ui.commands.removeBodyPart(chin.id);
    expect(rejected).toEqual([
      "That is not a body part.", "Can't do body color on that part.", "You do not have that part.", "That part is not on your car.",
    ]);
    expect(inventory.installedOn(car.id)).toEqual({});
  });
});
