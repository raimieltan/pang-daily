import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { CollisionGroup } from '../physics/PhysicsWorld';
import type { GameSystem } from '../engine/types';
import type { VehicleModel } from '../vehicles/VehicleModel';
import { CAFE_PARKED_CARS } from '../world/hub/cafePopulation';
import type { ParkedCarPlacement } from '../world/population';

/** Reuses the loaded sedan geometry; each parked car has its own paint and a static collider. */
export class CafeParkedCars implements GameSystem {
  readonly name = 'cafeParkedCars';
  private readonly cars: { root: TransformNode; body: PhysicsBody; shape: PhysicsShapeBox; paint: Material }[];

  constructor(scene: Scene, model: VehicleModel, private readonly focus: () => { x: number; z: number },
    placements: readonly ParkedCarPlacement[] = CAFE_PARKED_CARS, prefix = 'cafe-parked') {
    this.cars = placements.map((car, i) => {
      const root = new TransformNode(`${prefix}-${i}`, scene);
      const copy = model.root.clone(`${prefix}-${i}-sedan`, root, false)!;
      copy.setEnabled(true);
      const sourcePaint = model.material('paint')!;
      const paint = sourcePaint.clone(`${prefix}-${i}-paint`)!;
      paint.unfreeze();
      const color = Color3.FromHexString(car.paint).toLinearSpace();
      if (paint instanceof PBRMaterial) paint.albedoColor = color;
      if (paint instanceof StandardMaterial) paint.diffuseColor = color;
      paint.freeze();
      for (const mesh of copy.getChildMeshes()) {
        if (mesh.material === sourcePaint) mesh.material = paint;
        mesh.isPickable = false;
      }
      root.position.set(car.x, car.y ?? 0, car.z);
      root.rotationQuaternion = Quaternion.RotationYawPitchRoll(car.heading * Math.PI / 180, 0, 0);
      const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
      const shape = new PhysicsShapeBox(new Vector3(0, .75, 0), Quaternion.Identity(), new Vector3(1.8, 1.4, 4.5), scene);
      shape.filterMembershipMask = CollisionGroup.STATIC;
      shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
      shape.material = { friction: .5, restitution: .05 };
      body.shape = shape;
      return { root, body, shape, paint };
    });
  }

  update() {
    const at = this.focus();
    this.cars.forEach(({ root }) => root.setEnabled(Math.hypot(root.position.x - at.x, root.position.z - at.z) < 220));
  }

  dispose() {
    this.cars.forEach(({ root, body, shape, paint }) => { body.dispose(); shape.dispose(); root.dispose(); paint.dispose(); });
  }
}
