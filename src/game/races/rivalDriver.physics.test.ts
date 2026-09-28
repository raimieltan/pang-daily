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
import { lineTime } from './racingLine';
import { rivalCar, rivalLine } from './rivalDriver';
import { CarTires } from '../vehicles/CarTires';
import { TireSession } from '@/game-core/tires';
import { surfaceResolver } from '../world/surfaceAt';
import { RACE_CALENDAR } from './raceCalendar';
import type { RaceDefinition } from './Race';

const require = createRequire(import.meta.url);
let havok: Awaited<ReturnType<typeof loadHavok>>;
beforeAll(async () => {
  const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm'));
  havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
});

// These bends exposed a waypoint-heading jump that sent the rival into roadside objects.
it('keeps mountain rivals on pavement while following their planned pace', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const world = new PhysicsWorld(scene, havok);
  const kit = new WorldKit(scene);
  const chunks = HUB_LAYOUT.chunks.map(chunk => buildChunk(scene, chunk, kit));
  const mountain = new MountainWorld(scene, kit);
  const surfaceAt = surfaceResolver(HUB_LAYOUT);

  for (const id of ['kyo_block_lap', 'terrace_sprint', 'pahuway_descent', 'the_wall']) {
    const base = RACE_CALENDAR.find(r => r.id === id)!;
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const route: RaceDefinition = { ...base, rival: { ...base.rival!, tier } };
      const { definition, config, physics, wheels } = rivalCar(route);
      const line = rivalLine(route, config);
      const body = new VehicleBody(world, definition.collision, config.chassis.massKg, `test-${id}-${tier}`);
      const driver = new AIDriver(line.points, DRIVER_SKILLS[Math.min(3, tier - 1)], {
        aggression: .5, patience: .5, overtakingPreference: 'balanced', defensiveTendency: .5,
        riskTolerance: .5, trafficRiskTolerance: .3, mistakeFrequency: .4,
      }, config.brakes.decelerationMps2, config.chassis.wheelbaseM, 11, line.limits);
      let controller: VehicleController;
      controller = new VehicleController(world, body, physics, { read: () => {
        body.updateAxes();
        const model = controller.model;
        return driver.update(world.fixedStep, {
          position: body.position, heading: Math.atan2(body.forward.x, body.forward.z),
          speed: model.state.vx, yawRate: model.state.yawRate, lateralSlip: model.diagnostics.bodySlip,
          frontGripUsage: model.diagnostics.frontGripUse, rearGripUsage: model.diagnostics.rearGripUse,
          grip: model.surfaceGrip * tires.usableGrip(),
        }, []);
      } });
      // Same simulated tires and per-wheel ground as a rival in the game.
      const tires = new CarTires(new TireSession(), () => 'rival', body, controller.model, surfaceAt, 1, () => wheels);
      tires.apply();
      const first = route.waypoints[0];
      expect(body.place({ position: new Vector3(first.x, first.y, first.z), headingRad: route.heading })).toBe(true);

      let hint = 0, offRoad = 0, worst = 0, impacts = 0, previousSpeed = 0, elapsed = 0, finished = false;
      for (let step = 0; step < Math.round(420 / world.fixedStep); step++) {
        world.step(); tires.step(world.fixedStep);
        elapsed += world.fixedStep;
        const speed = controller.model.state.vx;
        let nearest = hint, nearestDistance = Infinity;
        for (let i = Math.max(0, hint - 5); i < Math.min(route.waypoints.length, hint + 30); i++) {
          const point = route.waypoints[i];
          const d = Math.hypot(point.x - body.position.x, point.z - body.position.z);
          if (d < nearestDistance) { nearest = i; nearestDistance = d; }
        }
        hint = nearest;
        const points = route.waypoints;
        const point = points[nearest], before = points[Math.max(0, nearest - 1)];
        const after = points[Math.min(points.length - 1, nearest + 1)];
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
      const caseName = `${id} tier ${tier}`;
      expect(finished, `${caseName} should finish`).toBe(true);
      expect(offRoad, `${caseName} spent ${offRoad.toFixed(2)} s off pavement`).toBeLessThan(.5);
      expect(worst, `${caseName} exceeded the road by ${worst.toFixed(2)} m`).toBeLessThan(.15);
      expect(impacts, `${caseName} had roadside impacts`).toBe(0);
      expect(elapsed, `${caseName} lagged its speed plan`).toBeLessThan(lineTime(line.points) * 1.15);
      controller.dispose();
      body.dispose();
    }
  }
  mountain.dispose();
  chunks.forEach(chunk => chunk.dispose());
  kit.dispose();
  world.dispose();
  scene.dispose();
  engine.dispose();
}, 600_000);
