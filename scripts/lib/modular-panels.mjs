// Reuse the supplied stock seams instead of approximating replacement panel shapes.
import { readFileSync } from "node:fs";

const bytes = readFileSync(new URL("../../public/model/banwa_dalagan_1996_modular.glb", import.meta.url));
const jsonSize = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
const binary = bytes.subarray(28 + jsonSize);
export const mounting = JSON.parse(readFileSync(new URL("../../public/model/mounting_interfaces.json", import.meta.url))).slots;

const materialName = name => name === "paint" ? "panel" : name === "trim" ? "hardware" : name;
const toHex = linear => {
  const gamma = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, gamma)) * 255).toString(16).padStart(2, "0");
};
export const stockMaterials = Object.fromEntries(gltf.materials.map(material => {
  const pbr = material.pbrMetallicRoughness;
  return [materialName(material.name), {
    color: `#${pbr.baseColorFactor.slice(0, 3).map(toHex).join("")}`,
    metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
  }];
}));

function accessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3 };
  const readers = { 5123: [2, "readUInt16LE"], 5125: [4, "readUInt32LE"], 5126: [4, "readFloatLE"] };
  const [size, read] = readers[a.componentType];
  const width = sizes[a.type], stride = view.byteStride ?? size * width;
  return Array.from({ length: a.count * width }, (_, i) => binary[read](
    (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + Math.floor(i / width) * stride + (i % width) * size,
  ));
}

function position(node) {
  if (node.matrix || node.rotation?.some((value, i) => value !== (i === 3 ? 1 : 0)) || node.scale?.some(value => value !== 1)) {
    throw new Error(`Stock template ${node.name} must have identity rotation and scale`);
  }
  const parent = gltf.nodes.find(n => n.children?.includes(gltf.nodes.indexOf(node)));
  const origin = parent ? position(parent) : [0, 0, 0];
  return origin.map((v, i) => v + (node.translation?.[i] ?? 0));
}

/** Upper skin height in authored glTF/world coordinates, for feet that must meet a body panel. */
export function stockSurfaceHeight(name, x, z) {
  return stockSurface(name, 1, x, z);
}

/** Front-facing skin position, for splitter brackets that fasten to the bumper. */
export function stockSurfaceFrontZ(name, x, y) {
  return stockSurface(name, 2, x, y);
}

function stockSurface(name, axis, uPosition, vPosition) {
  const node = gltf.nodes.find(n => n.name === name);
  if (!node || node.mesh === undefined) throw new Error(`Missing stock surface ${name}`);
  const origin = position(node);
  const [uAxis, vAxis] = axis === 1 ? [0, 2] : [0, 1];
  let height = -Infinity;
  for (const primitive of gltf.meshes[node.mesh].primitives) {
    const vertices = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices);
    const point = i => vertices.slice(i * 3, i * 3 + 3).map((value, axis) => value + origin[axis]);
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map(point);
      const denominator = (b[vAxis] - c[vAxis]) * (a[uAxis] - c[uAxis]) + (c[uAxis] - b[uAxis]) * (a[vAxis] - c[vAxis]);
      if (Math.abs(denominator) < 1e-10) continue;
      const u = ((b[vAxis] - c[vAxis]) * (uPosition - c[uAxis]) + (c[uAxis] - b[uAxis]) * (vPosition - c[vAxis])) / denominator;
      const v = ((c[vAxis] - a[vAxis]) * (uPosition - c[uAxis]) + (a[uAxis] - c[uAxis]) * (vPosition - c[vAxis])) / denominator;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
        height = Math.max(height, u * a[axis] + v * b[axis] + (1 - u - v) * c[axis]);
      }
    }
  }
  if (!Number.isFinite(height)) throw new Error(`${name} has no surface at (${uPosition}, ${vPosition}) on axis ${axis}`);
  return height;
}

/** Copy stock triangles into a replacement's mount frame, retaining material boundaries. */
export function stockPanel(builder, names, origin, panelMaterial = "paint") {
  for (const name of names) {
    const node = gltf.nodes.find(n => n.name === name);
    if (!node || node.mesh === undefined) throw new Error(`Missing stock panel ${name}`);
    const offset = position(node).map((v, i) => v - origin[i]);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const sourceMaterial = gltf.materials[primitive.material].name;
      const material = sourceMaterial === panelMaterial ? "panel" : materialName(sourceMaterial);
      const bucket = builder.parts[material] ??= { positions: [], normals: [], indices: [], uvs: [] };
      const positions = accessor(primitive.attributes.POSITION);
      const normals = accessor(primitive.attributes.NORMAL);
      const base = bucket.positions.length / 3;
      for (let i = 0; i < positions.length; i += 3) {
        const p = positions.slice(i, i + 3).map((v, axis) => v + offset[axis]);
        const n = normals.slice(i, i + 3);
        const major = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
        const axes = major === 0 ? [2, 1] : major === 1 ? [0, 2] : [0, 1];
        bucket.positions.push(...p); bucket.normals.push(...n);
        bucket.uvs.push(p[axes[0]] * 2, p[axes[1]] * 2);
      }
      bucket.indices.push(...accessor(primitive.indices).map(i => i + base));
    }
  }
}
