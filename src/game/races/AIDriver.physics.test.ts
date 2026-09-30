import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { beforeAll, expect, it } from 'vitest';
import { loadHavok } from '../physics/havok';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { buildDebugRoad } from '../world/debugRoad';
import { VehicleBody } from '../vehicles/VehicleBody';
import { VehicleController } from '../vehicles/VehicleController';
import { STARTER_SEDAN } from '../vehicles/VehicleDefinition';
import { resolveHandlingPreset } from '../vehicles/handling/HandlingConfig';
import { HANDLING_PRESETS } from '../vehicles/handling/presets';
import { AIDriver, DRIVER_SKILLS } from './AIDriver';
import { CarTires } from '../vehicles/CarTires';
import { TireSession, puncture } from '@/game-core/tires';

const require = createRequire(import.meta.url);
let havok: Awaited<ReturnType<typeof loadHavok>>;
beforeAll(async () => {
  const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
  havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
});

it('drives a colliding Havok car through normal controller inputs', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = new PhysicsWorld(scene, havok);
  const road = buildDebugRoad(scene);
  const config = resolveHandlingPreset(HANDLING_PRESETS, STARTER_SEDAN.tunes.street);
  const body = new VehicleBody(world, STARTER_SEDAN.collision, config.chassis.massKg, 'test-ai');
  const points = Array.from({ length: 100 }, (_, i) => ({ x: 0, y: 0, z: i * 4, speed: 23 }));
  const driver = new AIDriver(points, DRIVER_SKILLS[3], { aggression: .4, patience: .6,
    overtakingPreference: 'balanced', defensiveTendency: .4, riskTolerance: .4,
    trafficRiskTolerance: .3, mistakeFrequency: .2 }, config.brakes.decelerationMps2, config.chassis.wheelbaseM);
  let controller: VehicleController;
  controller = new VehicleController(world, body, config, { read: () => {
    body.updateAxes();
    const model = controller.model;
    return driver.update(world.fixedStep, { position: body.position,
      heading: Math.atan2(body.forward.x, body.forward.z), speed: model.state.vx,
      yawRate: model.state.yawRate, lateralSlip: model.diagnostics.bodySlip,
      frontGripUsage: model.diagnostics.frontGripUse, rearGripUsage: model.diagnostics.rearGripUse, grip: 1 }, []);
  } });
  expect(body.place(road.spawnPoints.start)).toBe(true);
  let previous = body.position.clone(), maxStep = 0, maxSpeed = 0;
  // A stock sedan on real gearing and full mass reaches 83 km/h in about 11 s.
  for (let i = 0; i < 1500; i++) {
    world.step();
    maxStep = Math.max(maxStep, Vector3.Distance(body.position, previous));
    maxSpeed = Math.max(maxSpeed, controller.model.state.vx);
    previous = body.position.clone();
  }
  expect(maxSpeed).toBeGreaterThan(23);
  expect(body.position.z).toBeGreaterThan(100);
  expect(maxStep).toBeLessThan(.7);
  expect(Math.abs(body.position.x)).toBeLessThan(5);
  controller.dispose(); body.dispose(); world.dispose(); scene.dispose(); engine.dispose();
});

it('drives on simulated tires: a front-left blowout slows the AI, pulls it, and wears the tire, but it holds its lane', () => {
  const run = (blowout: boolean) => {
    const engine = new NullEngine(), scene = new Scene(engine);
    const world = new PhysicsWorld(scene, havok);
    const road = buildDebugRoad(scene);
    const config = resolveHandlingPreset(HANDLING_PRESETS, STARTER_SEDAN.tunes.street);
    const body = new VehicleBody(world, STARTER_SEDAN.collision, config.chassis.massKg, 'test-ai-tires');
    const points = Array.from({ length: 100 }, (_, i) => ({ x: 0, y: 0, z: i * 4, speed: 23 }));
    const driver = new AIDriver(points, DRIVER_SKILLS[3], { aggression: .4, patience: .6,
      overtakingPreference: 'balanced', defensiveTendency: .4, riskTolerance: .4,
      trafficRiskTolerance: .3, mistakeFrequency: .2 }, config.brakes.decelerationMps2, config.chassis.wheelbaseM);
    const controller: VehicleController = new VehicleController(world, body, config, { read: () => {
      body.updateAxes();
      const model = controller.model;
      return driver.update(world.fixedStep, { position: body.position,
        heading: Math.atan2(body.forward.x, body.forward.z), speed: model.state.vx,
        yawRate: model.state.yawRate, lateralSlip: model.diagnostics.bodySlip,
        frontGripUsage: model.diagnostics.frontGripUse, rearGripUsage: model.diagnostics.rearGripUse, grip: tires.usableGrip() }, []);
    } });
    // Read only once the world steps, after this line has run.
    const tires = new CarTires(new TireSession(), () => 'ai', body, controller.model, () => 'asphalt');
    if (blowout) puncture(tires.mounted('FL')!, 'BLOWOUT');
    tires.apply();
    expect(body.place(road.spawnPoints.start)).toBe(true);
    let maxSpeed = 0, maxDrift = 0;
    for (let i = 0; i < 1200; i++) {
      world.step();
      tires.step(world.fixedStep);
      maxSpeed = Math.max(maxSpeed, controller.model.state.vx);
      maxDrift = Math.max(maxDrift, Math.abs(body.position.x));
    }
    const result = { maxSpeed, maxDrift, z: body.position.z, fl: { ...tires.mounted('FL')! }, grip: tires.usableGrip() };
    controller.dispose(); body.dispose(); world.dispose(); scene.dispose(); engine.dispose();
    return result;
  };
  const healthy = run(false), flat = run(true);
  expect(healthy.fl.failure).toBe('HEALTHY');
  expect(healthy.grip).toBe(1);
  expect(flat.grip).toBeLessThan(.9);
  expect(flat.maxSpeed).toBeLessThan(healthy.maxSpeed);
  expect(flat.z).toBeLessThan(healthy.z);
  expect(flat.fl.health).toBeLessThan(.35);
  expect(flat.maxDrift).toBeLessThan(5);
  expect(flat.z).toBeGreaterThan(60);
});
