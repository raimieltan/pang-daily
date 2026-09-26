import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { CollisionGroup } from '../physics/PhysicsWorld';
import type { GameSystem } from '../engine/types';
import type { VehicleModel } from '../vehicles/VehicleModel';
import { CAFE_PARKED_CARS } from '../world/hub/cafePopulation';
import type { ParkedCarPlacement } from '../world/population';
import { BodyPartSwapper } from '../vehicles/BodyPartSwapper';
import { WheelSwapper } from '../vehicles/WheelSwapper';
import { bodyPart, resolveBodyPartLook } from '@/game-core/exterior';
import { NPC_CAR_BUILDS, type NpcCarBuild } from '@/game-core/exterior/npcBuilds';
import { wheelPart } from '@/game-core/wheels';

/** Reuses the loaded sedan geometry; each parked car has its own paint and a static collider. */
export class CafeParkedCars implements GameSystem {
  readonly name = 'cafeParkedCars';
  private readonly cars: { root: TransformNode; body: PhysicsBody; shape: PhysicsShapeBox; visual: VehicleModel; parts: BodyPartSwapper; wheels: WheelSwapper }[];
  private disposed = false;

  constructor(scene: Scene, model: VehicleModel, private readonly focus: () => { x: number; z: number },
    placements: readonly ParkedCarPlacement[] = CAFE_PARKED_CARS, prefix = 'cafe-parked') {
    this.cars = placements.map((car, i) => {
      const root = new TransformNode(`${prefix}-${i}`, scene);
      const visual = model.clone(`${prefix}-${i}-sedan`);
      visual.root.parent = root;
      visual.setPaint(car.paint);
      const parts = new BodyPartSwapper(scene, visual);
      const wheels = new WheelSwapper(scene, visual);
      const build: NpcCarBuild | undefined = car.build ? NPC_CAR_BUILDS[car.build] : undefined;
      if (build) {
        visual.setRideHeight(build.rideHeightM);
        const pending = build.parts.map(entry => {
          const part = bodyPart(entry.id)!;
          return parts.equip(part.socket, { part, look: resolveBodyPartLook(part, {
            condition: entry.condition, finish: entry.finish, bodyColor: car.paint, vehicleTags: model.definition.tags,
          }) });
        });
        if (build.wheels) pending.push(wheels.equip(wheelPart(build.wheels)!));
        void Promise.allSettled(pending).then(results => {
          if (this.disposed) return;
          for (const result of results) if (result.status === 'rejected') console.warn(`[parked car ${prefix}-${i}]`, result.reason);
        });
      }
      root.position.set(car.x, car.y ?? 0, car.z);
      root.rotationQuaternion = Quaternion.RotationYawPitchRoll(car.heading * Math.PI / 180, 0, 0);
      const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeBox(new Vector3(0, .75, 0), Quaternion.Identity(), new Vector3(1.8, 1.4, 4.5), scene);
      shape.filterMembershipMask = CollisionGroup.STATIC;
      shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
      shape.material = { friction: .5, restitution: .05 };
      body.shape = shape;
      return { root, body, shape, visual, parts, wheels };
    });
  }

  update() {
    const at = this.focus();
    this.cars.forEach(({ root }) => root.setEnabled(Math.hypot(root.position.x - at.x, root.position.z - at.z) < 220));
  }

  dispose() {
    this.disposed = true;
    this.cars.forEach(({ root, body, shape, visual, parts, wheels }) => {
      parts.dispose(); wheels.dispose(); body.dispose(); shape.dispose(); visual.dispose(); root.dispose();
    });
  }
}
