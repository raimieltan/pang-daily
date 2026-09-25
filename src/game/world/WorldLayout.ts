import type { ZoneInteraction } from "../interaction/Interaction";
import type { LightProfileId } from "../rendering/LightingConfig";
import type { PropId } from "./props/propKit";
import type { Vec3Tuple } from "./props/PropDefinition";

/**
 * Renderer-agnostic level data. A layout is a set of chunks (TECH_ARCHITECTURE §12–13): each
 * chunk owns everything inside its rectangle and is built, and later streamed, on its own.
 * Nothing here imports Babylon, so layouts can be validated in plain unit tests.
 *
 * World space: metres, +x east, +z north, +y up. The drivable ground's top is y = 0.
 */

export type Vec2 = readonly [x: number, z: number];

/** Axis-aligned rectangle on the ground plane. */
export type Rect = { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number };

/** Where to put a car. Heading 0 faces +z (north), 90 faces +x (east). */
export type Pose = { readonly x: number; readonly z: number; readonly headingDeg: number };

export type RoadKind = "main" | "connector" | "street" | "driveway";

/** A road centreline point. `width` is the full paved width there. */
export type RoadPoint = { readonly x: number; readonly z: number; readonly width: number };

export type RoadData = {
  readonly id: string;
  readonly kind: RoadKind;
  /** Centreline, corners already rounded (see `filletPolyline`). */
  readonly points: readonly RoadPoint[];
  readonly markings: "centre_dashed" | "centre_and_edges" | "none";
};

export type SurfaceKind = "asphalt" | "concrete" | "tile" | "dirt" | "grass" | "gravel";

/** Flat ground pad: parking lots, forecourts, sidewalks, yards. Visual only; the ground collides. */
export type SurfaceData = {
  readonly kind: SurfaceKind;
  readonly center: Vec2;
  readonly size: Vec2;
  readonly rotDeg?: number;
};

/** One primitive of a unique structure (building wall, roof, canopy). */
export type BlockData = {
  readonly center: Vec3Tuple;
  readonly size: Vec3Tuple;
  readonly rotDeg?: number;
  /** sRGB hex. */
  readonly color: string;
  /** Emissive (shopfront glass, lit interiors). Glow blocks never collide. */
  readonly glow?: boolean;
  readonly collide?: boolean;
};

export type PropPlacement = {
  readonly prop: PropId;
  readonly at: Vec2;
  /** Height of the prop's origin; 0 on the ground. */
  readonly y?: number;
  readonly rotDeg?: number;
  readonly scale?: number;
  /** sRGB hex applied to the prop's `tint` and `glow` layers. */
  readonly tint?: string;
};

/** A light source candidate. Only the nearest few get a real light (see LightPool). */
export type LampData = {
  readonly id: string;
  readonly at: Vec3Tuple;
  readonly profile: LightProfileId;
  /** Multiplies the profile's intensity and pool strength. */
  readonly strength?: number;
};

/** Overhead wire span between two attachment points; sags by `sag` metres at mid-span. */
export type WireSpan = { readonly from: Vec3Tuple; readonly to: Vec3Tuple; readonly sag: number };

/**
 * - `walk`: pedestrian-safe ground (terraces, shop fronts). Kept clear of parking and fenced
 *   with bollards/planters where it meets a lot.
 * - `interact`: prompt area (counter, talyer bay, pump).
 * Any zone with an `interaction` offers it to the player on foot while they stand inside it.
 * - `parking`: where cars are expected to stop.
 */
export type ZoneKind = "walk" | "interact" | "parking";

export type ZoneData = {
  readonly id: string;
  readonly kind: ZoneKind;
  readonly rect: Rect;
  readonly locationId?: LocationId;
  readonly interaction?: ZoneInteraction;
};

export type ChunkData = {
  readonly id: string;
  /** Everything the chunk owns lies inside this. Chunks tile the layout without overlapping. */
  readonly rect: Rect;
  readonly roads: readonly RoadData[];
  readonly surfaces: readonly SurfaceData[];
  readonly blocks: readonly BlockData[];
  readonly props: readonly PropPlacement[];
  readonly lamps: readonly LampData[];
  readonly wires: readonly WireSpan[];
  readonly zones: readonly ZoneData[];
};

export type LocationId = "home" | "coffee_shop" | "talyer" | "gas_station" | "convenience_store" | "main_road";

export type LocationData = {
  readonly id: LocationId;
  readonly name: string;
  readonly chunk: string;
  /** Entering this rectangle counts as arriving (fires `locationEntered`). */
  readonly area: Rect;
  /** Where the car starts when spawning here (parked, facing out where it can). */
  readonly spawn: Pose;
  /** Where the car is put back after leaving the map or getting stuck nearby: on the road, facing traffic flow. */
  readonly returnPoint: Pose;
};

export type WorldLayout = {
  readonly id: string;
  readonly bounds: Rect;
  readonly chunks: readonly ChunkData[];
  readonly locations: readonly LocationData[];
  /**
   * Closed centreline of the main drivable loop, in driving order. Used to validate layouts
   * and by the autopilot test; not rendered.
   */
  readonly loop: readonly Vec2[];
};
