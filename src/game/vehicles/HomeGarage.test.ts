import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { InventorySession } from "@/game-core/inventory/InventorySession";
import { loadHavok } from "../physics/havok";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import type { PlayerMode } from "../player/PlayerMode";
import { HomeGarage } from "./HomeGarage";
import { RWD_BOX_SEDAN, STARTER_SEDAN } from "./VehicleDefinition";

const require = createRequire(import.meta.url);
const GLB = new Uint8Array(readFileSync("public/model/banwa_dalagan_1996_modular.glb"));
let havok: Awaited<ReturnType<typeof loadHavok>>;

beforeAll(async () => {
  const wasm = await readFile(require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"));
  havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
});

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

async function park(player: { mode: PlayerMode; position: Vector3 }, inventory = new InventorySession()) {
  engine = new NullEngine();
  const scene = new Scene(engine);
  new PhysicsWorld(scene, havok);
  const onSwitch = vi.fn();
  const pose = { position: new Vector3(10, 0, 20), headingRad: Math.PI };
  const garage = await HomeGarage.create(scene, STARTER_SEDAN, pose, player, inventory, onSwitch, GLB);
  return { garage, onSwitch };
}

describe("HomeGarage", () => {
  it("parks the other car at its bay with its saved paint", async () => {
    const inventory = new InventorySession();
    inventory.setAppearance(STARTER_SEDAN.spec.id, { paint: "#aa2222", rideHeightM: -0.03 });
    const { garage } = await park({ mode: "walking", position: Vector3.Zero() }, inventory);
    garage.model.root.computeWorldMatrix(true);
    expect(garage.model.root.getAbsolutePosition().asArray()).toEqual([10, 0, 20]);
    expect(garage.model.paint).toBe("#aa2222");
    expect(garage.model.rideHeight).toBe(-0.03);
  });

  it("routes both parked cars through one switch handler", async () => {
    const player = { mode: "walking" as PlayerMode, position: Vector3.Zero() };
    const { garage, onSwitch } = await park(player);
    const onLancer = vi.fn();
    const lancer = await HomeGarage.create(garage.model.root.getScene(), RWD_BOX_SEDAN,
      { position: new Vector3(14, 0, 20), headingRad: Math.PI }, player,
      new InventorySession(), onLancer,
      new Uint8Array(readFileSync("public/model/lancer/lancer_box_1983_modular.glb")));
    const handlers = new Map<string, (target: ReturnType<typeof garage.interactions>[number]) => unknown>();
    const handle = vi.fn((action: string, fn: (target: ReturnType<typeof garage.interactions>[number]) => unknown) => {
      if (handlers.has(action)) throw new Error("Duplicate handler");
      handlers.set(action, fn);
      return () => handlers.delete(action);
    });
    HomeGarage.connectAll({ handle } as never, [garage, lancer]);
    expect(handle).toHaveBeenCalledTimes(1);
    const switchCar = handlers.get("switch_vehicle")!;
    switchCar(garage.interactions()[0]);
    expect(onSwitch).toHaveBeenCalledWith(STARTER_SEDAN);
    expect(onLancer).not.toHaveBeenCalled();
    const lancerDoor = lancer.interactions()[0];
    switchCar(lancerDoor);
    expect(onLancer).toHaveBeenCalledWith(RWD_BOX_SEDAN);
    lancer.dispose();
    expect(switchCar(lancerDoor)).toEqual({ rejected: "That's not your car" });
    expect(onLancer).toHaveBeenCalledTimes(1);
  });

  it("offers a door prompt on foot only, and hands the car to onSwitch", async () => {
    const player = { mode: "walking" as PlayerMode, position: Vector3.Zero() };
    const { garage, onSwitch } = await park(player);
    const [door] = garage.interactions();
    expect(door).toMatchObject({ action: "switch_vehicle", label: "Drive the Dalagan", target: STARTER_SEDAN.spec.id });
    // Heading π: the car's right-side door (+x in car space) faces world −x.
    expect(door.area.kind === "circle" && Math.abs(door.area.z - 19.8) < 1e-6).toBe(true);

    player.mode = "driving";
    expect(garage.interactions()).toEqual([]);

    const handlers = new Map<string, (target: typeof door) => unknown>();
    garage.connect({ handle: (action: string, fn: (target: typeof door) => unknown) => { handlers.set(action, fn); return () => {}; } } as never);
    expect(handlers.get("switch_vehicle")!({ ...door, target: "someone_elses" })).toEqual({ rejected: "That's not your car" });
    expect(onSwitch).not.toHaveBeenCalled();
    handlers.get("switch_vehicle")!(door);
    expect(onSwitch).toHaveBeenCalledWith(STARTER_SEDAN);
  });
});
