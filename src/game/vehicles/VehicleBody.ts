import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { type PhysicsShape, PhysicsShapeBox, PhysicsShapeContainer, PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape";
import { CollisionGroup, type PhysicsWorld } from "../physics/PhysicsWorld";
import type { AxleContact } from "./handling/ArcadeHandlingModel";
import type { VehicleCollisionConfig } from "./VehicleDefinition";

export type WheelId = "fl" | "fr" | "rl" | "rr";

export type WheelContact = {
  readonly id: WheelId;
  readonly front: boolean;
  /** Wheel centre in car space. */
  readonly local: Vector3;
  grounded: boolean;
  /** Ground distance below the wheel's contact point (0 = touching, up to `suspensionTravel`). */
  gap: number;
};

/** Where to put the car. `y` is only a hint: spawn raycasts down to the road from above it. */
export type VehiclePose = { position: Vector3; headingRad: number };

/** Spawn probes start this far above the requested point, so a pose slightly under the road still finds it. */
const SPAWN_PROBE_HEIGHT = 5;
const SPAWN_PROBE_DEPTH = 50;
/** Gap left under the wheels on spawn: small enough that the drop is invisible, big enough to never start overlapping. */
const SPAWN_CLEARANCE = 0.03;

const ZERO = Vector3.Zero();
const ALL_BITS = 0xffffffff;

/**
 * The car's rigid body: a box for the cabin/bodywork plus one frictionless sphere per wheel,
 * built from `VehicleCollisionConfig` (never from the visual mesh). Havok owns collisions,
 * gravity and pitch/roll; the handling controller owns planar velocity and yaw, so the
 * shapes carry no friction of their own.
 *
 * Also owns the per-wheel ground probes and safe spawn/reset. Everything here is engine-side
 * state; the handling model only sees `contact` and the body-frame velocities.
 */
export class VehicleBody {
  readonly node: TransformNode;
  readonly body: PhysicsBody;
  readonly wheels: readonly WheelContact[];
  /** Share of each axle's wheels on the ground, refreshed by `updateContacts`. */
  readonly contact: AxleContact = { front: 0, rear: 0 };
  /** Car axes in world space, refreshed by `updateAxes`. */
  readonly forward = new Vector3(0, 0, 1);
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);

  private readonly shape: PhysicsShapeContainer;
  private readonly probeQuery = { membership: CollisionGroup.VEHICLE, collideWith: CollisionGroup.STATIC };
  private teleporting = false;
  private readonly releaseAfterStep: () => void;
  private readonly tmpFrom = new Vector3();
  private readonly tmpTo = new Vector3();

  constructor(
    private readonly world: PhysicsWorld,
    private readonly config: VehicleCollisionConfig,
    massKg: number,
    name = "vehicle",
  ) {
    const { scene } = world;
    const { body: box, wheels } = config;
    this.node = new TransformNode(name, scene);
    this.node.rotationQuaternion = Quaternion.Identity();

    this.shape = new PhysicsShapeContainer(scene);
    const boxShape = new PhysicsShapeBox(
      Vector3.Zero(),
      Quaternion.Identity(),
      new Vector3(box.width, box.height, box.length),
      scene,
    );
    this.shape.addChild(configureShape(boxShape), new Vector3(0, box.bottomY + box.height / 2, box.centerZ));

    const wheelDefs: [WheelId, number, number][] = [
      ["fl", -wheels.halfTrack, wheels.frontZ],
      ["fr", wheels.halfTrack, wheels.frontZ],
      ["rl", -wheels.halfTrack, wheels.rearZ],
      ["rr", wheels.halfTrack, wheels.rearZ],
    ];
    this.wheels = wheelDefs.map(([id, x, z]) => {
      const local = new Vector3(x, wheels.radius, z);
      this.shape.addChild(configureShape(new PhysicsShapeSphere(Vector3.Zero(), wheels.radius, scene)), local);
      return { id, front: z === wheels.frontZ, local, grounded: false, gap: Infinity };
    });

    configureShape(this.shape);

    this.body = new PhysicsBody(this.node, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shape;
    this.setMass(massKg);
    this.body.setLinearDamping(0);
    this.body.setAngularDamping(config.angularDamping);

    this.releaseAfterStep = world.onAfterStep(() => {
      // A teleport is applied by exactly one pre-step; after that Havok owns the transform again.
      if (this.teleporting) {
        this.teleporting = false;
        this.body.disablePreStep = true;
      }
    });
  }

  /**
   * Solid-box inertia for the collision box. Pitch/roll get extra inertia so bumps and
   * wall hits read as a heavy car rocking, not a toy flipping. Havok wants it per unit mass.
   */
  setMass(massKg: number): void {
    const { body: box, centerOfMass, tipInertiaScale } = this.config;
    const w2 = box.width ** 2;
    const h2 = box.height ** 2;
    const l2 = box.length ** 2;
    this.body.setMassProperties({
      mass: massKg,
      centerOfMass: new Vector3(0, centerOfMass.y, centerOfMass.z),
      inertia: new Vector3(((h2 + l2) / 12) * tipInertiaScale, (w2 + l2) / 12, ((w2 + h2) / 12) * tipInertiaScale),
    });
  }

  get position(): Vector3 {
    return this.node.position;
  }

  /** Refresh the world-space car axes from the body's current orientation. */
  updateAxes(): void {
    const q = this.node.rotationQuaternion!;
    Vector3.Forward().rotateByQuaternionToRef(q, this.forward);
    Vector3.Right().rotateByQuaternionToRef(q, this.right);
    Vector3.Up().rotateByQuaternionToRef(q, this.up);
  }

  /**
   * Casts one ray per wheel along the car's down axis, from the wheel centre to
   * `suspensionTravel` below its contact point. Call after `updateAxes`.
   */
  updateContacts(): void {
    const { radius } = this.config.wheels;
    const reach = radius + this.config.suspensionTravel;
    let front = 0;
    let rear = 0;
    for (const wheel of this.wheels) {
      this.toWorld(wheel.local, this.tmpFrom);
      this.up.scaleToRef(-reach, this.tmpTo).addInPlace(this.tmpFrom);
      const hit = this.world.raycast(this.tmpFrom, this.tmpTo, this.probeQuery);
      wheel.grounded = hit !== null;
      wheel.gap = hit ? Math.max(0, hit.hitDistance - radius) : Infinity;
      if (wheel.grounded) {
        if (wheel.front) front++;
        else rear++;
      }
    }
    this.contact.front = front / 2;
    this.contact.rear = rear / 2;
  }

  get groundedWheels(): number {
    return (this.contact.front + this.contact.rear) * 2;
  }

  /**
   * Teleports the car onto the road under `pose`, level with the ground normal, at rest.
   * Returns false (and leaves the car alone) if there is no road under the point.
   * The car is placed a few centimetres above the road and settles on the next steps,
   * so it can never start inside the road and get launched or pushed through it.
   */
  place(pose: VehiclePose): boolean {
    const from = new Vector3(pose.position.x, pose.position.y + SPAWN_PROBE_HEIGHT, pose.position.z);
    const to = from.add(new Vector3(0, -(SPAWN_PROBE_HEIGHT + SPAWN_PROBE_DEPTH), 0));
    const hit = this.world.raycast(from, to, this.probeQuery);
    if (!hit) return false;
    const ground = hit.hitPointWorld.clone();
    const normal = hit.hitNormalWorld.clone().normalize();

    // Heading about world up, then tilt so the car's up matches the road normal.
    const heading = Quaternion.RotationAxis(Vector3.Up(), pose.headingRad);
    const tilt = rotationBetween(Vector3.Up(), normal);
    const orientation = tilt.multiply(heading);

    const q = this.node.rotationQuaternion!;
    q.copyFrom(orientation);
    this.node.position.copyFrom(ground.addInPlace(normal.scale(SPAWN_CLEARANCE)));
    this.node.computeWorldMatrix(true);

    this.body.setLinearVelocity(ZERO);
    this.body.setAngularVelocity(ZERO);
    this.body.disablePreStep = false;
    this.teleporting = true;
    this.updateAxes();
    return true;
  }

  /** Car-space point → world space, using the current transform. */
  toWorld(local: Vector3, result: Vector3): Vector3 {
    local.rotateByQuaternionToRef(this.node.rotationQuaternion!, result);
    return result.addInPlace(this.node.position);
  }

  dispose(): void {
    this.releaseAfterStep();
    this.body.dispose();
    this.shape.dispose();
    this.node.dispose();
  }
}

/** Havok reads material and filters per child shape, so every child needs them, not just the container. */
function configureShape<T extends PhysicsShape>(shape: T): T {
  shape.material = { friction: 0, staticFriction: 0, restitution: 0 };
  shape.filterMembershipMask = CollisionGroup.VEHICLE;
  shape.filterCollideMask = ALL_BITS;
  return shape;
}

function rotationBetween(from: Vector3, to: Vector3): Quaternion {
  const axis = Vector3.Cross(from, to);
  const sin = axis.length();
  if (sin < 1e-6) return Quaternion.Identity();
  return Quaternion.RotationAxis(axis.scaleInPlace(1 / sin), Math.atan2(sin, Vector3.Dot(from, to)));
}
