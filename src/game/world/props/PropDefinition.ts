/**
 * Environment prop contract. A prop is a handful of primitives (placeholder) or, later, a GLB
 * that replaces them 1:1. Both end up as one template mesh per layer, placed with thin
 * instances, so a whole chunk's worth of chairs is one draw call.
 *
 * Prop space: metres, +y up with y = 0 on the ground, +z is the prop's front.
 */

export type Vec3Tuple = readonly [x: number, y: number, z: number];

/**
 * Which template mesh a part is merged into:
 * - `body`: lit, keeps its own colour
 * - `tint`: lit, multiplied by the placement's `tint` (monobloc chairs, crates, motorcycles)
 * - `glow`: unlit/emissive and multiplied by `tint` (lamp lenses, sign faces). Feeds bloom.
 */
export type PropLayer = "body" | "tint" | "glow";

export type PropPart = {
  shape: "box" | "cylinder" | "sphere";
  /** Box: width/height/depth. Cylinder: diameter/height/diameter. Sphere: diameters per axis. */
  size: Vec3Tuple;
  /** Centre of the part in prop space. */
  at: Vec3Tuple;
  /** Euler degrees, applied X → Y → Z. */
  rotDeg?: Vec3Tuple;
  /** sRGB hex. */
  color: string;
  layer?: PropLayer;
  /** Cylinder/sphere segments. Keep low: these are silhouettes, not hero assets. */
  tessellation?: number;
};

/** Static box collider in prop space. Props without one are walk-through/drive-through clutter. */
export type PropCollider = { size: Vec3Tuple; at: Vec3Tuple };

export type PropCategory =
  | "utility"
  | "wall"
  | "drainage"
  | "signage"
  | "lighting"
  | "clutter"
  | "talyer"
  | "vehicle"
  | "barrier"
  | "vegetation"
  | "fuel";

export type PropDefinition = {
  category: PropCategory;
  description: string;
  parts: readonly PropPart[];
  collider?: PropCollider;
  /**
   * Future final asset. When set and loaded, its meshes replace `parts` (same prop space);
   * placements and colliders stay as they are.
   */
  glb?: string;
};
