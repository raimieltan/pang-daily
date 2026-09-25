import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

export type CrewCarModel = "lancer" | "civic_rs" | "city";
type Vec = [number, number, number];
type Shape = { front?: number; back?: number; width?: number };

const GLASS = "#1d2830";
const BLACK = "#151618";
const TIRE = "#1b1b1c";

/** Flat-shaded box whose top face is pulled in: rake at the front/back, tumblehome at the sides. */
function slab(at: Vec, size: Vec, color: string, shape: Shape = {}, pitch = 0): VertexData {
  const data = CreateBoxVertexData({ size: 1 });
  const p = data.positions as number[];
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 1] <= 0) continue;
    p[i] *= shape.width ?? 1;
    if (p[i + 2] > 0) p[i + 2] -= (shape.front ?? 0) / size[2];
    else p[i + 2] += (shape.back ?? 0) / size[2];
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(p, data.indices!, normals);
  data.normals = normals;
  return paint(data, at, size, color, [pitch, 0, 0]);
}

function paint(data: VertexData, at: Vec, scale: Vec, color: string, rot: Vec = [0, 0, 0]): VertexData {
  data.transform(Matrix.Compose(new Vector3(...scale), Quaternion.FromEulerAngles(...rot), new Vector3(...at)));
  const c = Color3.FromHexString(color);
  data.colors = Array.from({ length: data.positions!.length / 3 * 4 }, (_, i) => [c.r, c.g, c.b, 1][i % 4]);
  return data;
}

const block = (at: Vec, size: Vec, color: string, rot?: Vec) => paint(CreateBoxVertexData({ size: 1 }), at, size, color, rot);

function wheels(track: number, base: number, radius: number, rim: string): VertexData[] {
  const out: VertexData[] = [];
  for (const x of [-track / 2, track / 2]) for (const z of [-base / 2, base / 2]) {
    out.push(paint(CreateCylinderVertexData({ height: 1, diameter: 1, tessellation: 10 }), [x, radius, z], [radius * 2, 0.22, radius * 2], TIRE, [0, 0, Math.PI / 2]));
    out.push(paint(CreateCylinderVertexData({ height: 1, diameter: 1, tessellation: 6 }), [x + Math.sign(x) * 0.1, radius, z], [radius * 1.3, 0.04, radius * 1.3], rim, [0, 0, Math.PI / 2]));
  }
  return out;
}

/** Shared sedan layout; each model tunes proportions and adds its trademark parts. */
type Spec = {
  length: number; width: number; beltY: number; hoodDrop: number;
  cabin: { z: number; length: number; height: number; front: number; back: number };
  rim: string; wheelbase: number; radius: number;
};

function sedan(spec: Spec, body: string): VertexData[] {
  const { length: l, width: w, beltY, cabin } = spec;
  const half = l / 2;
  const sill = 0.28;
  const top = beltY;
  const roofY = top + cabin.height;
  // Skirt below the arch line in three pieces, leaving the wheel openings clear.
  const arch = spec.radius * 2 + 0.06;
  const gap = spec.radius + 0.1;
  const axle = spec.wheelbase / 2;
  const skirt = (z0: number, z1: number) => block([0, (sill + arch) / 2, (z0 + z1) / 2], [w, arch - sill, z1 - z0], body);
  return [
    // Upper body with a raked nose and a shorter tail rake.
    slab([0, (arch + top) / 2, 0], [w, top - arch, l], body, { front: spec.hoodDrop, back: 0.12, width: 0.98 }),
    skirt(axle + gap, half - 0.05), skirt(-axle + gap, axle - gap), skirt(-half + 0.05, -axle - gap),
    block([0, arch - 0.02, 0], [w - 0.3, arch - 0.1, l - 0.4], BLACK),
    // Glasshouse, then a body-colour roof skin and B-pillars over it.
    slab([0, top + cabin.height / 2, cabin.z], [w - 0.16, cabin.height, cabin.length], GLASS, { front: cabin.front, back: cabin.back, width: 0.84 }),
    block([0, roofY + 0.015, cabin.z + (cabin.back - cabin.front) / 2], [(w - 0.16) * 0.83, 0.04, cabin.length - cabin.front - cabin.back + 0.04], body),
    ...[-1, 1].map((s) => block([s * (w - 0.2) * 0.46, top + cabin.height / 2, cabin.z - 0.05 + (cabin.back - cabin.front) / 4], [0.04, cabin.height, 0.12], body, [0, 0, -s * 0.16])),
    // Bumpers, plates, mirrors.
    block([0, 0.4, half - 0.02], [w - 0.08, 0.16, 0.08], body),
    block([0, 0.4, -half + 0.02], [w - 0.08, 0.16, 0.08], body),
    block([0, 0.42, half + 0.03], [0.44, 0.11, 0.02], "#e8e8e0"),
    block([0, 0.58, -half - 0.01], [0.44, 0.11, 0.02], "#e8e8e0"),
    ...[-1, 1].map((s) => block([s * (w / 2 + 0.06), top + 0.1, cabin.z + cabin.length / 2 - cabin.front + 0.05], [0.14, 0.1, 0.16], body)),
    ...wheels(w - 0.2, spec.wheelbase, spec.radius, spec.rim),
  ];
}

function lancer(body: string): VertexData[] {
  const spec: Spec = { length: 4.57, width: 1.76, beltY: 0.88, hoodDrop: 0.35, rim: "#2a2b2e", wheelbase: 2.63, radius: 0.32,
    cabin: { z: -0.25, length: 2.4, height: 0.5, front: 0.8, back: 0.5 } };
  const f = spec.length / 2;
  return [
    ...sedan(spec, body),
    // Shark-nose trapezoid grille, angular headlights, big rear wing on two stanchions.
    block([0, 0.6, f + 0.005], [1.0, 0.26, 0.05], BLACK),
    block([0, 0.36, f + 0.03], [1.2, 0.1, 0.03], BLACK),
    ...[-1, 1].map((s) => block([s * 0.64, 0.74, f - 0.12], [0.36, 0.08, 0.2], "#e8edf0", [0.35, 0, s * 0.12])),
    ...[-1, 1].map((s) => block([s * 0.63, 0.78, -f + 0.02], [0.38, 0.12, 0.06], "#b2242b")),
    ...[-1, 1].map((s) => block([s * 0.56, 1.0, -f + 0.28], [0.06, 0.24, 0.14], body, [0.25, 0, 0])),
    block([0, 1.13, -f + 0.2], [1.62, 0.04, 0.32], body, [-0.08, 0, 0]),
    ...[-1, 1].map((s) => block([s * 0.82, 1.1, -f + 0.2], [0.03, 0.14, 0.34], body)),
  ];
}

function civicRs(body: string): VertexData[] {
  const spec: Spec = { length: 4.65, width: 1.8, beltY: 0.84, hoodDrop: 0.3, rim: "#1e1f22", wheelbase: 2.7, radius: 0.33,
    cabin: { z: -0.4, length: 2.85, height: 0.52, front: 0.85, back: 1.05 } };
  const f = spec.length / 2;
  return [
    ...sedan(spec, body),
    // Gloss-black "wing" bar, low mesh intake, C-shaped tails, duck-lip spoiler.
    block([0, 0.74, f - 0.02], [1.35, 0.07, 0.04], BLACK),
    block([0, 0.52, f + 0.005], [0.9, 0.16, 0.04], BLACK),
    ...[-1, 1].map((s) => block([s * 0.66, 0.72, f - 0.1], [0.34, 0.07, 0.2], "#e8edf0", [0.35, 0, s * 0.18])),
    ...[-1, 1].flatMap((s) => [
      block([s * 0.6, 0.78, -f + 0.02], [0.5, 0.06, 0.05], "#b2242b"),
      block([s * 0.82, 0.7, -f + 0.03], [0.07, 0.2, 0.05], "#b2242b"),
    ]),
    block([0, 0.86, -f + 0.1], [1.5, 0.04, 0.1], BLACK, [-0.3, 0, 0]),
    block([0, 0.3, -f + 0.02], [1.3, 0.08, 0.05], BLACK),
    ...[-1, 1].map((s) => block([s * 0.4, 0.3, -f - 0.01], [0.12, 0.07, 0.03], "#8e9196")),
  ];
}

function city(body: string): VertexData[] {
  const spec: Spec = { length: 4.44, width: 1.7, beltY: 0.9, hoodDrop: 0.3, rim: "#b8bcc0", wheelbase: 2.6, radius: 0.3,
    cabin: { z: -0.15, length: 2.4, height: 0.55, front: 0.75, back: 0.45 } };
  const f = spec.length / 2;
  return [
    ...sedan(spec, body),
    // Plain chrome grille bar, tidy lamps, a short notchback trunk.
    block([0, 0.76, f - 0.01], [1.05, 0.06, 0.04], "#c9ccd0"),
    block([0, 0.58, f + 0.005], [0.75, 0.14, 0.04], BLACK),
    ...[-1, 1].map((s) => block([s * 0.62, 0.76, f - 0.11], [0.34, 0.09, 0.2], "#e8edf0", [0.35, 0, s * 0.1])),
    ...[-1, 1].map((s) => block([s * 0.6, 0.8, -f + 0.03], [0.36, 0.1, 0.05], "#b2242b")),
    block([0, 0.8, -f + 0.03], [0.5, 0.03, 0.05], "#c9ccd0"),
  ];
}

const BUILDERS: Record<CrewCarModel, (body: string) => VertexData[]> = { lancer, civic_rs: civicRs, city };

/** One merged, vertex-coloured mesh on the world material. +z forward, tyres on y = 0. */
export function buildCrewCar(scene: Scene, material: Material, model: CrewCarModel, body: string, name: string): Mesh {
  const parts = BUILDERS[model](body);
  const mesh = new Mesh(name, scene);
  parts[0].merge(parts.slice(1)).applyToMesh(mesh);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}
