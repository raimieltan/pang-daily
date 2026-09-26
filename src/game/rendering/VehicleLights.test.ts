import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { BANWA_DALAGAN_1996 } from "@/game-core/vehicles";
import type { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { VehicleVisual } from "../vehicles/VehicleVisual";
import { VEHICLE_LIGHTS } from "./LightingConfig";
import { VehicleLights } from "./VehicleLights";

const GLB = new Uint8Array(readFileSync("public/model/banwa_dalagan_1996_modular.glb"));

let engine: NullEngine | null = null;
afterEach(() => {
  engine?.dispose();
  engine = null;
});

async function setup() {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const node = new TransformNode("car", scene);
  const visual = await VehicleVisual.load(scene, BANWA_DALAGAN_1996, node, GLB);
  const state = { brake: 0, reversing: false };
  // VehicleLights only reads the visual, the body node and the handling state.
  const player = { visual, body: { node }, controller: { model: { state } } } as unknown as PlayerVehicle;
  const lights = new VehicleLights(scene, player);
  const emissive = (name: string) => (visual.model.material(name) as PBRMaterial).emissiveColor;
  const linear = (hex: string) => Color3.FromHexString(hex).toLinearSpace();
  return { lights, state, emissive, linear, node };
}

describe("VehicleLights", () => {
  it("mounts one headlight spot on the car, aimed forward and slightly down", async () => {
    const { lights, node } = await setup();
    expect(lights.headlight.parent).toBe(node);
    expect(lights.headlight.direction.z).toBeGreaterThan(0.9);
    expect(lights.headlight.direction.y).toBeLessThan(0);
  });

  it("brightens the tail lamps under braking and lights the reverse lamp in reverse", async () => {
    const { lights, state, emissive, linear } = await setup();
    lights.update();
    expect(emissive("taillight").equalsWithEpsilon(linear(VEHICLE_LIGHTS.taillight.emissive), 1e-3)).toBe(true);

    state.brake = 0.8;
    lights.update();
    expect(emissive("taillight").equalsWithEpsilon(linear(VEHICLE_LIGHTS.taillight.brakeEmissive), 1e-3)).toBe(true);

    // In reverse the brake pedal is the accelerator: tail lamps stay at running level.
    state.reversing = true;
    lights.update();
    expect(emissive("taillight").equalsWithEpsilon(linear(VEHICLE_LIGHTS.taillight.emissive), 1e-3)).toBe(true);
    expect(emissive("reverse").equalsWithEpsilon(linear(VEHICLE_LIGHTS.reverse.activeEmissive), 1e-3)).toBe(true);
  });

  it("gives the headlamp lenses an emissive bright enough to bloom", async () => {
    const { emissive } = await setup();
    const lens = emissive("headlight");
    expect(Math.max(lens.r, lens.g, lens.b)).toBeGreaterThan(0.72);
  });
});
