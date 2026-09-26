// Writes the placeholder body part GLBs in public/model/body/ (docs/VEHICLE_ASSETS.md §8).
// No dependencies: flat-shaded prisms and sheets, packed by scripts/lib/glb.mjs.
// Run: node scripts/build-body-part-models.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { cross, normalize, packGlb, sub } from "./lib/glb.mjs";
import { mounting, stockMaterials, stockPanel } from "./lib/modular-panels.mjs";

/** `panel` takes the finish and wear at runtime; `hardware` (brackets, zip ties, grilles) stays as authored. */
const MATERIALS = {
  ...stockMaterials,
  panel: { color: "#8b8e89", metallic: 0, roughness: 0.8 },
  hardware: { color: "#141516", metallic: 0.1, roughness: 0.75 },
};

/**
 * Geometry buckets, one primitive per material, authored in car space (+x right, +y up, +z forward)
 * with the origin at the part's socket. Mirrored on write: Babylon imports glTF +x as −x.
 */
function builder() {
  const parts = {};
  const bucket = (m) => (parts[m] ??= { positions: [], normals: [], indices: [], uvs: [] });
  function poly(m, vs) {
    const n = normalize(cross(sub(vs[1], vs[0]), sub(vs[2], vs[0])));
    const p = bucket(m);
    const base = p.positions.length / 3;
    const major = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
    const axes = major === 0 ? [2, 1] : major === 1 ? [0, 2] : [0, 1];
    for (const v of vs) {
      p.positions.push(-v[0], v[1], v[2]); p.normals.push(-n[0], n[1], n[2]);
      // Planar projection at two tiles/metre; shared small wear textures need no image assets.
      p.uvs.push(v[axes[0]] * 2, v[axes[1]] * 2);
    }
    for (let i = 1; i < vs.length - 1; i++) p.indices.push(base, base + i, base + i + 1);
  }
  /** Sweeps a closed 2D profile from t0 to t1; `at(a, b, t)` places a profile point in car space. */
  function prism(m, profile, at, t0, t1) {
    for (let i = 0; i < profile.length; i++) {
      const [a, b] = profile[i], [c, d] = profile[(i + 1) % profile.length];
      poly(m, [at(a, b, t0), at(c, d, t0), at(c, d, t1), at(a, b, t1)]);
    }
    poly(m, profile.map(([a, b]) => at(a, b, t0)).reverse());
    poly(m, profile.map(([a, b]) => at(a, b, t1)));
  }
  /** Profile in (y, z), swept across x. */
  const alongX = (m, profile, x0, x1) => prism(m, profile, (y, z, x) => [x, y, z], x0, x1);
  /** Profile in (x, y), swept along z. */
  const alongZ = (m, profile, z0, z1) => prism(m, profile, (x, y, z) => [x, y, z], z0, z1);
  const box = (m, [x0, x1], [y0, y1], [z0, z1]) => alongX(m, [[y0, z0], [y0, z1], [y1, z1], [y1, z0]], x0, x1);
  /** A curved sheet: `at(u, v)` for u, v in [0, 1], thickened by `offset`. */
  function sheet(m, nu, nv, at, offset) {
    const back = (u, v) => { const p = at(u, v); return [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]; };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const [u0, u1, v0, v1] = [i / nu, (i + 1) / nu, j / nv, (j + 1) / nv];
        poly(m, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]);
        poly(m, [back(u0, v1), back(u1, v1), back(u1, v0), back(u0, v0)]);
      }
    }
    const edge = (f) => { for (let k = 0; k < Math.max(nu, nv); k++) { const [a, b] = [f(k / Math.max(nu, nv)), f((k + 1) / Math.max(nu, nv))]; poly(m, [at(...a), at(...b), back(...b), back(...a)]); } };
    edge((s) => [s, 0]); edge((s) => [1, s]); edge((s) => [1 - s, 1]); edge((s) => [0, 1 - s]);
  }
  return { parts, poly, alongX, alongZ, box, sheet };
}

/** Socket origins (catalog.ts) are noted where the shape depends on the body around them. */
const PARTS = {
  universal_rubber_lip(g) {
    stockPanel(g, ["lip_front_stock"], mounting.lip_front, "trim");
  },
  // chin at the modular attach_chin_front frame: an aluminium splitter plate on threaded rods.
  acp_chin_splitter(g) {
    g.alongX("panel", [[-0.012, -0.12], [-0.012, 0.16], [0, 0.17], [0, -0.12]], -0.42, 0.42);
    for (const x of [-0.3, 0.3]) g.box("hardware", [x - 0.005, x + 0.005], [0, 0.11], [0.08, 0.09]);
  },
  dalagan_fiberglass_skirts(g) {
    stockPanel(g, ["sideskirt_l_stock", "sideskirt_r_stock"], [0, 0.2, 0]);
  },
  // spoiler at the corrected modular attach_spoiler_rear frame: a kicked-up lip on the trunk's trailing edge.
  dalagan_ducktail(g) {
    g.alongX("panel", [[0.004, 0.1], [0.004, -0.12], [0.07, -0.16], [0.05, -0.1]], -0.7, 0.7);
  },
  // spoiler: a marketplace wing on black uprights, bolted through the trunk lid.
  marketplace_gt_wing(g) {
    for (const x of [-0.45, 0.45]) {
      g.box("hardware", [x - 0.01, x + 0.01], [0, 0.29], [-0.03, 0.06]);
      g.box("hardware", [x - 0.04, x + 0.04], [0, 0.008], [-0.04, 0.08]);
    }
    const blade = [[0.3, 0.13], [0.312, 0.08], [0.318, 0], [0.315, -0.08], [0.33, -0.15], [0.3, -0.12], [0.286, -0.02], [0.29, 0.1]];
    g.alongX("panel", blade, -0.8, 0.8);
    for (const s of [-1, 1]) g.box("panel", s < 0 ? [-0.81, -0.8] : [0.8, 0.81], [0.22, 0.39], [-0.18, 0.15]);
  },
  dalagan_primer_bumper(g) {
    stockPanel(g, ["bumper_front_stock"], mounting.bumper_front);
  },
  dalagan_fender_fl(g) {
    stockPanel(g, ["fender_fl_stock"], mounting.fender_fl);
  },
  vented_carbon_look_hood(g) {
    stockPanel(g, ["hood_stock"], mounting.hood);
    // Raised vent inserts sit inside the original panel boundary; the cowl hinge stays intact.
    for (const x of [-0.18, 0.18]) g.box("hardware", [x - 0.12, x + 0.12], [-0.027, -0.011], [0.48, 0.68]);
  },
};

mkdirSync("public/model/body", { recursive: true });
for (const [file, build] of Object.entries(PARTS)) {
  const g = builder();
  build(g);
  if (file === "dalagan_ducktail" || file === "marketplace_gt_wing") {
    for (const part of Object.values(g.parts)) {
      for (let i = 1; i < part.positions.length; i += 3) part.positions[i] += 0.105;
    }
  }
  const data = packGlb({ parts: g.parts, materials: MATERIALS, generator: "pang-daily build-body-part-models", node: file });
  writeFileSync(`public/model/body/${file}.glb`, data);
  const tris = Object.values(g.parts).reduce((n, p) => n + p.indices.length / 3, 0);
  console.log(`public/model/body/${file}.glb: ${tris} triangles, ${Object.keys(g.parts).length} materials, ${(data.length / 1024).toFixed(1)} KiB`);
}
