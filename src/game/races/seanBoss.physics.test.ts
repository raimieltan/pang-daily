import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { beforeAll, expect, it } from 'vitest';
import { loadHavok } from '../physics/havok';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { WorldKit, buildChunk } from '../world/WorldChunk';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import { MountainWorld } from '../world/mountain/MountainWorld';
import { VehicleBody } from '../vehicles/VehicleBody';
import { VehicleController } from '../vehicles/VehicleController';
import { AIDriver, DRIVER_SKILLS } from './AIDriver';
import { MIDNIGHT_RUN } from './raceCalendar';
import { rivalCar, rivalLine } from './rivalDriver';
import { CarTires } from '../vehicles/CarTires';
import { TireSession } from '@/game-core/tires';
import { surfaceResolver } from '../world/surfaceAt';

const require = createRequire(import.meta.url);
let havok: Awaited<ReturnType<typeof loadHavok>>;
beforeAll(async () => {
  const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
  havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
});

it('Sean finishes the full Chapter One route faster than a perfect stock-car plan', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = new PhysicsWorld(scene, havok), kit = new WorldKit(scene);
  const chunks = HUB_LAYOUT.chunks.map(chunk => buildChunk(scene, chunk, kit));
  const mountain = new MountainWorld(scene, kit);
  const surfaceAt = surfaceResolver(HUB_LAYOUT);
  const route = MIDNIGHT_RUN;
  const { definition, config, physics, wheels } = rivalCar(route);
  const line = rivalLine(route, config);
  const body = new VehicleBody(world, definition.collision, config.chassis.massKg, 'test-sean');
  const seed = 'Sean'.split('').reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 1);
  const driver = new AIDriver(line.points, DRIVER_SKILLS[3], {
    aggression: .5, patience: .5, overtakingPreference: 'balanced', defensiveTendency: .5,
    riskTolerance: .5, trafficRiskTolerance: .3, mistakeFrequency: .4,
  }, config.brakes.decelerationMps2, config.chassis.wheelbaseM, seed, line.limits);
  let controller: VehicleController;
  controller = new VehicleController(world, body, physics, { read: () => {
    body.updateAxes();
    const model = controller.model;
    return driver.update(world.fixedStep, {
      position: body.position, heading: Math.atan2(body.forward.x, body.forward.z), speed: model.state.vx,
      yawRate: model.state.yawRate, lateralSlip: model.diagnostics.bodySlip,
      frontGripUsage: model.diagnostics.frontGripUse, rearGripUsage: model.diagnostics.rearGripUse,
      grip: model.surfaceGrip * tires.usableGrip(),
    }, []);
  } });
  // Same simulated tires and per-wheel ground as a rival in the game.
  const tires = new CarTires(new TireSession(), () => 'rival', body, controller.model, surfaceAt, 1, () => wheels);
  tires.apply();
  const first = route.waypoints[0];
  expect(body.place({ position: new Vector3(first.x + 2.8, first.y, first.z), headingRad: route.heading })).toBe(true);

  let elapsed = 0, finished = false, maxSpeed = 0;
  let hint = 0, offRoad = 0, worst = 0, impacts = 0, previousSpeed = 0;
  for (let step = 0; step < Math.round(400 / world.fixedStep); step++) {
    world.step(); tires.step(world.fixedStep); elapsed += world.fixedStep;
    const speed = controller.model.state.vx;
    maxSpeed = Math.max(maxSpeed, speed);
    let nearest = hint, distance = Infinity;
    for (let i = Math.max(0, hint - 5); i < Math.min(route.waypoints.length, hint + 30); i++) {
      const point = route.waypoints[i];
      const next = Math.hypot(point.x - body.position.x, point.z - body.position.z);
      if (next < distance) { nearest = i; distance = next; }
    }
    hint = nearest;
    const points = route.waypoints, point = points[nearest];
    const before = points[Math.max(0, nearest - 1)], after = points[Math.min(points.length - 1, nearest + 1)];
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    const lateral = ((body.position.x - point.x) * (after.z - before.z) -
      (body.position.z - point.z) * (after.x - before.x)) / length + (point.roadOffset ?? 0);
    const outside = Math.abs(lateral) - (point.width ?? 7) / 2 + .85;
    if (outside > 0) { offRoad += world.fixedStep; worst = Math.max(worst, outside); }
    if (step % 6 === 0) {
      if ((previousSpeed - speed) / (6 * world.fixedStep) > config.brakes.decelerationMps2 + 4) impacts++;
      previousSpeed = speed;
    }
    if (Math.hypot(body.position.x - route.finish.center.x, body.position.z - route.finish.center.z) < 7) {
      finished = true;
      break;
    }
  }
  expect(finished).toBe(true);
  expect(elapsed).toBeLessThan(315);
  expect(maxSpeed * 3.6).toBeGreaterThan(135);
  expect(offRoad).toBeLessThan(1);
  expect(worst).toBeLessThan(.25);
  expect(impacts).toBe(0);
  controller.dispose(); body.dispose(); mountain.dispose();
  chunks.forEach(chunk => chunk.dispose());
  kit.dispose(); world.dispose(); scene.dispose(); engine.dispose();
}, 600_000);
