import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { beforeAll, it, expect } from 'vitest';
import { loadHavok } from '../physics/havok';
import { CollisionGroup, PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleBody } from './VehicleBody';
import { VehicleController } from './VehicleController';
import { STARTER_SEDAN, RWD_BOX_SEDAN } from './VehicleDefinition';
import { resolveHandlingPreset } from './handling/HandlingConfig';
import { HANDLING_PRESETS } from './handling/presets';
let havok: Awaited<ReturnType<typeof loadHavok>>;
beforeAll(async () => { const require = createRequire(import.meta.url); const wasm = await readFile(require.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')); havok = await loadHavok({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }); });
for (const definition of [STARTER_SEDAN, RWD_BOX_SEDAN]) it(`${definition.spec.id} settles on springs, launches and pitches through Havok forces`, () => {
  const engine = new NullEngine(), scene = new Scene(engine), world = new PhysicsWorld(scene, havok);
  const mesh = MeshBuilder.CreateBox('road', { width: 1000, depth: 1000, height: .2 }, scene); mesh.position.y = -.1;
  const ground = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0 }, scene); ground.shape.filterMembershipMask = CollisionGroup.STATIC;
  const config = resolveHandlingPreset(HANDLING_PRESETS, definition.tunes.street), body = new VehicleBody(world, definition.collision, config.chassis.massKg);
  const controls = { throttle: 0, brake: 0, steer: 0 }; const controller = new VehicleController(world, body, config, { read: () => controls });
  body.place({ position: Vector3.Zero(), headingRad: 0 });
  try {
    for (let n = 0; n < 600; n++) world.step();
    expect(Math.abs(body.position.y)).toBeLessThan(.035);
    expect(body.groundedWheels).toBe(4);
    expect(body.body.getLinearVelocity().length()).toBeLessThan(.1);
    const baseline = controller.suspension.solver.corners[0].wheelLoad;
    controls.throttle = 1; for (let n = 0; n < 360; n++) world.step();
    expect(body.body.getLinearVelocity().z).toBeGreaterThan(3);
    expect(controller.suspension.solver.corners[0].wheelLoad).toBeLessThan(baseline);
    expect(body.node.rotationQuaternion!.toEulerAngles().x).toBeLessThan(0);
    expect(controller.suspension.solver.corners.every(c => Number.isFinite(c.wheelLoad + c.compression))).toBe(true);
  } finally { controller.dispose(); body.dispose(); scene.dispose(); engine.dispose(); }
});
