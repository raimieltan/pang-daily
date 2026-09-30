import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CollisionGroup, type PhysicsWorld } from '../physics/PhysicsWorld';
import { SuspensionSolver } from '@/game-core/suspension/solver';
import { createSuspension, type SavedSuspension } from '@/game-core/suspension/schema';
import type { VehicleBody } from './VehicleBody';
import type { ArcadeHandlingModel } from './handling/ArcadeHandlingModel';
import { suspensionBaseline } from './suspensionConfig';
const G = 9.81;
const WORLD_UP = Vector3.Up();
/** Havok owns the chassis; the corner solver owns relative unsprung travel. */
export class SuspensionRuntime {
  readonly solver: SuspensionSolver;
  private readonly points = Array.from({ length: 4 }, () => new Vector3());
  private readonly normals = Array.from({ length: 4 }, () => Vector3.Up());
  private readonly query = { membership: CollisionGroup.VEHICLE, collideWith: CollisionGroup.STATIC };
  private readonly previousVelocities = [0, 0, 0, 0];
  constructor(private readonly world: PhysicsWorld, readonly vehicle: VehicleBody, readonly model: ArcadeHandlingModel) {
    const b = suspensionBaseline(model.config); b.radius = vehicle.collisionConfig.wheels.radius;
    this.solver = new SuspensionSolver(b, createSuspension(b));
    vehicle.enableSuspension(b.cgHeight); this.updateMass();
  }
  /** Wheels move with the chassis in plan, so Havok carries the whole car's mass; each corner's
   * unsprung weight then rests on its own tire, not on the springs (see applyTireForces). */
  updateMass(): void {
    this.solver.baseline.mass = this.model.config.chassis.massKg;
    this.vehicle.setMass(this.model.config.chassis.massKg);
  }
  setSaved(saved: SavedSuspension): void { this.solver.saved = structuredClone(saved); this.updateMass(); }
  reset() { this.solver.reset(); this.previousVelocities.fill(0); }
  step(dt: number, linear: Vector3, angular: Vector3) {
    const { vehicle: v, solver: s } = this, { up } = v;
    const mounts: number[] = [], velocities: number[] = [], roads: (number | null)[] = [];
    const zOffset = v.collisionConfig.wheels.frontZ - s.baseline.wheelbase * (1 - s.baseline.frontWeight);
    for (let i = 0; i < 4; i++) {
      const c = s.corners[i], setting = s.saved.setup.corners[i];
      const x = c.wheelPosition.x || v.wheels[i].local.x, z = (c.wheelPosition.z || (i < 2 ? s.baseline.wheelbase * (1 - s.baseline.frontWeight) : -s.baseline.wheelbase * s.baseline.frontWeight)) + zOffset;
      const mount = v.toWorld(new Vector3(x, 0, z), new Vector3());
      mounts.push(Vector3.Dot(mount, up));
      const lever = v.toWorld(new Vector3(x, 0, z), new Vector3()).subtract(v.toWorld(new Vector3(0, s.baseline.cgHeight, v.collisionConfig.centerOfMass.z), new Vector3()));
      velocities.push(Vector3.Dot(linear.add(Vector3.Cross(angular, lever)), up));
      const from = mount.add(up.scale(s.radii[i] + setting.compressionTravel + .1));
      const to = mount.subtract(up.scale(setting.droopTravel + Math.max(0, setting.rideHeight) + .2));
      const hit = this.world.raycast(from, to, this.query);
      if (hit && Vector3.Dot(hit.hitNormalWorld, up) > .2) {
        roads.push(Vector3.Dot(hit.hitPointWorld, up)); this.points[i].copyFrom(hit.hitPointWorld); this.normals[i].copyFrom(hit.hitNormalWorld);
      } else { roads.push(null); this.points[i].copyFrom(mount); this.normals[i].copyFrom(up); }
    }
    s.step(dt, { mounts, velocities, roads, steering: this.model.state.steerAngle, damage: true,
      accelerations: velocities.map((value, i) => Math.max(-100, Math.min(100, (value - this.previousVelocities[i]) / dt))),
      disabled: this.model.tires.map(t => !t.installed || t.raised) });
    velocities.forEach((value, i) => { this.previousVelocities[i] = value; });
    // Actual contact replaces the long ray's candidate contact.
    s.corners.forEach((c, i) => {
      c.roadCamber = c.camber - (i % 2 ? 1 : -1) * Math.atan2(Vector3.Dot(this.normals[i], v.right), Vector3.Dot(this.normals[i], v.up));
      v.wheels[i].grounded = c.isGrounded; v.wheels[i].gap = c.isGrounded ? 0 : c.travelRemainingDroop;
      v.contact.wheels[i] = c.isGrounded;

    });
    v.contact.front = (Number(s.corners[0].isGrounded) + Number(s.corners[1].isGrounded)) / 2;
    v.contact.rear = (Number(s.corners[2].isGrounded) + Number(s.corners[3].isGrounded)) / 2;
    v.contact.suspension = s.corners;
  }
  applyTireForces() {
    const { vehicle: v, solver: s } = this;
    const zOffset = v.collisionConfig.wheels.frontZ - s.baseline.wheelbase * (1 - s.baseline.frontWeight);
    s.corners.forEach((c, i) => {
      const mount = v.toWorld(new Vector3(c.wheelPosition.x, s.baseline.cgHeight, c.wheelPosition.z + zOffset), new Vector3());
      const unsprungWeight = c.isGrounded ? s.saved.setup.corners[i].unsprungMass * G : 0;
      v.body.applyForce(v.up.scale(c.suspensionForce).addInPlace(WORLD_UP.scale(unsprungWeight)), mount);
    });
    this.model.mechanics.appliedForces.forEach((f, i) => {
      if (!s.corners[i].isGrounded) return;
      const normal = this.normals[i];
      const forward = v.forward.subtract(normal.scale(Vector3.Dot(v.forward, normal))).normalize();
      const right = Vector3.Cross(normal, forward).normalize();
      v.body.applyForce(forward.scale(f.forward).add(right.scale(f.right)), this.points[i]);
    });
    const linear = v.body.getLinearVelocity(), speed = linear.length();
    v.body.applyForce(linear.scale(-this.model.config.drive.aeroDrag * this.model.config.chassis.massKg * speed), v.toWorld(new Vector3(0, s.baseline.cgHeight, v.collisionConfig.centerOfMass.z), new Vector3()));
  }
}
