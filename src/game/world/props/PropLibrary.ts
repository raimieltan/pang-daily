import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphereVertexData } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { PropPlacement } from "../WorldLayout";
import type { PropCollider, PropDefinition, PropLayer, PropPart, Vec3Tuple } from "./PropDefinition";
import { PROP_KIT, type PropId } from "./propKit";

const DEG = Math.PI / 180;
const LAYERS: readonly PropLayer[] = ["body", "tint", "glow"];

/** Materials the prop layers render with. Shared with the chunk geometry so lighting treats both alike. */
export type PropMaterials = { readonly lit: Material; readonly glow: Material };

/** A world-space box collider produced by a placed prop. */
export type PlacedCollider = { readonly center: Vector3; readonly size: Vec3Tuple; readonly rotation: Quaternion };

/**
 * Turns `PROP_KIT` definitions into render templates and places them. Each prop becomes at
 * most three template meshes (one per layer, parts merged, colours baked into vertex colours);
 * a chunk places all its copies of a prop as thin instances of those templates, so every
 * (prop, layer) pair is one draw call per chunk no matter how many chairs there are.
 *
 * GLB swap: a loaded asset only has to produce the same per-layer meshes in prop space and
 * register them with `setTemplate`; placements and colliders are unaffected.
 */
export class PropLibrary {
  private readonly templates = new Map<PropId, Partial<Record<PropLayer, Mesh>>>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: PropMaterials,
  ) {}

  /** The hidden template meshes for a prop, built on first use. */
  template(id: PropId): Partial<Record<PropLayer, Mesh>> {
    let layers = this.templates.get(id);
    if (!layers) {
      layers = buildTemplate(this.scene, id, this.materials);
      this.templates.set(id, layers);
    }
    return layers;
  }

  setTemplate(id: PropId, layers: Partial<Record<PropLayer, Mesh>>): void {
    for (const mesh of Object.values(this.templates.get(id) ?? {})) mesh.dispose();
    this.templates.set(id, layers);
  }

  /**
   * Places `placements` under `parent` as thin instances (one mesh per prop and layer) and
   * returns the meshes plus the world-space colliders the props declare.
   */
  place(placements: readonly PropPlacement[], parent: TransformNode, name: string): { meshes: Mesh[]; colliders: PlacedCollider[] } {
    const meshes: Mesh[] = [];
    const colliders: PlacedCollider[] = [];
    const byProp = new Map<PropId, PropPlacement[]>();
    for (const p of placements) {
      const list = byProp.get(p.prop);
      if (list) list.push(p);
      else byProp.set(p.prop, [p]);
    }

    for (const [id, list] of byProp) {
      const matrices = new Float32Array(list.length * 16);
      const tints = new Float32Array(list.length * 4);
      list.forEach((p, i) => {
        placementMatrix(p).copyToArray(matrices, i * 16);
        const tint = p.tint ? Color3.FromHexString(p.tint) : Color3.White();
        tints.set([tint.r, tint.g, tint.b, 1], i * 4);
        const collider = (PROP_KIT[id] as PropDefinition).collider;
        if (collider) colliders.push(placeCollider(p, collider));
      });

      for (const [layer, template] of Object.entries(this.template(id)) as [PropLayer, Mesh][]) {
        const mesh = template.clone(`${name}:${id}:${layer}`, parent, true);
        // Instance attributes belong to geometry. Each chunk needs its own
        // buffers; otherwise later chunks replace earlier chunks' placements.
        mesh.makeGeometryUnique();
        mesh.setEnabled(true);
        mesh.isPickable = false;
        mesh.thinInstanceSetBuffer("matrix", matrices.slice(), 16, true);
        if (layer !== "body") mesh.thinInstanceSetBuffer("color", tints.slice(), 4, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.freezeWorldMatrix();
        meshes.push(mesh);
      }
    }
    return { meshes, colliders };
  }

  dispose(): void {
    for (const layers of this.templates.values()) for (const mesh of Object.values(layers)) mesh.dispose();
    this.templates.clear();
  }
}

/** Merges a prop's parts per layer into vertex-coloured meshes. Exported for tests. */
export function propVertexData(id: PropId): Partial<Record<PropLayer, VertexData>> {
  const out: Partial<Record<PropLayer, VertexData>> = {};
  for (const layer of LAYERS) {
    const parts = (PROP_KIT[id] as PropDefinition).parts.filter((p) => (p.layer ?? "body") === layer);
    if (parts.length === 0) continue;
    const [first, ...rest] = parts.map(partVertexData);
    out[layer] = rest.length ? first.merge(rest, true) : first;
  }
  return out;
}

function buildTemplate(scene: Scene, id: PropId, materials: PropMaterials): Partial<Record<PropLayer, Mesh>> {
  const out: Partial<Record<PropLayer, Mesh>> = {};
  for (const [layer, data] of Object.entries(propVertexData(id)) as [PropLayer, VertexData][]) {
    const mesh = new Mesh(`prop:${id}:${layer}`, scene);
    data.applyToMesh(mesh);
    mesh.material = layer === "glow" ? materials.glow : materials.lit;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    out[layer] = mesh;
  }
  return out;
}

function partVertexData(part: PropPart): VertexData {
  const [sx, sy, sz] = part.size;
  let data: VertexData;
  let scale = Vector3.One();
  if (part.shape === "box") {
    data = CreateBoxVertexData({ width: sx, height: sy, depth: sz });
  } else if (part.shape === "cylinder") {
    data = CreateCylinderVertexData({ diameter: 1, height: sy, tessellation: part.tessellation ?? 8 });
    scale = new Vector3(sx, 1, sz);
  } else {
    data = CreateSphereVertexData({ diameter: 1, segments: part.tessellation ?? 6 });
    scale = new Vector3(sx, sy, sz);
  }
  const [rx, ry, rz] = part.rotDeg ?? [0, 0, 0];
  const rotation = Matrix.RotationX(rx * DEG).multiply(Matrix.RotationY(ry * DEG)).multiply(Matrix.RotationZ(rz * DEG));
  data.transform(Matrix.Scaling(scale.x, scale.y, scale.z).multiply(rotation).multiply(Matrix.Translation(...part.at)));

  const color = Color3.FromHexString(part.color);
  const count = data.positions!.length / 3;
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b, 1], i * 4);
  data.colors = colors;
  data.uvs = null;
  return data;
}

function placementMatrix(p: PropPlacement): Matrix {
  const s = p.scale ?? 1;
  return Matrix.Compose(
    new Vector3(s, s, s),
    Quaternion.RotationAxis(Vector3.Up(), (p.rotDeg ?? 0) * DEG),
    new Vector3(p.at[0], p.y ?? 0, p.at[1]),
  );
}

function placeCollider(p: PropPlacement, collider: PropCollider): PlacedCollider {
  const s = p.scale ?? 1;
  const rotation = Quaternion.RotationAxis(Vector3.Up(), (p.rotDeg ?? 0) * DEG);
  const center = new Vector3(...collider.at).scaleInPlace(s).applyRotationQuaternionInPlace(rotation);
  center.addInPlaceFromFloats(p.at[0], p.y ?? 0, p.at[1]);
  return { center, size: [collider.size[0] * s, collider.size[1] * s, collider.size[2] * s], rotation };
}
