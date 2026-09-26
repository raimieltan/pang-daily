// Writes the placeholder wheel GLBs in public/model/wheels/ (docs/VEHICLE_ASSETS.md §7).
// No dependencies: builds flat-shaded lathe/box geometry and packs glTF 2.0 binary by hand.
// Run: node scripts/build-wheel-models.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { cross, normalize, packGlb, sub } from "./lib/glb.mjs";

const SEGMENTS = 24;
const IN = 0.0254;

const MATERIALS = {
  tire: { color: "#1b1b1c", metallic: 0, roughness: 0.92 },
  rim: { color: "#c9ccd1", metallic: 0.6, roughness: 0.35 },
  rim_dark: { color: "#2a2c30", metallic: 0.3, roughness: 0.7 },
  chrome: { color: "#e8eaec", metallic: 1, roughness: 0.15 },
};

/**
 * Geometry buckets, one primitive per material. Built with the axle along x, outboard face at +x,
 * hub at the origin, then mirrored on write: Babylon imports glTF +x as −x, and the contract is
 * "outboard at +x in car space" (the car's right-hand wheel as it sits).
 */
function builder() {
  const parts = {};
  const bucket = (m) => (parts[m] ??= { positions: [], normals: [], indices: [] });
  function quad(m, a, b, c, d) {
    const n = normalize(cross(sub(c, a), sub(d, b)));
    const p = bucket(m);
    const base = p.positions.length / 3;
    for (const v of [a, b, c, d]) { p.positions.push(-v[0], v[1], v[2]); p.normals.push(-n[0], n[1], n[2]); }
    p.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Revolves a [x, r] polyline around the axle. */
  function lathe(m, profile) {
    for (let i = 0; i < profile.length - 1; i++) {
      for (let j = 0; j < SEGMENTS; j++) {
        const at = ([x, r], k) => { const a = (k / SEGMENTS) * Math.PI * 2; return [x, r * Math.cos(a), r * Math.sin(a)]; };
        quad(m, at(profile[i], j), at(profile[i + 1], j), at(profile[i + 1], j + 1), at(profile[i], j + 1));
      }
    }
  }
  /** Radial spoke from r0 to r1 at angle `a`, `t` wide, `d` deep along the axle, centred on x. */
  function spoke(m, x, a, r0, r1, t, d) {
    const radial = [0, Math.cos(a), Math.sin(a)], tangent = [0, -Math.sin(a), Math.cos(a)];
    const v = (sx, r, st) => [x + sx * d / 2, radial[1] * r + tangent[1] * st * t / 2, radial[2] * r + tangent[2] * st * t / 2];
    const c = [];
    for (const sx of [-1, 1]) for (const r of [r0, r1]) for (const st of [-1, 1]) c.push(v(sx, r, st));
    const [a0, a1, a2, a3, b0, b1, b2, b3] = c; // a* inboard, b* outboard; index = r*2 + st
    quad(m, b0, b1, b3, b2); quad(m, a0, a2, a3, a1);
    quad(m, a0, a1, b1, b0); quad(m, a2, b2, b3, a3);
    quad(m, a1, a3, b3, b1); quad(m, a0, b0, b2, a2);
  }
  return { parts, lathe, spoke };
}

/** Tire tube plus rim barrel and lip, shared by every style. Returns the key radii/planes. */
function base(g, diameterM, widthM, rimIn) {
  const R = diameterM / 2, w = widthM / 2, rr = (rimIn * IN) / 2 + 0.012, bead = w * 0.9;
  g.lathe("tire", [[bead, rr], [w, rr + 0.02], [w, R - 0.03], [w - 0.015, R], [-w + 0.015, R], [-w, R - 0.03], [-w, rr + 0.02], [-bead, rr]]);
  g.lathe("rim_dark", [[-bead, rr - 0.004], [bead, rr - 0.004]]);
  g.lathe("rim", [[bead, rr + 0.01], [bead + 0.004, rr - 0.012], [bead, rr - 0.022]]);
  return { R, rr, face: bead };
}

const STYLES = {
  steelie(g, d, w, rim) {
    const { rr, face } = base(g, d, w, rim);
    const disc = face - 0.035;
    g.lathe("rim", [[face, rr - 0.022], [disc, rr - 0.045], [disc, 0.001]]);
    g.lathe("chrome", [[disc + 0.002, rr * 0.5], [disc + 0.02, rr * 0.42], [disc + 0.03, rr * 0.2], [disc + 0.032, 0.001]]);
  },
  multi_spoke(g, d, w, rim) {
    const { rr, face } = base(g, d, w, rim);
    g.lathe("rim_dark", [[-w / 4, rr - 0.004], [-w / 4, 0.001]]);
    const hub = face - 0.03;
    g.lathe("rim", [[hub, 0.06], [hub + 0.01, 0.05], [hub + 0.01, 0.001]]);
    for (let i = 0; i < 8; i++) g.spoke("rim", hub + 0.004, (i / 8) * Math.PI * 2, 0.05, rr - 0.015, 0.03, 0.022);
    g.lathe("chrome", [[hub + 0.011, 0.028], [hub + 0.016, 0.001]]);
  },
  deep_dish(g, d, w, rim) {
    const { rr, face } = base(g, d, w, rim);
    const lip = rr - 0.075, dish = face - 0.08;
    g.lathe("chrome", [[face, rr - 0.022], [face + 0.003, lip], [dish, lip - 0.004]]);
    g.lathe("rim_dark", [[-w / 4, rr - 0.004], [-w / 4, 0.001]]);
    g.lathe("rim", [[dish, 0.055], [dish + 0.012, 0.045], [dish + 0.012, 0.001]]);
    for (let i = 0; i < 5; i++) g.spoke("rim", dish + 0.004, (i / 5) * Math.PI * 2 + 0.3, 0.045, lip - 0.006, 0.04, 0.02);
  },
};

const WHEELS = [
  { file: "steelies_14", style: "steelie", diameterM: 0.57, widthM: 0.165, rimIn: 14, rim: "#9aa0a6" },
  { file: "mags_15", style: "multi_spoke", diameterM: 0.6, widthM: 0.195, rimIn: 15, rim: "#c9ccd1" },
  { file: "deep_dish_17", style: "deep_dish", diameterM: 0.64, widthM: 0.215, rimIn: 17, rim: "#e3e5e8" },
];

function glb(parts, rimColor) {
  const materials = Object.fromEntries(Object.entries(MATERIALS).map(([name, m]) => [name, name === "rim" ? { ...m, color: rimColor } : m]));
  return packGlb({ parts, materials, generator: "pang-daily build-wheel-models", node: "wheel" });
}

mkdirSync("public/model/wheels", { recursive: true });
for (const wheel of WHEELS) {
  const g = builder();
  STYLES[wheel.style](g, wheel.diameterM, wheel.widthM, wheel.rimIn);
  const file = `public/model/wheels/${wheel.file}.glb`;
  const data = glb(g.parts, wheel.rim);
  writeFileSync(file, data);
  const tris = Object.values(g.parts).reduce((n, p) => n + p.indices.length / 3, 0);
  console.log(`${file}: ${tris} triangles, ${Object.keys(g.parts).length} materials, ${(data.length / 1024).toFixed(1)} KiB`);
}
