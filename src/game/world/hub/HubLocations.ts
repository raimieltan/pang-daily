import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { RuntimePort } from "../../bridge";
import type { GameSystem } from "../../engine/types";
import type { VehiclePose } from "../../vehicles/VehicleBody";
import { containsPoint } from "../layoutTools";
import type { LocationData, Pose, WorldLayout } from "../WorldLayout";

const DEG = Math.PI / 180;
/** Below this the player has fallen out of the world. */
const FALL_LIMIT_Y = -5;
/** Leeway past the layout bounds before the player counts as off the map. */
const BOUNDS_MARGIN_M = 2;

/** What HubLocations needs from the player (car or on foot): where they are, and a way to put them somewhere. */
export type Locatable = {
  readonly position: Vector3;
  placeAt(pose: VehiclePose): boolean;
};

export function toVehiclePose(pose: Pose): VehiclePose {
  return { position: new Vector3(pose.x, pose.y ?? 0, pose.z), headingRad: pose.headingDeg * DEG };
}

/**
 * Tracks which hub location the player is in (`locationEntered` / `locationExited`, on change only)
 * and puts the player (in the car or on foot) back at the nearest return point when they leave the map or
 * fall through it (`playerReturned`).
 */
export class HubLocations implements GameSystem {
  readonly name = "hubLocations";
  private current: LocationData | null = null;

  constructor(
    private readonly layout: WorldLayout,
    private readonly player: Locatable,
    private readonly bridge: RuntimePort,
  ) {}

  get location(): LocationData | null {
    return this.current;
  }

  update(): void {
    const { x, y, z } = this.player.position;
    if (y < FALL_LIMIT_Y || !containsPoint(this.layout.bounds, x, z, BOUNDS_MARGIN_M)) {
      const back = this.nearest(x, z);
      if (this.player.placeAt(toVehiclePose(back.returnPoint))) {
        this.bridge.emit("playerReturned", { locationId: back.id, name: back.name });
      }
      return;
    }
    const inside = this.layout.locations.find((l) => containsPoint(l.area, x, z)) ?? null;
    if (inside === this.current) return;
    if (this.current) this.bridge.emit("locationExited", { locationId: this.current.id, name: this.current.name });
    this.current = inside;
    if (inside) this.bridge.emit("locationEntered", { locationId: inside.id, name: inside.name });
  }

  /** The location whose return point is closest to (x, z). */
  nearest(x: number, z: number): LocationData {
    let best = this.layout.locations[0];
    let bestD = Infinity;
    for (const l of this.layout.locations) {
      const d = Math.hypot(l.returnPoint.x - x, l.returnPoint.z - z);
      if (d < bestD) [best, bestD] = [l, d];
    }
    return best;
  }
}
