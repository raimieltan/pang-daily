import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CollisionGroup, type PhysicsWorld } from "../physics/PhysicsWorld";
import type { VehicleBody, VehiclePose } from "../vehicles/VehicleBody";
import type { VehicleCollisionConfig } from "../vehicles/VehicleDefinition";

const STATIC = { collideWith: CollisionGroup.STATIC };
/** Gap between the car's side and the character's capsule. */
const DOOR_GAP = 0.25;
/** Car-space z of the front seats, relative to the body centre. */
const SEAT_Z = 0.2;
/** Heights the path from the cabin to the spot is checked at: knees and chest. */
const CHECK_HEIGHTS = [0.45, 1.3];
/** Ground under the spot must be within this of the car's, so you never step off a ledge. */
const MAX_GROUND_STEP = 0.5;

/**
 * Where to stand the player after getting out: the driver's door (left, the Philippines
 * drives on the right), then the passenger door.
 * A spot counts when nothing static sits between the cabin and it (plus the capsule's
 * radius) and there is ground under it at about the car's level. Null means boxed in.
 */
export function findExitSpot(
  world: PhysicsWorld,
  body: VehicleBody,
  collision: VehicleCollisionConfig,
  characterRadius: number,
  characterHeight = 1.7,
): VehiclePose | null {
  const { width, centerZ } = collision.body;
  const side = width / 2 + characterRadius + DOOR_GAP;
  const candidates: [x: number, z: number][] = [
    [-side, centerZ + SEAT_Z],
    [side, centerZ + SEAT_Z],
  ];
  const headingRad = Math.atan2(body.forward.x, body.forward.z);
  const cabin = new Vector3();
  const spot = new Vector3();
  const reach = new Vector3();

  for (const [x, z] of candidates) {
    body.toWorld(new Vector3(x, 0, z), spot);
    body.toWorld(new Vector3(0, 0, centerZ), cabin);
    const out = spot.subtract(cabin);
    out.y = 0;
    if (out.lengthSquared() < 1e-6) continue;
    out.normalize().scaleInPlace(characterRadius);

    const blocked = CHECK_HEIGHTS.some((h) => {
      const from = new Vector3(cabin.x, body.position.y + h, cabin.z);
      reach.set(spot.x + out.x, body.position.y + h, spot.z + out.z);
      return world.raycast(from, reach, STATIC) !== null;
    });
    if (blocked) continue;

    const ground = world.raycast(
      new Vector3(spot.x, body.position.y + 2, spot.z),
      new Vector3(spot.x, body.position.y - 3, spot.z),
      STATIC,
    );
    if (!ground || Math.abs(ground.hitPointWorld.y - body.position.y) > MAX_GROUND_STEP) continue;
    const groundY = ground.hitPointWorld.y;
    // Check the volume around the feet through the head, not just a line to the door.
    // Multiple vertical and radial probes catch posts, walls and low overhangs.
    let occupied = false;
    for (let i = 0; i < 8 && !occupied; i++) {
      const dx = Math.cos(i * Math.PI / 4) * characterRadius;
      const dz = Math.sin(i * Math.PI / 4) * characterRadius;
      occupied = !!world.raycast(
        new Vector3(spot.x + dx, groundY + 0.1, spot.z + dz),
        new Vector3(spot.x + dx, groundY + characterHeight + 0.05, spot.z + dz), STATIC,
      );
      for (const h of [characterRadius, characterHeight / 2, characterHeight - characterRadius]) {
        occupied ||= !!world.raycast(new Vector3(spot.x, groundY + h, spot.z),
          new Vector3(spot.x + dx, groundY + h, spot.z + dz), STATIC);
      }
    }
    if (occupied) continue;
    return { position: new Vector3(spot.x, groundY, spot.z), headingRad };
  }
  return null;
}
