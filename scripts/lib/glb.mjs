// Minimal glTF 2.0 binary writer for the generated placeholder assets. No dependencies.

/**
 * Packs geometry buckets (`{ [material]: { positions, normals, indices } }`, one primitive each)
 * into a one-node, one-mesh GLB. `materials[name]` is `{ color: "#rrggbb" (sRGB), metallic, roughness }`.
 */
export function packGlb({ parts, materials: specs, generator, node }) {
  const names = Object.keys(parts);
  const chunks = [], views = [], accessors = [];
  let offset = 0;
  const push = (array, target, extra) => {
    const bytes = Buffer.from(array.buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    chunks.push(bytes);
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
    offset += bytes.length + pad;
    accessors.push({ bufferView: views.length - 1, ...extra });
    return accessors.length - 1;
  };
  const primitives = names.map((name, material) => {
    const { positions, normals, indices, uvs } = parts[name];
    const count = positions.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) { min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]); }
    return {
      attributes: {
        POSITION: push(new Float32Array(positions), 34962, { componentType: 5126, count, type: "VEC3", min, max }),
        NORMAL: push(new Float32Array(normals), 34962, { componentType: 5126, count, type: "VEC3" }),
        ...(uvs ? { TEXCOORD_0: push(new Float32Array(uvs), 34962, { componentType: 5126, count, type: "VEC2" }) } : {}),
      },
      indices: push(new Uint16Array(indices), 34963, { componentType: 5123, count: indices.length, type: "SCALAR" }),
      material,
    };
  });
  const materials = names.map((name) => {
    const m = specs[name];
    return { name, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...srgbToLinear(m.color), 1], metallicFactor: m.metallic, roughnessFactor: m.roughness } };
  });
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0", generator },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: node, mesh: 0 }],
    meshes: [{ name: node, primitives }], materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
  header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  jsonHead.writeUInt32LE(text.length, 0); jsonHead.write("JSON", 4);
  binHead.writeUInt32LE(bin.length, 0); binHead.write("BIN\0", 4);
  return Buffer.concat([header, jsonHead, text, binHead, bin]);
}

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(v) { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }
export function srgbToLinear(hex) {
  return [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
}
