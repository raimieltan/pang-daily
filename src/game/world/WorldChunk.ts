import { Constants } from "@babylonjs/core/Engines/constants";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox, PhysicsShapeContainer } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import { CollisionGroup } from "../physics/PhysicsWorld";
import { LIGHT_PROFILES } from "../rendering/LightingConfig";
import { PropLibrary, type PlacedCollider } from "./props/PropLibrary";
import type { Vec3Tuple } from "./props/PropDefinition";
import type { ChunkData, LampData, RoadData, RoadKind, SurfaceKind, Vec2 } from "./WorldLayout";

const DEG = Math.PI / 180;
/** Thick ground so a fast car can't tunnel through it in one 1/120 s step (see debugRoad). */
const GROUND_THICKNESS = 1;
/**
 * Visual layers sit just under the collider top (y = 0), a few centimetres apart so they never
 * z-fight within fog distance, and never poke through the tyres.
 */
const LAYER_Y = { ground: -0.09, surface: -0.06, road: -0.03, marking: -0.015, pool: -0.005 } as const;
const MARK = { dash: 3, gap: 5, width: 0.15, edgeInset: 0.35 } as const;

const GROUND_COLOR = "#2c3024";
const SURFACE_COLORS: Record<SurfaceKind, string> = {
  asphalt: "#2e2e31",
  concrete: "#6b6862",
  tile: "#7d6a5e",
  dirt: "#463b2e",
  grass: "#2a3a25",
  gravel: "#57524a",
};
const ROAD_COLORS: Record<RoadKind, string> = {
  main: "#242427",
  connector: "#28282b",
  street: "#2b2a2a",
  driveway: "#55524c",
};
const MARKING_COLOR = "#cfc6a8";
const WIRE_COLOR = "#2a2a2c";

/** Shared, scene-lifetime resources every chunk renders with. */
export class WorldKit {
  /** Lit, vertex-coloured: chunk geometry and prop body/tint layers. */
  readonly lit: StandardMaterial;
  /** Unlit, vertex-coloured, fog-free: shopfront glass, lenses, sign faces. Feeds bloom. */
  readonly glow: StandardMaterial;
  /** Additive fake light pools on the ground. */
  readonly pool: StandardMaterial;
  readonly props: PropLibrary;
  private readonly poolTemplate: Mesh;

  constructor(readonly scene: Scene) {
    this.lit = new StandardMaterial("world:lit", scene);
    this.lit.diffuseColor = Color3.White();
    this.lit.specularColor = Color3.Black();

    this.glow = unlit("world:glow", scene);
    this.glow.fogEnabled = false;

    this.pool = unlit("world:pool", scene);
    this.pool.fogEnabled = false;
    this.pool.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.pool.alphaMode = Constants.ALPHA_ADD;
    this.pool.disableDepthWrite = true;

    this.props = new PropLibrary(scene, { lit: this.lit, glow: this.glow });
    this.poolTemplate = new Mesh("world:poolTemplate", scene);
    poolDiscVertexData().applyToMesh(this.poolTemplate);
    this.poolTemplate.material = this.pool;
    this.poolTemplate.isPickable = false;
    this.poolTemplate.setEnabled(false);
  }

  /** Materials that should see the scene's pooled lights (see SceneLighting). */
  get litMaterials(): StandardMaterial[] {
    return [this.lit];
  }

  /** Light pools for `lamps` as thin instances of one additive disc. */
  placePools(lamps: readonly LampData[], parent: TransformNode, name: string): Mesh | null {
    if (lamps.length === 0) return null;
    const matrices = new Float32Array(lamps.length * 16);
    const colors = new Float32Array(lamps.length * 4);
    lamps.forEach((lamp, i) => {
      const profile = LIGHT_PROFILES[lamp.profile];
      const r = profile.poolRadius;
      Matrix.Compose(new Vector3(r, 1, r), Quaternion.Identity(), new Vector3(lamp.at[0], LAYER_Y.pool, lamp.at[2])).copyToArray(
        matrices,
        i * 16,
      );
      const c = Color3.FromHexString(profile.color).scale(profile.poolStrength * (lamp.strength ?? 1));
      colors.set([c.r, c.g, c.b, 1], i * 4);
    });
    const mesh = this.poolTemplate.clone(`${name}:pools`, parent, true);
    mesh.makeGeometryUnique();
    mesh.setEnabled(true);
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
    mesh.thinInstanceSetBuffer("color", colors, 4, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.freezeWorldMatrix();
    return mesh;
  }

  dispose(): void {
    this.props.dispose();
    this.poolTemplate.dispose();
    this.lit.dispose();
    this.glow.dispose();
    this.pool.dispose();
  }
}

/** One built chunk. Everything it created hangs off `root` and goes with `dispose`. */
export type WorldChunk = {
  readonly id: string;
  readonly root: TransformNode;
  /** Lamp meshes whose visibility the quality settings toggle. */
  readonly pools: Mesh | null;
  readonly colliderCount: number;
  dispose(): void;
};

/**
 * Builds a chunk: static geometry merged into one lit and one glow mesh, props as thin
 * instances, wires as one line system, light pools, and one static physics body whose
 * container holds the ground slab and every block/prop collider. Pass `physics: false` for
 * render-only builds.
 */
export function buildChunk(scene: Scene, chunk: ChunkData, kit: WorldKit, { physics = true, ground = true } = {}): WorldChunk {
  const root = new TransformNode(`chunk:${chunk.id}`, scene);
  const lit = new GeometryBatch();
  const glow = new GeometryBatch();

  const { rect } = chunk;
  // Top layer first: the stacked ground layers are opaque, so drawn in this order the depth
  // test rejects hidden road/lot/ground pixels before they are lit, instead of lighting most of
  // the screen up to four times over.
  for (const road of chunk.roads) markings(lit, road);
  for (const road of chunk.roads) {
    lit.strip(road.points.map((p) => [p.x, p.z]), road.points.map((p) => p.width), LAYER_Y.road, ROAD_COLORS[road.kind]);
  }
  for (const s of chunk.surfaces) lit.quad(boxCorners(s.center, s.size, s.rotDeg ?? 0), LAYER_Y.surface, SURFACE_COLORS[s.kind]);
  if (ground) lit.quad(rectCorners(rect), LAYER_Y.ground, GROUND_COLOR);
  const colliders: PlacedCollider[] = [];
  for (const b of chunk.blocks) {
    (b.glow ? glow : lit).box(b.center, b.size, b.rotDeg ?? 0, b.color, b.pitchDeg ?? 0);
    if (b.collide && !b.glow) {
      colliders.push({ center: new Vector3(...b.center), size: b.size, rotation: Quaternion.RotationYawPitchRoll((b.rotDeg ?? 0)*DEG, (b.pitchDeg ?? 0)*DEG, 0) });
    }
  }

  lit.build(`chunk:${chunk.id}:lit`, kit.lit, root);
  glow.build(`chunk:${chunk.id}:glow`, kit.glow, root);
  colliders.push(...kit.props.place(chunk.props, root, `chunk:${chunk.id}`).colliders);
  const pools = kit.placePools(chunk.lamps, root, `chunk:${chunk.id}`);
  wires(scene, chunk, root);

  let body: PhysicsBody | null = null;
  let shapes: PhysicsShapeContainer | null = null;
  if (physics) [body, shapes] = staticBody(scene, chunk, root, colliders, ground);

  return {
    id: chunk.id,
    root,
    pools,
    colliderCount: colliders.length,
    dispose() {
      body?.dispose();
      shapes?.dispose();
      root.dispose(false, false);
    },
  };
}

/** Accumulates flat-shaded, vertex-coloured triangles and boxes, then emits one mesh. */
export class GeometryBatch {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly parts: VertexData[] = [];

  /** Upward-facing polygon (convex, in order), at height `y`. */
  quad(corners: readonly Vec2[], y: number, color: string): void {
    const base = this.vertices(corners.map(([x, z]) => [x, y, z]), color);
    for (let i = 1; i < corners.length - 1; i++) this.triangle(base, base + i, base + i + 1);
  }

  /** Ribbon along a centreline with per-point width (roads, markings). */
  strip(points: readonly Vec2[], widths: readonly number[], y: number, color: string, offset = 0): void {
    if (points.length < 2) return;
    const left: [number, number, number][] = [];
    const right: [number, number, number][] = [];
    points.forEach(([x, z], i) => {
      const [ax, az] = points[Math.max(0, i - 1)];
      const [bx, bz] = points[Math.min(points.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      // Right-hand normal of the travel direction (+x east, +z north, left-handed).
      const [nx, nz] = [(bz - az) / len, -(bx - ax) / len];
      const h = widths[i] / 2;
      left.push([x + nx * (offset - h), y, z + nz * (offset - h)]);
      right.push([x + nx * (offset + h), y, z + nz * (offset + h)]);
    });
    const l = this.vertices(left, color);
    const r = this.vertices(right, color);
    for (let i = 0; i < points.length - 1; i++) {
      this.triangle(l + i, r + i, r + i + 1);
      this.triangle(l + i, r + i + 1, l + i + 1);
    }
  }

  box(center: Vec3Tuple, size: Vec3Tuple, rotDeg: number, color: string, pitchDeg = 0): void {
    const data = CreateBoxVertexData({ width: size[0], height: size[1], depth: size[2] });
    data.transform(Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(rotDeg*DEG, pitchDeg*DEG, 0), new Vector3(...center)));
    const c = Color3.FromHexString(color);
    const count = data.positions!.length / 3;
    data.colors = new Float32Array(count * 4).map((_, i) => [c.r, c.g, c.b, 1][i % 4]);
    // Vertex colour only: merging needs the same attributes as the flat geometry.
    data.uvs = null;
    this.parts.push(data);
  }

  build(name: string, material: Material, parent: TransformNode): Mesh | null {
    const all = [...this.parts];
    if (this.positions.length) {
      const flat = new VertexData();
      flat.positions = this.positions;
      flat.colors = this.colors;
      flat.indices = this.indices;
      flat.normals = [];
      VertexData.ComputeNormals(this.positions, this.indices, flat.normals);
      // After the boxes: buildings then hide the ground behind them before it is shaded.
      all.push(flat);
    }
    if (all.length === 0) return null;
    const [first, ...rest] = all;
    const merged = rest.length ? first.merge(rest, true) : first;
    const mesh = new Mesh(name, material.getScene(), parent);
    merged.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private vertices(points: readonly (readonly [number, number, number])[], color: string): number {
    const c = Color3.FromHexString(color);
    const base = this.positions.length / 3;
    for (const [x, y, z] of points) {
      this.positions.push(x, y, z);
      this.colors.push(c.r, c.g, c.b, 1);
    }
    return base;
  }

  /** Adds a triangle wound so its front faces up (Babylon: (b−a)×(c−a) has negative y). */
  private triangle(a: number, b: number, c: number): void {
    const p = this.positions;
    const [abx, abz] = [p[b * 3] - p[a * 3], p[b * 3 + 2] - p[a * 3 + 2]];
    const [acx, acz] = [p[c * 3] - p[a * 3], p[c * 3 + 2] - p[a * 3 + 2]];
    if (abz * acx - abx * acz > 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }
}

function markings(batch: GeometryBatch, road: RoadData): void {
  if (road.markings === "none") return;
  const pts = road.points.map((p): Vec2 => [p.x, p.z]);
  // Dashes: walk the centreline, emitting a short strip for each dash.
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 0.5) {
      const phase = (along + d) % (MARK.dash + MARK.gap);
      if (phase >= MARK.dash) continue;
      const t0 = d / len;
      const t1 = Math.min(len, d + 0.5) / len;
      batch.strip(
        [
          [ax + (bx - ax) * t0, az + (bz - az) * t0],
          [ax + (bx - ax) * t1, az + (bz - az) * t1],
        ],
        [MARK.width, MARK.width],
        LAYER_Y.marking,
        MARKING_COLOR,
      );
    }
    along += len;
  }
  if (road.markings === "centre_and_edges") {
    const widths = road.points.map(() => MARK.width);
    for (const side of [-1, 1]) {
      // Offsets follow the road's local width, so the edge line tracks tapers.
      for (let i = 0; i < pts.length - 1; i++) {
        const offsetA = side * (road.points[i].width / 2 - MARK.edgeInset);
        const offsetB = side * (road.points[i + 1].width / 2 - MARK.edgeInset);
        if (Math.abs(offsetA - offsetB) < 1e-6) batch.strip([pts[i], pts[i + 1]], widths.slice(0, 2), LAYER_Y.marking, MARKING_COLOR, offsetA);
      }
    }
  }
}

/** Overhead wires with a parabolic sag, one line system per chunk. */
function wires(scene: Scene, chunk: ChunkData, parent: TransformNode): void {
  if (chunk.wires.length === 0) return;
  const lines = chunk.wires.map(({ from, to, sag }) => {
    const steps = 8;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return new Vector3(
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t - sag * 4 * t * (1 - t),
        from[2] + (to[2] - from[2]) * t,
      );
    });
  });
  const mesh = CreateLineSystem(`chunk:${chunk.id}:wires`, { lines }, scene);
  mesh.color = Color3.FromHexString(WIRE_COLOR);
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
}

function staticBody(scene: Scene, chunk: ChunkData, root: TransformNode, colliders: readonly PlacedCollider[], ground = true) {
  const { rect } = chunk;
  const container = new PhysicsShapeContainer(scene);
  const add = (center: Vector3, rotation: Quaternion, size: Vec3Tuple) => {
    const box = new PhysicsShapeBox(center, rotation, new Vector3(...size), scene);
    configureStatic(box);
    container.addChild(box);
  };
  // Ground slab: top face exactly at y = 0 across the whole chunk, so neighbours meet without steps.
  if (ground) add(
    new Vector3((rect.minX + rect.maxX) / 2, -GROUND_THICKNESS / 2, (rect.minZ + rect.maxZ) / 2),
    Quaternion.Identity(),
    [rect.maxX - rect.minX, GROUND_THICKNESS, rect.maxZ - rect.minZ],
  );
  for (const c of colliders) add(c.center, c.rotation, c.size);
  configureStatic(container);
  const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
  body.shape = container;
  return [body, container] as const;
}

/** Havok reads material and filters per child shape (see VehicleBody), so set both. */
function configureStatic<T extends PhysicsShapeBox | PhysicsShapeContainer>(shape: T): T {
  shape.material = { friction: 0.9, restitution: 0 };
  shape.filterMembershipMask = CollisionGroup.STATIC;
  return shape;
}

/** Radial falloff disc: bright centre, soft shoulder at 35 %, black rim (black adds nothing). */
function poolDiscVertexData(): VertexData {
  const segments = 24;
  const rings: [radius: number, value: number][] = [
    [0.35, 0.55],
    [0.7, 0.18],
    [1, 0],
  ];
  const positions = [0, 0, 0];
  const colors = [1, 1, 1, 1];
  for (const [radius, value] of rings) {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      colors.push(value, value, value, 1);
    }
  }
  const indices: number[] = [];
  const ring = (r: number, s: number) => 1 + r * segments + (s % segments);
  const up = (a: number, b: number, c: number) => {
    const [abx, abz] = [positions[b * 3] - positions[a * 3], positions[b * 3 + 2] - positions[a * 3 + 2]];
    const [acx, acz] = [positions[c * 3] - positions[a * 3], positions[c * 3 + 2] - positions[a * 3 + 2]];
    indices.push(...(abz * acx - abx * acz > 0 ? [a, c, b] : [a, b, c]));
  };
  for (let s = 0; s < segments; s++) {
    up(0, ring(0, s), ring(0, s + 1));
    for (let r = 0; r < rings.length - 1; r++) {
      up(ring(r, s), ring(r + 1, s), ring(r + 1, s + 1));
      up(ring(r, s), ring(r + 1, s + 1), ring(r, s + 1));
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  data.normals = [];
  VertexData.ComputeNormals(positions, indices, data.normals);
  return data;
}

function unlit(name: string, scene: Scene): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.White();
  return mat;
}

function yaw(deg: number): Quaternion {
  return Quaternion.RotationAxis(Vector3.Up(), deg * DEG);
}

function rectCorners(r: ChunkData["rect"]): Vec2[] {
  return [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
}

/** Corners of a box footprint rotated by `rotDeg` about its centre (same rotation as props). */
function boxCorners([cx, cz]: Vec2, [w, d]: Vec2, rotDeg: number): Vec2[] {
  const c = Math.cos(rotDeg * DEG);
  const s = Math.sin(rotDeg * DEG);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([lx, lz]): Vec2 => [cx + lx * c + lz * s, cz - lx * s + lz * c]);
}
