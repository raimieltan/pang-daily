import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsMotionType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { BODY_PART_SOCKETS, bodyPart, resolveBodyPartLook } from '@/game-core/exterior';
import type { InventorySession } from '@/game-core/inventory/InventorySession';
import { wheelPart } from '@/game-core/wheels';
import type { GameSystem } from '../engine/types';
import type { Interactable } from '../interaction/Interaction';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import { CollisionGroup } from '../physics/PhysicsWorld';
import type { PlayerMode } from '../player/PlayerMode';
import { BodyPartSwapper } from './BodyPartSwapper';
import type { VehiclePose } from './VehicleBody';
import type { VehicleRuntimeDefinition } from './VehicleDefinition';
import { VehicleModel } from './VehicleModel';
import { WheelSwapper } from './WheelSwapper';

const DOOR_REACH_M = 1.2;
const SWITCH_PRIORITY = 10;

type GaragePlayer = { readonly mode: PlayerMode; readonly position: Vector3 };

/**
 * The owned car you're not driving, parked at home as a static prop dressed in its saved paint,
 * stance, wheels and body parts. Walk up to its door and "Drive" it: `onSwitch` swaps which car
 * the scene spawns (the one you left is parked here in its place).
 */
export class HomeGarage implements GameSystem {
  readonly name = 'homeGarage';
  private readonly root: TransformNode;
  private readonly body: PhysicsBody;
  private readonly shape: PhysicsShapeBox;
  private readonly parts: BodyPartSwapper;
  private readonly wheels: WheelSwapper;
  private readonly doors: Vector3[];
  private readonly interactable: Omit<Interactable, 'area'>;
  private disposed = false;

  private constructor(
    readonly car: VehicleRuntimeDefinition,
    readonly model: VehicleModel,
    pose: VehiclePose,
    private readonly player: GaragePlayer,
    private readonly onSwitch: (car: VehicleRuntimeDefinition) => void,
    inventory: InventorySession,
  ) {
    const scene = model.root.getScene();
    const { spec, collision } = car;
    this.root = new TransformNode(`garage-${spec.id}`, scene);
    this.root.position.copyFrom(pose.position);
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), pose.headingRad);
    model.root.parent = this.root;
    for (const mesh of model.root.getChildMeshes()) mesh.isPickable = false;

    this.body = new PhysicsBody(this.root, PhysicsMotionType.STATIC, false, scene);
    const box = collision.body;
    this.shape = new PhysicsShapeBox(new Vector3(0, box.bottomY + box.height / 2, box.centerZ), Quaternion.Identity(),
      new Vector3(box.width, box.height, box.length), scene);
    this.shape.filterMembershipMask = CollisionGroup.STATIC;
    this.shape.filterCollideMask = CollisionGroup.VEHICLE | CollisionGroup.CHARACTER;
    this.shape.material = { friction: 0.5, restitution: 0.05 };
    this.body.shape = this.shape;

    this.root.computeWorldMatrix(true);
    this.doors = [-1, 1].map(side => Vector3.TransformCoordinates(
      new Vector3(side * (box.width / 2 + 0.35), 0, box.centerZ + 0.2), this.root.getWorldMatrix()));
    this.interactable = {
      id: `vehicle:${spec.id}`, action: 'switch_vehicle', label: `Drive the ${spec.identity.model}`,
      priority: SWITCH_PRIORITY, target: spec.id, locationId: 'home',
    };

    this.parts = new BodyPartSwapper(scene, model);
    this.wheels = new WheelSwapper(scene, model);
    this.dress(inventory);
  }

  static async create(scene: Scene, car: VehicleRuntimeDefinition, pose: VehiclePose, player: GaragePlayer,
    inventory: InventorySession, onSwitch: (car: VehicleRuntimeDefinition) => void,
    source?: string | ArrayBufferView): Promise<HomeGarage> {
    const model = await VehicleModel.load(scene, car.spec, source);
    return new HomeGarage(car, model, pose, player, onSwitch, inventory);
  }

  /** Door prompts, on foot only. Pass to `InteractionSystem` as a source. */
  readonly interactions = (): Interactable[] => {
    if (this.disposed || this.player.mode !== 'walking') return [];
    return this.doors.map((door, i) => ({
      ...this.interactable, id: `${this.interactable.id}:door:${i}`,
      area: { kind: 'circle', x: door.x, z: door.z, radius: DOOR_REACH_M },
    }));
  };

  connect(interactions: InteractionSystem): () => void {
    return interactions.handle('switch_vehicle', (target) => {
      if (target.target !== this.car.spec.id) return { rejected: "That's not your car" };
      this.onSwitch(this.car);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.parts.dispose();
    this.wheels.dispose();
    this.body.dispose();
    this.shape.dispose();
    this.model.dispose();
    this.root.dispose();
  }

  /** Parked the way it was left: saved paint and stance, installed wheels and panels. */
  private dress(inventory: InventorySession): void {
    const { spec } = this.car;
    const id = spec.id;
    const appearance = inventory.appearance(id);
    if (appearance) {
      this.model.setPaint(appearance.paint);
      this.model.setRideHeight(appearance.rideHeightM);
    }
    this.model.setStockSpoilerVisible(!inventory.isStockSpoilerRemoved(id));
    const installed = inventory.installedOn(id);
    const sockets = new Set(spec.visual.model.attachments.map(a => a.slot));
    const pending: Promise<unknown>[] = [];
    for (const socket of BODY_PART_SOCKETS) {
      const item = sockets.has(socket) && installed[socket] ? inventory.item(installed[socket]!) : undefined;
      const part = item && bodyPart(item.partId);
      if (!item || !part) continue;
      pending.push(this.parts.equip(socket, { part, look: resolveBodyPartLook(part, {
        condition: item.condition, finish: item.finish, bodyColor: this.model.paint, vehicleTags: spec.tags,
      }) }));
    }
    const wheelItem = installed.wheels ? inventory.item(installed.wheels) : undefined;
    const wheels = wheelItem && wheelPart(wheelItem.partId);
    if (wheels) pending.push(this.wheels.equip(wheels));
    void Promise.allSettled(pending).then(results => {
      if (this.disposed) return;
      for (const result of results) if (result.status === 'rejected') console.warn(`[garage ${id}]`, result.reason);
    });
  }
}
