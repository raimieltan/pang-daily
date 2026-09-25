import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeBox } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType, PhysicsPrestepType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import type { GameSystem } from '../engine/types';
import type { WorldKit } from '../world/WorldChunk';
import { CollisionGroup, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { VehicleModel } from '../vehicles/VehicleModel';
import { TrafficFlow, type RoadUser } from './TrafficFlow';
import type { Waypoint } from '../races/Race';
import { CharacterVisual } from '../characters/CharacterVisual';
import { TrafficLights } from './TrafficLights';

const PAINTS = ['#547b89', '#944b43', '#d4cbb2', '#50735b', '#7e8290', '#c49a54'];

/** Traffic poses and Havok targets advance together, once per physics step. */
export class TrafficSystem implements GameSystem {
 readonly name = 'traffic';
 readonly flow: TrafficFlow;
 private nodes: TransformNode[] = [];
 private bodies: PhysicsBody[] = [];
 private shapes: PhysicsShapeBox[] = [];
 private paints: Material[] = [];
 private wheels: TransformNode[][] = [];
 private spins: number[] = [];
 private release: () => void;
 private readonly lights: TrafficLights;

 constructor(scene: Scene, kit: WorldKit, world: PhysicsWorld, model: VehicleModel,
  lanes: readonly (readonly Waypoint[])[], private player: () => RoadUser, night: () => number = () => 0) {
  this.flow = new TrafficFlow(lanes, player());
  for (const [i, actor] of this.flow.actors.entries()) {
   const root = new TransformNode(`traffic-${i}-${actor.kind.id}`, scene);
   this.nodes.push(root);
   this.spins.push(0);
   if (actor.kind.id === 'motorcycle' || actor.kind.id === 'tricycle') {
    const templates = kit.props.template(actor.kind.id === 'motorcycle' ? 'motorcycle_parked' : 'tricycle_parked');
    for (const template of Object.values(templates)) {
     const mesh = template.clone(`traffic-${i}-model`, root);
     mesh.setEnabled(true);
    }
    this.wheels.push([]);
    const rider = new CharacterVisual(scene, kit.lit, 1.7);
    rider.root.name = `traffic-${i}-driver`;
    rider.root.parent = root;
    rider.sitOnMotorcycle();
   } else {
    const copy = model.root.clone(`traffic-${i}-sedan`, root, false)!;
    copy.setEnabled(true);
    const sourcePaint = model.material('paint')!;
    const paint = sourcePaint.clone(`traffic-${i}-paint`)!;
    paint.unfreeze();
    const color = Color3.FromHexString(PAINTS[i % PAINTS.length]).toLinearSpace();
    if (paint instanceof PBRMaterial) paint.albedoColor = color;
    if (paint instanceof StandardMaterial) paint.diffuseColor = color;
    paint.freeze();
    this.paints.push(paint);
    for (const mesh of copy.getChildMeshes()) {
     if (mesh.material === sourcePaint) mesh.material = paint;
     mesh.isPickable = false;
    }
    this.wheels.push(copy.getDescendants().filter((n): n is TransformNode =>
     n instanceof TransformNode && /_hub_(fl|fr|rl|rr)$/.test(n.name)));
   }
   const p = actor.follower.position;
   root.position.set(p.x, p.y, p.z);
   root.rotationQuaternion = this.rotation(i);
   root.setEnabled(actor.active);
   const body = new PhysicsBody(root, PhysicsMotionType.ANIMATED, false, scene);
   const shape = new PhysicsShapeBox(new Vector3(0, .8, 0), Quaternion.Identity(),
    new Vector3(actor.kind.width, 1.1, actor.kind.length), scene);
   shape.filterMembershipMask = CollisionGroup.VEHICLE;
   shape.filterCollideMask = actor.active ? CollisionGroup.VEHICLE | CollisionGroup.CHARACTER : 0;
   shape.material = { friction: 0, restitution: 0 };
   body.shape = shape;
   this.bodies.push(body);
   this.shapes.push(shape);
  }
  this.lights = new TrafficLights(scene, this.nodes.map((root, i) => ({ root, motorcycle: this.flow.actors[i].kind.id !== 'car' })), player, night);
  this.release = world.onBeforeStep(dt => this.step(dt));
 }

 private rotation(i: number) {
  const f = this.flow.actors[i].follower;
  const end = Math.min(f.segment, f.points.length - 1);
  const a = f.points[Math.max(0, end - 1)], b = f.points[end];
  // Use the complete segment: the residual distance can approach zero at a waypoint.
  const pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
  return Quaternion.RotationYawPitchRoll(f.heading, pitch, 0);
 }

 private step(dt: number) {
  this.flow.update(dt, this.player());
  this.flow.actors.forEach((a, i) => {
   const p = a.follower.position, node = this.nodes[i], body = this.bodies[i];
   const position = new Vector3(p.x, p.y, p.z), rotation = this.rotation(i);
   this.shapes[i].filterCollideMask = a.active ? CollisionGroup.VEHICLE | CollisionGroup.CHARACTER : 0;
   if (Vector3.DistanceSquared(node.position, position) > 50 * 50) {
    node.position.copyFrom(position);
    node.rotationQuaternion!.copyFrom(rotation);
    node.computeWorldMatrix(true);
    body.setLinearVelocity(Vector3.Zero());
    body.setAngularVelocity(Vector3.Zero());
    body.setPrestepType(PhysicsPrestepType.TELEPORT);
   } else {
    body.setPrestepType(PhysicsPrestepType.DISABLED);
    // Supply a new target on EVERY substep, including stopped traffic. Otherwise
    // the previous target's linear/angular velocity carries on between frames.
    body.setTargetTransform(position, rotation);
   }
   this.spins[i] = (this.spins[i] + a.follower.speed * dt / .3) % (2 * Math.PI);
   for (const wheel of this.wheels[i]) wheel.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, this.spins[i], 0);
  });
 }

 update() {
  const player = this.player();
  this.flow.actors.forEach((a, i) => this.nodes[i].setEnabled(a.active &&
   Math.hypot(a.follower.position.x - player.x, a.follower.position.z - player.z) < 650));
  this.lights.update();
 }

 dispose() {
  this.release();
  this.lights.dispose();
  this.bodies.forEach(b => b.dispose());
  this.shapes.forEach(s => s.dispose());
  this.nodes.forEach(n => n.dispose());
  this.paints.forEach(p => p.dispose());
 }
}
