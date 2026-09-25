import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadHavok } from "../../physics/havok";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import type { DriverInput } from "../../vehicles/handling/ArcadeHandlingModel";
import { resolveHandlingPreset } from "../../vehicles/handling/HandlingConfig";
import { HANDLING_PRESETS } from "../../vehicles/handling/presets";
import { VehicleBody, type VehiclePose } from "../../vehicles/VehicleBody";
import { VehicleController } from "../../vehicles/VehicleController";
import { STARTER_SEDAN } from "../../vehicles/VehicleDefinition";
import { pointAlong, polylineLength } from "../layoutTools";
import { buildChunk, WorldKit, type WorldChunk } from "../WorldChunk";
import type { Pose } from "../WorldLayout";
import { HUB_LAYOUT } from "./hubLayout";

/**
 * The built hub, headless, with the real Havok body and handling controller: every spawn
 * and return point lands the car on its wheels, and a simple pure-pursuit autopilot can
 * drive the whole loop without leaving the road or touching a collider.
 */

const require = createRequire(import.meta.url);
const DEG = Math.PI / 180;
const config = resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan");
const WHEELBASE = 2.5;
const MAX_STEER = 32 * DEG;
const IDLE: DriverInput = { throttle: 0, brake: 0, steer: 0 };

let engine: NullEngine;
let world: PhysicsWorld;
let chunks: WorldChunk[];
let vehicle: VehicleBody;
let controller: VehicleController;
let input: DriverInput = IDLE;

beforeAll(async () => {
  const wasm = await readFile(require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"));
  const havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  engine = new NullEngine();
  const scene = new Scene(engine);
  world = new PhysicsWorld(scene, havok);
  const kit = new WorldKit(scene);
  chunks = HUB_LAYOUT.chunks.map((chunk) => buildChunk(scene, chunk, kit));
  vehicle = new VehicleBody(world, STARTER_SEDAN.collision, config.chassis.massKg);
  controller = new VehicleController(world, vehicle, config, { read: () => input });
});

afterAll(() => engine?.dispose());

const toVehiclePose = (p: Pose): VehiclePose => ({ position: new Vector3(p.x, 0, p.z), headingRad: p.headingDeg * DEG });

function run(seconds: number, each?: () => boolean | void): void {
  for (let t = 0; t < seconds; t += world.fixedStep) {
    world.step();
    if (each?.()) return;
  }
}

describe("built hub", () => {
  it("builds every chunk with its colliders", () => {
    expect(chunks.map((c) => c.id).sort()).toEqual(HUB_LAYOUT.chunks.map((c) => c.id).sort());
    for (const chunk of chunks) expect(chunk.colliderCount, chunk.id).toBeGreaterThan(0);
  });

  it("lands the car on its wheels, at rest, at every spawn and return point", () => {
    for (const location of HUB_LAYOUT.locations) {
      for (const [kind, pose] of [
        ["spawn", location.spawn],
        ["return", location.returnPoint],
      ] as const) {
        input = IDLE;
        controller.reset();
        expect(vehicle.place(toVehiclePose(pose)), `${location.id} ${kind}`).toBe(true);
        run(1.5);
        const { x, y, z } = vehicle.position;
        expect(vehicle.groundedWheels, `${location.id} ${kind} wheels`).toBe(4);
        expect(Math.hypot(x - pose.x, z - pose.z), `${location.id} ${kind} drift`).toBeLessThan(0.3);
        expect(Math.abs(y), `${location.id} ${kind} height`).toBeLessThan(0.5);
      }
    }
  });

  it("can be driven round the whole loop by the real controller", () => {
    const loop = HUB_LAYOUT.loop.map(([x, z]) => ({ x, z }));
    const length = polylineLength(loop);
    const start = pointAlong(loop, 0);
    input = IDLE;
    controller.reset();
    vehicle.place({ position: new Vector3(start.x, 0, start.z), headingRad: Math.atan2(start.dirX, start.dirZ) });
    run(0.5);

    let progress = 0;
    let worstOffset = 0;
    let minSpeedAfterLaunch = Infinity;
    let elapsed = 0;
    run(150, () => {
      elapsed += world.fixedStep;
      const { x, z } = vehicle.position;
      // Advance progress to the closest centreline point within the next 10 m.
      let best = progress;
      let bestD = Infinity;
      for (let s = progress; s <= progress + 10; s += 0.25) {
        const p = pointAlong(loop, s);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) [best, bestD] = [s, d];
      }
      progress = best;
      worstOffset = Math.max(worstOffset, bestD);

      const v = vehicle.body.getLinearVelocity();
      const speed = Math.hypot(v.x, v.z);
      if (elapsed > 5) minSpeedAfterLaunch = Math.min(minSpeedAfterLaunch, speed);
      input = autopilot(loop, progress, speed);
      return progress >= length - 3;
    });

    expect(progress, `stopped at ${progress.toFixed(0)} / ${length.toFixed(0)} m`).toBeGreaterThanOrEqual(length - 3);
    // Narrowest loop road is 9 m wide: the whole car stays on it, with half a metre to spare.
    expect(worstOffset).toBeLessThan(9 / 2 - STARTER_SEDAN.spec.dimensions.widthM / 2 - 0.5);
    // Never stalled against anything.
    expect(minSpeedAfterLaunch).toBeGreaterThan(5);
    expect(vehicle.groundedWheels).toBe(4);
    // A lap at town pace; recorded for the layout doc.
    expect(elapsed).toBeLessThan(120);
  });
});

/** Pure pursuit on the loop centreline; slows for corners it can see coming. */
function autopilot(loop: { x: number; z: number }[], progress: number, speed: number): DriverInput {
  const lookahead = 5 + speed * 0.35;
  const target = pointAlong(loop, progress + lookahead);
  const { x, z } = vehicle.position;
  const f = vehicle.forward;
  const [fx, fz] = [f.x, f.z];
  const [rx, rz] = [fz, -fx];
  const [dx, dz] = [target.x - x, target.z - z];
  const alpha = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  const steerAngle = Math.atan((2 * WHEELBASE * Math.sin(alpha)) / lookahead);

  const here = pointAlong(loop, progress);
  const ahead = pointAlong(loop, progress + 30);
  const turn = Math.acos(Math.max(-1, Math.min(1, here.dirX * ahead.dirX + here.dirZ * ahead.dirZ)));
  const targetSpeed = turn > 20 * DEG ? 10 : 16;
  const error = targetSpeed - speed;
  return {
    steer: Math.max(-1, Math.min(1, steerAngle / MAX_STEER)),
    throttle: Math.max(0, Math.min(1, error * 0.4)),
    brake: error < -1.5 ? Math.min(1, -error * 0.3) : 0,
  };
}
