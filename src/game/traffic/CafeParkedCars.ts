import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { CollisionGroup } from '../physics/PhysicsWorld';
import type { GameSystem } from '../engine/types';
import { CAFE_PARKED_CARS } from '../world/hub/cafePopulation';
import type { ParkedCarPlacement } from '../world/population';
import { dressNpcCar, type NpcCar, type NpcCarModels } from '../vehicles/npcCar';
import { NPC_CAR_BUILDS, npcCarId } from '@/game-core/exterior/npcBuilds';

/** Clones the loaded owned cars; each parked car has its own paint, build and a static collider. */
export class CafeParkedCars implements GameSystem {
  readonly name = 'cafeParkedCars';
  private readonly cars: { root: TransformNode; body: PhysicsBody; shape: PhysicsShapeBox; car: NpcCar }[];

  constructor(scene: Scene, models: NpcCarModels, private readonly focus: () => { x: number; z: number },
    placements: readonly ParkedCarPlacement[] = CAFE_PARKED_CARS, prefix = 'cafe-parked') {
    const loaded = models();
    this.cars = placements.flatMap((placement, i) => {
      const build = placement.build ? NPC_CAR_BUILDS[placement.build] : undefined;
      const source = loaded[npcCarId(build)];
      if (!source) { console.warn(`[${prefix}-${i}] no loaded model for ${npcCarId(build)}`); return []; }
      const root = new TransformNode(`${prefix}-${i}`, scene);
      const car = dressNpcCar(scene, source, `${prefix}-${i}-car`, placement.paint, build);
      car.model.root.parent = root;
      root.position.set(placement.x, placement.y ?? 0, placement.z);
      root.rotationQuaternion = Quaternion.RotationYawPitchRoll(placement.heading * Math.PI / 180, 0, 0);
      const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeBox(new Vector3(0, .75, 0), Quaternion.Identity(), new Vector3(1.8, 1.4, 4.5), scene);
      shape.filterMembershipMask = CollisionGroup.STATIC;
      shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
      shape.material = { friction: .5, restitution: .05 };
      body.shape = shape;
      return [{ root, body, shape, car }];
    });
  }

  update() {
    const at = this.focus();
    this.cars.forEach(({ root }) => root.setEnabled(Math.hypot(root.position.x - at.x, root.position.z - at.z) < 220));
  }

  dispose() {
    this.cars.forEach(({ root, body, shape, car }) => { car.dispose(); body.dispose(); shape.dispose(); root.dispose(); });
  }
}
