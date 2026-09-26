// Writes the placeholder body part GLBs in public/model/body/ (docs/VEHICLE_ASSETS.md §8).
// No dependencies: flat-shaded prisms and sheets, packed by scripts/lib/glb.mjs.
// Run: node scripts/build-body-part-models.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { cross, normalize, packGlb, sub } from "./lib/glb.mjs";
import { mounting, stockMaterials, stockPanel, stockSurfaceHeight, stockSurfaceFrontZ } from "./lib/modular-panels.mjs";

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
    // The x mirror flips handedness, so reverse the winding to keep it agreeing with the normal.
    for (let i = 1; i < vs.length - 1; i++) p.indices.push(base, base + i + 1, base + i);
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
// Convert runtime +X-right to the source GLB's +X-left and sample the actual trunk skin.
const trunkY = (x, z) => stockSurfaceHeight("trunk_stock", -x, mounting.spoiler_rear[2] + z) - mounting.spoiler_rear[1];

function wingFoot(g, x) {
  const bottom = [[x - 0.04, -0.02], [x + 0.04, -0.02], [x + 0.04, 0.08], [x - 0.04, 0.08]]
    .map(([px, pz]) => [px, trunkY(px, pz) - 0.001, pz]);
  const top = bottom.map(([px, py, pz]) => [px, py + 0.008, pz]);
  g.poly("hardware", [...bottom].reverse());
  g.poly("hardware", top);
  for (let i = 0; i < 4; i++) g.poly("hardware", [bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]]);
  g.box("hardware", [x - 0.01, x + 0.01], [Math.min(...bottom.map(p => p[1])), 0.29], [-0.01, 0.06]);
}

/** Orders a convex polygon so its authored normal faces `dir`. */
function facing(g, m, vs, dir) {
  const n = cross(sub(vs[1], vs[0]), sub(vs[2], vs[0]));
  g.poly(m, n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [...vs].reverse() : vs);
}

function cuboid(g, m, [x0, x1], [y0, y1], [z0, z1]) {
  const c = (x, y, z) => [[x0, x1][x], [y0, y1][y], [z0, z1][z]];
  facing(g, m, [c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)], [0, 0, 1]);
  facing(g, m, [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0)], [0, 0, -1]);
  facing(g, m, [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)], [0, 1, 0]);
  facing(g, m, [c(0, 0, 0), c(1, 0, 0), c(1, 0, 1), c(0, 0, 1)], [0, -1, 0]);
  facing(g, m, [c(1, 0, 0), c(1, 1, 0), c(1, 1, 1), c(1, 0, 1)], [1, 0, 0]);
  facing(g, m, [c(0, 0, 0), c(0, 1, 0), c(0, 1, 1), c(0, 0, 1)], [-1, 0, 0]);
}

/**
 * Evo V-type replica: square-shouldered face over the stock seams, a big centre mouth behind the
 * plate, boxed fog lamps, corner ducts and a kicked-out lip. Authored in world (y, z), rows top to
 * bottom; each row is [y, face z, corner inset] so the top and bottom corners round off like stock.
 */
const EVO_ROWS = [[0.651, 2.1, 0.04], [0.62, 2.13, 0.015], [0.58, 2.152, 0], [0.53, 2.165, 0], [0.5, 2.168, 0],
  [0.47, 2.17, 0], [0.44, 2.172, 0], [0.4, 2.173, 0], [0.3, 2.176, 0], [0.27, 2.177, 0], [0.24, 2.178, 0],
  [0.225, 2.2, 0], [0.205, 2.222, 0.01], [0.19, 2.205, 0.02]];
const EVO_FLAT = [0, 0.19, 0.3, 0.38, 0.47, 0.56, 0.58, 0.62, 0.7, 0.72];
/** Right-half openings in world x/y (edges on the grids above) and pocket depth. */
const EVO_OPENINGS = {
  mouth: { x: [0, 0.3], y: [0.24, 0.47], depth: 0.12 },
  fog: { x: [0.38, 0.56], y: [0.3, 0.47], depth: 0.05 },
  duct: { x: [0.62, 0.7], y: [0.27, 0.53], depth: 0.1 },
  brake: { x: [0.58, 0.7], y: [0.24, 0.27], depth: 0.06 },
};

function evoBumper(g) {
  const [, oy, oz] = mounting.bumper_front;
  const local = ([x, y, z]) => [x, y - oy, z - oz];
  const cols = [...EVO_FLAT.map(x => ({ x })), ...[1, 2, 3, 4, 5, 6].map(i => ({ a: i * Math.PI / 12 })), { side: 1 }];
  /** World point on the outer skin; x is the right half. */
  const skin = (c, r) => {
    const [y, zf, inset] = EVO_ROWS[r], radius = 0.845 - inset - 0.72, col = cols[c];
    if (col.x !== undefined) return [col.x, y, zf];
    if (col.a !== undefined) return [0.72 + radius * Math.sin(col.a), y, zf - radius + radius * Math.cos(col.a)];
    return [0.72 + radius, y, oz];
  };
  const both = (m, vs, dir) => {
    facing(g, m, vs.map(local), dir);
    facing(g, m, vs.map(([x, y, z]) => local([-x, y, z])), [-dir[0], dir[1], dir[2]]);
  };
  const open = (c, r) => cols[c].x !== undefined && cols[c + 1].x !== undefined && Object.values(EVO_OPENINGS).some(o =>
    cols[c].x >= o.x[0] && cols[c + 1].x <= o.x[1] && EVO_ROWS[r][0] <= o.y[1] && EVO_ROWS[r + 1][0] >= o.y[0]);

  for (let c = 0; c < cols.length - 1; c++) {
    for (let r = 0; r < EVO_ROWS.length - 1; r++) {
      if (open(c, r)) continue;
      const quad = [skin(c, r), skin(c + 1, r), skin(c + 1, r + 1), skin(c, r + 1)];
      // Outward is away from the bumper's plan centre, a little behind the face.
      const mid = quad.reduce((s, p) => s.map((v, i) => v + p[i] / 4), [0, 0, 0]);
      both("panel", quad, [mid[0], 0, mid[2] - 1.95]);
    }
    // Top return tucks under the headlights; the underside closes the lip.
    const top = [skin(c, 0), skin(c + 1, 0)], bottom = [skin(c, EVO_ROWS.length - 1), skin(c + 1, EVO_ROWS.length - 1)];
    if (cols[c + 1].side === undefined) {
      both("panel", [top[0], top[1], [top[1][0], top[1][1], 1.87], [top[0][0], top[0][1], 1.87]], [0, 1, 0]);
      both("panel", [bottom[0], bottom[1], [bottom[1][0], bottom[1][1], 1.95], [bottom[0][0], bottom[0][1], 1.95]], [0, -1, 0]);
    }
  }

  // Pockets: skin-coloured walls back to a black mesh floor.
  const faceZ = y => EVO_ROWS.find(row => row[0] === y)[1];
  for (const { x: [x0, x1], y: [y0, y1], depth } of Object.values(EVO_OPENINGS)) {
    const rows = EVO_ROWS.filter(([y]) => y >= y0 && y <= y1).map(([y, z]) => [y, z]);
    const back = Math.min(...rows.map(([, z]) => z)) - depth;
    const centre = [(x0 + x1) / 2, (y0 + y1) / 2];
    const wall = (p, q) => both("panel", [p, q, [q[0], q[1], back], [p[0], p[1], back]],
      [centre[0] - (p[0] + q[0]) / 2, centre[1] - (p[1] + q[1]) / 2, 0]);
    wall([x0, y1, faceZ(y1)], [x1, y1, faceZ(y1)]);
    wall([x0, y0, faceZ(y0)], [x1, y0, faceZ(y0)]);
    for (let i = 0; i < rows.length - 1; i++) {
      const [[ya, za], [yb, zb]] = [rows[i], rows[i + 1]];
      if (x0 > 0) wall([x0, ya, za], [x0, yb, zb]);
      wall([x1, ya, za], [x1, yb, zb]);
    }
    both("hardware", [[x0, y0, back], [x1, y0, back], [x1, y1, back], [x0, y1, back]], [0, 0, 1]);
  }

  // Round fog lamps: chrome bucket and a clear lens, proud of the pocket floor.
  const fog = EVO_OPENINGS.fog, fogBack = faceZ(fog.y[1]) - fog.depth;
  const [cx, cy] = [(fog.x[0] + fog.x[1]) / 2, (fog.y[0] + fog.y[1]) / 2];
  const ring = (radius, z) => Array.from({ length: 20 }, (_, i) =>
    [cx + radius * Math.cos(i * Math.PI / 10), cy + radius * Math.sin(i * Math.PI / 10), z]);
  const shellBack = ring(0.072, fogBack), shellFront = ring(0.072, fogBack + 0.035), lens = ring(0.06, fogBack + 0.036);
  for (let i = 0; i < 20; i++) {
    const j = (i + 1) % 20, angle = (i + 0.5) * Math.PI / 10;
    both("chrome", [shellBack[i], shellBack[j], shellFront[j], shellFront[i]], [Math.cos(angle), Math.sin(angle), 0]);
    both("chrome", [shellFront[i], shellFront[j], lens[j], lens[i]], [0, 0, 1]);
  }
  both("headlight", lens, [0, 0, 1]);

  // Plate on a bar across the top of the mouth, as bolted on in every province.
  const plateZ = faceZ(0.47) + 0.004;
  for (const [m, [px, py0, py1], [pz0, pz1]] of [["hardware", [0.2, 0.44, 0.54], [plateZ - 0.004, plateZ]], ["plate", [0.19, 0.445, 0.535], [plateZ, plateZ + 0.006]]]) {
    cuboid(g, m, [-px, px], [py0 - oy, py1 - oy], [pz0 - oz, pz1 - oz]);
  }
}

const PARTS = {
  universal_rubber_lip(g) {
    stockPanel(g, ["lip_front_stock"], mounting.lip_front, "trim");
  },
  // chin at the modular attach_chin_front frame: an aluminium splitter plate on threaded rods.
  acp_chin_splitter(g) {
    stockPanel(g, ["chin_front_stock"], mounting.chin_front);
    g.alongX("panel", [[-0.012, -0.12], [-0.012, 0.16], [0, 0.17], [0, -0.12]], -0.42, 0.42);
    for (const x of [-0.3, 0.3]) {
      // Lean each rod from the splitter back to the measured bumper face.
      const topZ = stockSurfaceFrontZ("bumper_front_stock", -x, mounting.chin_front[1] + 0.11) - mounting.chin_front[2];
      g.alongX("hardware", [[-0.002, 0.08], [-0.002, 0.09], [0.114, topZ + 0.003], [0.114, topZ - 0.004]], x - 0.005, x + 0.005);
    }
  },
  dalagan_fiberglass_skirts(g) {
    stockPanel(g, ["sideskirt_l_stock", "sideskirt_r_stock"], [0, 0.2, 0]);
  },
  // spoiler at the corrected modular attach_spoiler_rear frame: a kicked-up lip on the trunk's trailing edge.
  dalagan_ducktail(g) {
    // Continuous moulded base follows the deck rather than hovering over its curved surface.
    for (let i = 0; i < 16; i++) {
      const x0 = -0.62 + i * 1.24 / 16, x1 = -0.62 + (i + 1) * 1.24 / 16;
      const section = x => [[x, trunkY(x, 0.04) - 0.001, 0.04], [x, trunkY(x, 0.1) - 0.001, 0.1],
        [x, trunkY(x, 0.04) + 0.075, -0.03], [x, trunkY(x, 0.04) + 0.06, -0.04]];
      const left = section(x0), right = section(x1);
      for (let j = 0; j < 4; j++) g.poly("panel", [left[j], right[j], right[(j + 1) % 4], left[(j + 1) % 4]]);
      if (i === 0) g.poly("panel", [...left].reverse());
      if (i === 15) g.poly("panel", right);
    }
  },
  // spoiler: a marketplace wing on black uprights, bolted through the trunk lid.
  marketplace_gt_wing(g) {
    for (const x of [-0.45, 0.45]) {
      wingFoot(g, x);
    }
    const blade = [[0.3, 0.13], [0.312, 0.08], [0.318, 0], [0.315, -0.08], [0.33, -0.15], [0.3, -0.12], [0.286, -0.02], [0.29, 0.1]];
    g.alongX("panel", blade, -0.8, 0.8);
    for (const s of [-1, 1]) g.box("panel", s < 0 ? [-0.81, -0.8] : [0.8, 0.81], [0.22, 0.39], [-0.18, 0.15]);
  },
  dalagan_primer_bumper(g) {
    stockPanel(g, ["bumper_front_stock"], mounting.bumper_front);
  },
  evo_type_front_bumper: evoBumper,
  dalagan_fender_fl(g) {
    stockPanel(g, ["fender_fl_stock"], mounting.fender_fl);
  },
  vented_carbon_look_hood(g) {
    stockPanel(g, ["hood_stock"], mounting.hood);
    // Raised vent inserts sit inside the original panel boundary; the cowl hinge stays intact.
    for (const x of [-0.18, 0.18]) {
      const bottom = [[x - 0.12, 0.48], [x + 0.12, 0.48], [x + 0.12, 0.68], [x - 0.12, 0.68]]
        .map(([px, pz]) => [px, stockSurfaceHeight("hood_stock", -px, mounting.hood[2] + pz) - mounting.hood[1] - 0.001, pz]);
      const top = bottom.map(([px, py, pz]) => [px, py + 0.012, pz]);
      g.poly("hardware", [...bottom].reverse());
      g.poly("hardware", top);
      for (let i = 0; i < 4; i++) g.poly("hardware", [bottom[i], bottom[(i + 1) % 4], top[(i + 1) % 4], top[i]]);
    }
  },
};

mkdirSync("public/model/body", { recursive: true });
for (const [file, build] of Object.entries(PARTS)) {
  const g = builder();
  build(g);
  const data = packGlb({ parts: g.parts, materials: MATERIALS, generator: "pang-daily build-body-part-models", node: file });
  writeFileSync(`public/model/body/${file}.glb`, data);
  const tris = Object.values(g.parts).reduce((n, p) => n + p.indices.length / 3, 0);
  console.log(`public/model/body/${file}.glb: ${tris} triangles, ${Object.keys(g.parts).length} materials, ${(data.length / 1024).toFixed(1)} KiB`);
}
