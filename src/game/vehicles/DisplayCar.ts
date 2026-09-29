import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { GameSystem } from '../engine/types';
import { CollisionGroup } from '../physics/PhysicsWorld';
import type { VehiclePose } from './VehicleBody';
import type { VehicleRuntimeDefinition } from './VehicleDefinition';
import { VehicleModel } from './VehicleModel';

/** A stock car standing on a lot as a solid, static prop: dealer stock nobody can drive. */
export class DisplayCar implements GameSystem {
  readonly name = 'displayCar';
  private readonly root: TransformNode;
  private readonly body: PhysicsBody;
  private readonly shape: PhysicsShapeBox;

  private constructor(readonly car: VehicleRuntimeDefinition, private readonly model: VehicleModel, pose: VehiclePose) {
    const scene = model.root.getScene();
    this.root = new TransformNode(`display-${car.spec.id}`, scene);
    this.root.position.copyFrom(pose.position);
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), pose.headingRad);
    model.root.parent = this.root;
    for (const mesh of model.root.getChildMeshes()) mesh.isPickable = false;

    this.body = new PhysicsBody(this.root, PhysicsMotionType.STATIC, false, scene);
    const box = car.collision.body;
    this.shape = new PhysicsShapeBox(new Vector3(0, box.bottomY + box.height / 2, box.centerZ), Quaternion.Identity(),
      new Vector3(box.width, box.height, box.length), scene);
    this.shape.filterMembershipMask = CollisionGroup.STATIC;
    this.shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
    this.shape.material = { friction: 0.5, restitution: 0.05 };
    this.body.shape = this.shape;
  }

  static async create(scene: Scene, car: VehicleRuntimeDefinition, pose: VehiclePose): Promise<DisplayCar> {
    return new DisplayCar(car, await VehicleModel.load(scene, car.spec), pose);
  }

  dispose(): void {
    this.body.dispose();
    this.shape.dispose();
    this.model.dispose();
    this.root.dispose();
  }
}
