import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimePort } from "../bridge";
import { CharacterVisual } from "../characters/CharacterVisual";
import type { Interactable } from "../interaction/Interaction";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import type { PlayerModes } from "../player/PlayerModes";
import { ArcadeHandlingModel } from "./handling/ArcadeHandlingModel";
import { resolveHandlingPreset } from "./handling/HandlingConfig";
import { HANDLING_PRESETS } from "./handling/presets";
import type { PlayerVehicle } from "./PlayerVehicle";
import { TireSystem, jackPose, type TireShopWallet } from "./TireSystem";
import { STOCK_SETUP, type TireSurface } from "@/game-core/tires";

/**
 * TireSystem wiring against a headless scene and a stand-in car: a real handling model, real
 * transform nodes for the wheels and chassis, and recording fakes for the bridge and prompts.
 */
let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

const WHEELS: [string, number, number][] = [["fl", -0.75, 1.3], ["fr", 0.75, 1.3], ["rl", -0.75, -1.2], ["rr", 0.75, -1.2]];

function rig(options: { surfaceAt?: (x: number, z: number) => TireSurface; storage?: Map<string, string> } = {}) {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const model = new ArcadeHandlingModel(resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan"));
  const node = new TransformNode("car", scene);
  node.rotationQuaternion = Quaternion.Identity();
  const wheels = WHEELS.map(([id, x, z]) => ({ id, local: new Vector3(x, 0.3, z), front: z > 0, grounded: true, gap: 0 }));
  const body = {
    wheels, node, position: node.position, forward: new Vector3(0, 0, 1), right: new Vector3(1, 0, 0),
    toWorld: (local: Vector3, out: Vector3) => out.copyFrom(local).addInPlace(node.position),
  };
  const root = new TransformNode("model", scene);
  const jackPoses: (Quaternion | null)[] = [];
  const visualWheels = WHEELS.map(([id, x, z]) => {
    const hub = new TransformNode(`hub-${id}`, scene);
    hub.parent = root;
    hub.position.set(x, 0.3, z);
    const socket = new TransformNode(`socket-${id}`, scene);
    socket.parent = hub;
    const wheel = MeshBuilder.CreateCylinder(`wheel-${id}`, { diameter: 0.6, height: 0.18 }, scene);
    wheel.parent = socket;
    return { id, hub, socket };
  });
  const character = new CharacterVisual(scene, new StandardMaterial("walker", scene), 1.7);
  let impact: (strength: number, point: Vector3 | null) => void = () => {};
  const player = {
    id: "car", body, controller: { model }, speedKmh: 0, tireSetup: STOCK_SETUP,
    visual: { model: { wheels: visualWheels, root, setJackPose: (q: Quaternion | null) => { jackPoses.push(q); }, setTrunkOpen: (amount: number) => { trunk.rotation.x = amount; } } },
    onImpact: (listener: typeof impact) => { impact = listener; return () => {}; },
    definition: { spec: { id: "car" }, collision: { body: { length: 4.2 }, wheels: { radius: 0.3 } } },
  };
  const events: { name: string; payload: unknown }[] = [];
  const commands = new Map<string, (payload: never) => unknown>();
  const bridge = {
    emit: (name: string, payload: unknown) => { events.push({ name, payload }); },
    handle: (name: string, handler: (payload: never) => unknown) => { commands.set(name, handler); return () => commands.delete(name); },
  };
  const trunk = new TransformNode("test-trunk", scene);
  const modes = { mode: "walking" as string, characterVisual: character, canEnter: undefined as undefined | (() => string | null) };
  const handlers = new Map<string, (target: Interactable) => unknown>();
  const interactions = { handle: (action: string, handler: (target: Interactable) => unknown) => { handlers.set(action, handler); return () => {}; } };
  const storage = options.storage ?? new Map<string, string>();
  const tires = new TireSystem(bridge as unknown as RuntimePort, player as unknown as PlayerVehicle, modes as unknown as PlayerModes,
    options.surfaceAt ?? (() => "asphalt"), { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); } });
  tires.connect(interactions as unknown as InteractionSystem);
  const last = (name: string) => [...events].reverse().find((e) => e.name === name)?.payload as Record<string, unknown> | undefined;
  /** Does whatever the prompt at `where` offers; returns the action's outcome. */
  const use = (id: string) => {
    const target = tires.interactions().find((i) => i.id === id);
    if (!target) throw new Error(`No prompt ${id}; offered: ${tires.interactions().map((i) => i.id).join(", ")}`);
    return handlers.get(target.action)!(target);
  };
  return { tires, model, player, events, commands, modes, storage, jackPoses, visualWheels, character, trunk, scene, last, use, impact: (s: number, p: Vector3 | null) => impact(s, p) };
}

describe("TireSystem", () => {
  it("shows the wheel in the walker's hands, opens the trunk, and pumps the jack", () => {
    const { tires, commands, use, character, trunk, scene } = rig();
    commands.get("debugPuncture")!({ corner: "FL", failure: "BLOWOUT" } as never);
    use("tire:FL:loosen");
    use("tire:FL:raise");
    tires.update(0.1);
    const handle = scene.getMeshByName("tire-jack-handle")!;
    const firstPump = handle.rotationQuaternion!.x;
    tires.update(0.1);
    expect(handle.rotationQuaternion!.x).not.toBe(firstPump);

    use("tire:FL:remove");
    tires.update(0.1);
    const carried = scene.getNodeByName("tire-carried-wheel") as TransformNode;
    expect(carried.parent).toBe(character.root);
    expect(carried.isEnabled()).toBe(true);
    expect(scene.getMeshByName("player:upperArm:-1")!.rotation.x).toBeLessThan(-0.6);
    use("tire:trunk:stow");
    tires.update(0.2);
    expect(trunk.rotation.x).toBeGreaterThan(0);
    expect(scene.getNodeByName("tire-carried-wheel")).toBeNull();
    use("tire:trunk:take_spare");
    tires.update(0.1);
    const spare = scene.getNodeByName("tire-carried-wheel") as TransformNode;
    expect(spare.isEnabled()).toBe(true);
    expect(spare.scaling.x).toBeLessThan(carried.scaling.x);
    use("tire:FL:install");
    use("tire:FL:lower");
    tires.update(1.5);
    expect(handle.isEnabled()).toBe(false);
    tires.update(1);
    expect(trunk.rotation.x).toBeLessThan(0.01);
  });
  it("resolves the ground under each wheel and feeds each corner, never the global grip", () => {
    const { tires, model } = rig({ surfaceAt: (x) => (x > 0 ? "grass" : "asphalt") });
    tires.update(0.2);
    expect(model.tires[0].grip).toBe(1);
    expect(model.tires[1].grip).toBeLessThan(0.75);
    expect(model.tires[3].grip).toBeCloseTo(model.tires[1].grip, 9);
    expect(model.surfaceGrip).toBe(1);
  });

  it("a dev blowout reaches the model, the HUD and audio", () => {
    const { tires, model, commands, last } = rig();
    commands.get("debugPuncture")!({ corner: "FL", failure: "BLOWOUT" } as never);
    tires.update(1 / 60);
    expect(last("tireEvent")).toMatchObject({ corner: "FL", kind: "blowout" });
    expect(model.tires[0].grip).toBeLessThan(0.8);
    expect(model.tires[0].rollingResistance).toBeGreaterThan(0.05);
    expect(model.tires[1]).toMatchObject({ grip: 1, slipScale: 1, rollingResistance: 0 });
    const status = last("tireStatus") as { corners: { corner: string; flat: boolean }[] };
    expect(status.corners.find((c) => c.corner === "FL")!.flat).toBe(true);
    expect(last("tireTelemetry")).toBeUndefined();
    tires.update(0.25);
    expect((last("tireTelemetry") as { corners: unknown[] }).corners).toHaveLength(4);
  });

  it("hard hits near a wheel can puncture it; hits elsewhere can't", () => {
    const { tires, impact } = rig();
    for (let i = 0; i < 20; i++) impact(1, new Vector3(0, 0.3, 0));
    expect(tires.session.flatCorners("car")).toEqual([]);
    expect(["HEALTHY"]).toContain(tires.session.mounted("car", "FL")!.failure);
    let hits = 0;
    while (tires.session.mounted("car", "FL")!.failure === "HEALTHY" && hits < 10) { impact(1, new Vector3(-0.8, 0.3, 1.3)); hits++; }
    expect(tires.session.mounted("car", "FL")!.failure).not.toBe("HEALTHY");
    expect(tires.session.mounted("car", "RR")!.failure).toBe("HEALTHY");
  });

  it("walks through a roadside change from the prompts, blocking the seat and lifting the body", () => {
    const { tires, model, commands, modes, jackPoses, visualWheels, use } = rig();
    commands.get("debugPuncture")!({ corner: "FL", failure: "BLOWOUT" } as never);
    expect(modes.canEnter!()).toBeNull();
    expect(use("tire:FL:loosen")).toBeUndefined();
    expect(modes.canEnter!()).toMatch(/Tighten/);
    use("tire:FL:raise");
    expect(model.tires[0].raised).toBe(true);
    tires.update(0.6);
    const halfway = visualWheels[0].socket.position.y;
    tires.update(1);
    expect(halfway).toBeGreaterThan(0);
    expect(visualWheels[0].socket.position.y).toBeCloseTo(0.045, 6);
    expect(jackPoses.at(-1)).not.toBeNull();
    use("tire:FL:remove");
    expect(model.tires[0].installed).toBe(false);
    use("tire:trunk:stow");
    use("tire:trunk:take_spare");
    use("tire:FL:install");
    expect(tires.session.mounted("car", "FL")!.spec).toBe("donut");
    use("tire:FL:lower");
    tires.update(1.5);
    expect(jackPoses.at(-1)).toBeNull();
    expect(visualWheels[0].socket.position.y).toBe(0);
    expect(model.tires[0].raised).toBe(false);
    use("tire:FL:tighten");
    expect(modes.canEnter!()).toBeNull();
    expect(model.tires[0].grip).toBeLessThan(1);
  });

  it("offers no prompts while driving or rolling", () => {
    const { tires, modes, player, commands } = rig();
    commands.get("debugPuncture")!({ corner: "FL", failure: "BLOWOUT" } as never);
    expect(tires.interactions().some((i) => i.id === "tire:FL:loosen")).toBe(true);
    modes.mode = "driving";
    expect(tires.interactions()).toEqual([]);
    modes.mode = "walking";
    player.speedKmh = 12;
    expect(tires.interactions()).toEqual([]);
  });

  it("persists through storage: a reload keeps the flat and the half-done job", () => {
    const storage = new Map<string, string>();
    const first = rig({ storage });
    first.commands.get("debugPuncture")!({ corner: "RR", failure: "RAPID_LEAK" } as never);
    first.use("tire:RR:loosen");
    first.tires.update(30);
    first.tires.dispose();
    const second = rig({ storage });
    expect(second.tires.session.mounted("car", "RR")!.failure).not.toBe("HEALTHY");
    expect(second.tires.session.mounted("car", "RR")!.pressureKpa).toBeLessThan(220);
    expect(second.modes.canEnter!()).toMatch(/Tighten the rear-right/);
  });

  it("sells tire work at the talyer through the wallet", () => {
    const { tires, commands, last } = rig();
    let wallet = 2000, open = true;
    const spent: string[] = [];
    const shop: TireShopWallet = {
      spend: (amount, source) => { if (amount > wallet) return { rejected: "Not enough money." }; wallet -= amount; spent.push(source.description); return {}; },
      summary: () => ({ walletPhp: wallet }),
    };
    tires.useShop(shop, () => (open ? null : "Bring the car to Tito Jun"));
    commands.get("debugPuncture")!({ corner: "FR", failure: "BLOWOUT" } as never);
    commands.get("quoteTireService")!(undefined as never);
    const quote = last("tireShopState") as { lines: { id: string; kind: string; costPhp: number }[] };
    const tire = quote.lines.find((l) => l.kind === "tire")!;
    expect(commands.get("buyTireService")!({ lineId: tire.id } as never)).toBeUndefined();
    expect(wallet).toBe(2000 - tire.costPhp);
    expect(tires.session.mounted("car", "FR")!.failure).toBe("HEALTHY");
    expect(spent).toHaveLength(1);
    open = false;
    expect(commands.get("buyTireService")!({ lineId: "jack" } as never)).toEqual({ rejected: "Bring the car to Tito Jun" });
    expect((last("tireShopState") as { receipt: string }).receipt).toMatch(/Paid/);
  });
});

describe("jackPose", () => {
  it("lifts the jacked corner, keeps the opposite wheel planted and raises the neighbours half as much", () => {
    const hubs = WHEELS.map(([, x, z]) => new Vector3(x, 0, z));
    for (let corner = 0; corner < 4; corner++) {
      const pose = jackPose(hubs, corner, 0.09)!;
      const lifted = hubs.map((h) => h.applyRotationQuaternion(pose.rotation).add(pose.offset).y);
      expect(lifted[corner]).toBeCloseTo(0.09, 3);
      expect(lifted[3 - corner]).toBeCloseTo(0, 6);
      const neighbours = [0, 1, 2, 3].filter((k) => k !== corner && k !== 3 - corner);
      for (const k of neighbours) expect(lifted[k]).toBeCloseTo(0.045, 3);
    }
  });
});
