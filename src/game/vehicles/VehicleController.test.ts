import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadHavok } from "../physics/havok";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { buildDebugRoad, type DebugRoad } from "../world/debugRoad";
import { ArcadeHandlingModel, type DriverInput } from "./handling/ArcadeHandlingModel";
import { resolveHandlingPreset } from "./handling/HandlingConfig";
import { HANDLING_PRESETS } from "./handling/presets";
import { VehicleBody } from "./VehicleBody";
import { VehicleController } from "./VehicleController";
import { STARTER_SEDAN } from "./VehicleDefinition";

/**
 * Handling model + Havok body + debug road, headless. These check the physics
 * layer's contract (stable resting, contact, spawn/reset, frames), not the tuning;
 * the tuning is covered by ArcadeHandlingModel.test.ts.
 */

const require = createRequire(import.meta.url);
let havok: Awaited<ReturnType<typeof loadHavok>>;

beforeAll(async () => {
  const wasm = await readFile(require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"));
  havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
});

const config = resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan");
const IDLE: DriverInput = { throttle: 0, brake: 0, steer: 0 };

let engine: NullEngine | null = null;
afterEach(() => {
  engine?.dispose();
  engine = null;
});

function setup(spawn = "start") {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const world = new PhysicsWorld(scene, havok);
  const road: DebugRoad = buildDebugRoad(scene);
  const vehicle = new VehicleBody(world, STARTER_SEDAN.collision, config.chassis.massKg);
  let input: DriverInput = IDLE;
  const controller = new VehicleController(world, vehicle, config, { read: () => input });
  expect(vehicle.place(road.spawnPoints[spawn])).toBe(true);

  const run = (seconds: number, drive: DriverInput = IDLE, each?: () => void) => {
    input = drive;
    for (let t = 0; t < seconds; t += world.fixedStep) {
      world.step();
      each?.();
    }
  };
  const velocity = () => vehicle.body.getLinearVelocity();
  const speed = () => velocity().length();
  /** Speed along the road surface (ignores settling onto it). */
  const planarSpeed = () => {
    const v = velocity();
    return v.subtract(vehicle.up.scale(Vector3.Dot(v, vehicle.up))).length();
  };
  return { scene, world, road, vehicle, controller, run, velocity, speed, planarSpeed };
}

describe("vehicle physics body", () => {
  it("settles on flat ground without bouncing and reports all four wheels in contact", () => {
    const { vehicle, run, velocity } = setup();
    let peakRebound = 0;
    let peakPlanar = 0;
    run(2, IDLE, () => {
      const v = velocity();
      peakRebound = Math.max(peakRebound, v.y);
      peakPlanar = Math.max(peakPlanar, Math.hypot(v.x, v.z));
    });

    // Spawn drops the car a few centimetres; it must land dead, not bounce or skate.
    expect(peakRebound).toBeLessThan(0.05);
    expect(peakPlanar).toBeLessThan(0.01);
    expect(velocity().length()).toBeLessThan(0.01);
    expect(vehicle.contact).toEqual({ front: 1, rear: 1 });
    // Wheel spheres on the road: the car-space origin sits at road level.
    expect(vehicle.position.y).toBeCloseTo(0, 1);
    expect(vehicle.up.y).toBeGreaterThan(0.999);
  });

  it("holds still on an 8° hill and a 15° ramp with no input", () => {
    for (const spawn of ["hill", "steep"]) {
      const { vehicle, run } = setup(spawn);
      run(0.5);
      const settled = vehicle.position.clone();
      run(5);

      expect(Vector3.Distance(settled, vehicle.position)).toBeLessThan(0.01);
      expect(vehicle.groundedWheels).toBe(4);
      engine?.dispose();
    }
  });

  it("holds still parked across a 10° camber", () => {
    const { vehicle, run } = setup("camber");
    run(0.5);
    const settled = vehicle.position.clone();
    run(5);

    expect(Vector3.Distance(settled, vehicle.position)).toBeLessThan(0.01);
    expect(vehicle.groundedWheels).toBe(4);
  });

  it("drives forward along its heading (+z) under throttle", () => {
    const { vehicle, run, velocity } = setup();
    run(0.3);
    run(4, { throttle: 1, brake: 0, steer: 0 });

    const v = velocity();
    expect(v.z).toBeGreaterThan(8);
    expect(Math.abs(v.x)).toBeLessThan(0.05);
    expect(vehicle.position.z).toBeGreaterThan(10);
  });

  it("turns right (toward +x) on right steer and tracks the handling model on its own", () => {
    const { vehicle, run, velocity } = setup("skidpad");
    run(0.3);
    const script: [number, DriverInput][] = [
      [3, { throttle: 0.6, brake: 0, steer: 0 }],
      [3, { throttle: 0.3, brake: 0, steer: 0.4 }],
    ];
    for (const [seconds, drive] of script) run(seconds, drive);

    // Same inputs through the bare model, integrating heading from its yaw rate.
    const reference = new ArcadeHandlingModel(config);
    let referenceHeading = 0;
    for (const [seconds, drive] of script) {
      for (let t = 0; t < seconds; t += 1 / 120) {
        reference.step(1 / 120, drive, { front: 1, rear: 1 });
        referenceHeading += reference.state.yawRate / 120;
      }
    }

    const heading = Math.atan2(vehicle.forward.x, vehicle.forward.z);
    expect(heading).toBeGreaterThan(0.5);
    // Writing velocity against the wrong axes (counting the turn twice) shows up
    // as a heading and speed that drift far from the model's own prediction.
    expect(heading).toBeCloseTo(referenceHeading, 1);
    expect(velocity().length()).toBeCloseTo(Math.hypot(reference.state.vx, reference.state.vy), 0);
    expect(vehicle.groundedWheels).toBe(4);
  });

  it("drives up and over the hill without leaving or sinking into the road", () => {
    const { vehicle, road, run } = setup();
    run(0.3);
    let lowestGap = Infinity;
    run(25, { throttle: 1, brake: 0, steer: 0 }, () => {
      const z = vehicle.position.z;
      const { from, to } = road.sections.uphill;
      if (z > from.z + 5 && z < to.z - 5) {
        const surface = from.y + ((z - from.z) / (to.z - from.z)) * (to.y - from.y);
        lowestGap = Math.min(lowestGap, vehicle.position.y - surface);
      }
    });

    expect(lowestGap).toBeGreaterThan(-0.05);
    expect(lowestGap).toBeLessThan(0.3);
    expect(vehicle.position.z).toBeGreaterThan(road.sections.downhill.from.z);
  });

  it("reports no contact while airborne", () => {
    const { vehicle, run } = setup();
    run(0.3);
    vehicle.body.setLinearVelocity(new Vector3(0, 6, 0));
    run(0.25);

    expect(vehicle.groundedWheels).toBe(0);
    run(2);
    expect(vehicle.groundedWheels).toBe(4);
  });

  it("reset puts a moving, rotated car back on its spawn at rest", () => {
    const { vehicle, controller, road, run, speed, planarSpeed } = setup();
    run(3, { throttle: 1, brake: 0, steer: 0.8 });
    expect(speed()).toBeGreaterThan(5);

    const spawn = road.spawnPoints.hill;
    controller.reset();
    expect(vehicle.place(spawn)).toBe(true);
    let peakPlanar = 0;
    run(1, IDLE, () => (peakPlanar = Math.max(peakPlanar, planarSpeed())));

    expect(peakPlanar).toBeLessThan(0.05);
    expect(Vector3.Distance(vehicle.position, spawn.position)).toBeLessThan(0.1);
    expect(vehicle.groundedWheels).toBe(4);
    expect(controller.model.state.reversing).toBe(false);
  });

  it("refuses to spawn where there is no road", () => {
    const { vehicle } = setup();
    expect(vehicle.place({ position: new Vector3(500, 0, 500), headingRad: 0 })).toBe(false);
  });

  it("stops at a wall instead of passing through it", () => {
    const { vehicle, road, run } = setup();
    const { from } = road.sections.runout;
    // Aim across the runout at the wall on the right, from a standing start.
    vehicle.place({ position: new Vector3(0, 0, from.z + 50), headingRad: Math.PI / 2 });
    run(0.3);
    run(4, { throttle: 1, brake: 0, steer: 0 });

    // Wall face at x = 12; the car is 4.3 m long, so its centre stops ~2.15 m short.
    expect(vehicle.position.x).toBeLessThan(10.2);
    expect(vehicle.groundedWheels).toBe(4);
  });
});
