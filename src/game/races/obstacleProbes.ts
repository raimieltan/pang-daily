import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CollisionGroup, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { VehicleBody } from '../vehicles/VehicleBody';
import type { ObstacleFeedback, ObstacleHit } from './AIDriver';

/** Static-world only: cars, traffic and people are the driver's job, not the probes'. */
const QUERY = { membership: CollisionGroup.VEHICLE, collideWith: CollisionGroup.STATIC };
/** Hits facing mostly up are the road or a kerb top, not something to steer around. */
const GROUND_NORMAL_Y = .6;

/**
 * Forward, forward-left and forward-right probes for an AI car. Each probe is a small bundle of
 * parallel rays at bumper height, a cheap stand-in for a filtered shape cast.
 */
export class ObstacleProbes {
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly dir = new Vector3();
  private readonly side = new Vector3();
  private age = Infinity;
  private last: ObstacleFeedback = { forward: null, left: null, right: null, range: 0 };
  /** World segments of the last probe run, for debug drawing. */
  readonly rays: { from: Vector3; to: Vector3; hit: boolean }[] = [];

  constructor(private readonly world: PhysicsWorld, private readonly body: VehicleBody,
    private readonly halfWidth: number, private readonly interval = 1 / 20) {}

  /** Refreshes at `interval`, otherwise returns the last result. */
  sample(dt: number, speed: number): ObstacleFeedback {
    this.age += dt;
    if (this.age < this.interval) return this.last;
    this.age = 0;
    const range = Math.max(12, Math.min(45, 8 + Math.abs(speed) * 1.2));
    this.rays.length = 0;
    this.last = {
      forward: this.probe(0, range),
      left: this.probe(-.45, range * .8),
      right: this.probe(.45, range * .8),
      range,
    };
    return this.last;
  }

  private probe(angle: number, range: number): ObstacleHit | null {
    const { forward, right, position } = this.body;
    this.dir.copyFrom(forward).scaleInPlace(Math.cos(angle)).addInPlace(right.scale(Math.sin(angle)));
    this.dir.y = 0;
    this.dir.normalize();
    this.side.set(this.dir.z, 0, -this.dir.x);
    let best: ObstacleHit | null = null;
    for (const lateral of [-this.halfWidth * .8, 0, this.halfWidth * .8]) {
      this.from.copyFrom(position).addInPlace(this.side.scale(lateral)).addInPlace(this.dir.scale(1.8));
      this.from.y += .45;
      this.to.copyFrom(this.from).addInPlace(this.dir.scale(range));
      const hit = this.world.raycast(this.from, this.to, QUERY);
      const solid = hit && Math.abs(hit.hitNormalWorld.y) < GROUND_NORMAL_Y;
      this.rays.push({ from: this.from.clone(), to: solid ? hit.hitPointWorld.clone() : this.to.clone(), hit: !!solid });
      if (!solid || (best && best.distance <= hit.hitDistance)) continue;
      best = { distance: hit.hitDistance, normal: { x: hit.hitNormalWorld.x, z: hit.hitNormalWorld.z } };
    }
    return best;
  }
}
