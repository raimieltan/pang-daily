import type { PropDefinition, PropLayer, PropPart, Vec3Tuple } from "./PropDefinition";

/**
 * First environment prop kit (ART_DIRECTION §2.2, §7): the mundane roadside details that make
 * a greybox read as Iloilo. Placeholder primitives only; each entry can later point at a GLB
 * (`glb`) without touching any placement. Colours follow the muted world palette (§5): only
 * lamps, sign faces and the odd monobloc chair carry saturated colour.
 */

/** Height of the three wire attachment points on a utility pole's crossarm. */
export const POLE_WIRE_HEIGHT = 8.5;
/** Crossarm attachment offsets across the pole (prop-space x). */
export const POLE_WIRE_OFFSETS = [-0.8, 0, 0.8] as const;

const CONCRETE = "#9a958a";
const CONCRETE_DARK = "#7c776d";
const STEEL = "#5d6166";
const RUBBER = "#1b1b1c";
const FOLIAGE = "#1f3a24";
const FOLIAGE_LIGHT = "#2e5a2c";
const WHITE_PLASTIC = "#e7e4dc";

type PartOptions = { rotDeg?: Vec3Tuple; layer?: PropLayer; tessellation?: number };

function box(size: Vec3Tuple, at: Vec3Tuple, color: string, options: PartOptions = {}): PropPart {
  return { shape: "box", size, at, color, ...options };
}

function cyl(diameter: number, height: number, at: Vec3Tuple, color: string, options: PartOptions = {}): PropPart {
  return { shape: "cylinder", size: [diameter, height, diameter], at, color, tessellation: 8, ...options };
}

function ball(size: Vec3Tuple, at: Vec3Tuple, color: string, options: PartOptions = {}): PropPart {
  return { shape: "sphere", size, at, color, tessellation: 6, ...options };
}

/** A wheel standing upright, rolling along z. */
function wheel(diameter: number, width: number, at: Vec3Tuple, rim = "#9c9c9c"): PropPart[] {
  return [
    cyl(diameter, width, at, RUBBER, { rotDeg: [0, 0, 90], tessellation: 10 }),
    cyl(diameter * 0.55, width + 0.01, at, rim, { rotDeg: [0, 0, 90], tessellation: 8 }),
  ];
}

/** Underbone motorcycle, the most common thing parked outside anywhere. Body parts take the tint. */
function motorcycleParts(): PropPart[] {
  return [
    ...wheel(0.55, 0.1, [0, 0.275, 0.62]),
    ...wheel(0.55, 0.1, [0, 0.275, -0.62]),
    box([0.26, 0.32, 0.95], [0, 0.55, 0], "#ffffff", { layer: "tint" }),
    box([0.3, 0.3, 0.3], [0, 0.72, 0.5], "#ffffff", { layer: "tint", rotDeg: [-20, 0, 0] }),
    box([0.28, 0.08, 0.55], [0, 0.8, -0.22], "#161616"),
    box([0.05, 0.6, 0.05], [0, 0.6, 0.6], STEEL, { rotDeg: [-20, 0, 0] }),
    box([0.62, 0.04, 0.04], [0, 1.0, 0.55], STEEL),
    box([0.12, 0.08, 0.35], [0.12, 0.33, -0.45], "#3a3a3a"),
  ];
}

/** Concrete lamp post with a sodium cobra head reaching over the road along +z. */
function streetLampParts(height: number, reach: number, lens: string): PropPart[] {
  return [
    cyl(0.2, height, [0, height / 2, 0], CONCRETE_DARK),
    box([0.09, 0.09, reach], [0, height - 0.1, reach / 2], STEEL),
    box([0.36, 0.16, 0.62], [0, height - 0.15, reach], "#3a3a3a"),
    box([0.3, 0.04, 0.5], [0, height - 0.24, reach], lens, { layer: "glow" }),
  ];
}

export const PROP_KIT = {
  // ── utility ───────────────────────────────────────────────────────────────
  utility_pole: {
    category: "utility",
    description: "Concrete distribution pole with a timber crossarm. Wires attach at POLE_WIRE_HEIGHT.",
    parts: [
      cyl(0.3, 9, [0, 4.5, 0], "#8d8a82"),
      box([1.9, 0.12, 0.12], [0, 8.4, 0], "#5a4a3a"),
      ...POLE_WIRE_OFFSETS.map((x) => cyl(0.08, 0.14, [x, 8.53, 0], "#d9d4c7")),
      box([0.02, 1.6, 0.02], [0.18, 7.4, 0], "#202020"),
    ],
    collider: { size: [0.4, 9, 0.4], at: [0, 4.5, 0] },
  },
  utility_pole_transformer: {
    category: "utility",
    description: "Pole with a pole-top transformer can and the usual tangle of drop wires.",
    parts: [
      cyl(0.3, 9, [0, 4.5, 0], "#8d8a82"),
      box([1.9, 0.12, 0.12], [0, 8.4, 0], "#5a4a3a"),
      ...POLE_WIRE_OFFSETS.map((x) => cyl(0.08, 0.14, [x, 8.53, 0], "#d9d4c7")),
      cyl(0.62, 1.0, [0, 7.1, 0.38], "#6f7478"),
      box([0.5, 0.08, 0.3], [0, 6.55, 0.3], STEEL),
      box([0.03, 2.2, 0.03], [0.3, 6.6, 0.25], "#202020", { rotDeg: [0, 0, 12] }),
      box([0.03, 2.2, 0.03], [-0.25, 6.4, 0.2], "#202020", { rotDeg: [0, 0, -18] }),
    ],
    collider: { size: [0.7, 9, 0.7], at: [0, 4.5, 0.15] },
  },

  utility_box: {
    category: "utility",
    description: "Electric meter box with its conduit. Mount on a wall or pole (set y); faces +z.",
    parts: [
      box([0.35, 0.45, 0.15], [0, 0, 0.08], "#8a8f8a"),
      box([0.14, 0.12, 0.01], [0, 0.08, 0.16], "#cfd8d0"),
      box([0.04, 1.2, 0.04], [0, -0.8, 0.04], STEEL),
    ],
  },
  aircon_unit: {
    category: "utility",
    description: "Split-type aircon outdoor unit on brackets. Mount on a wall (set y); the fan grille faces +z.",
    parts: [
      box([0.8, 0.55, 0.3], [0, 0, 0.17], "#dcdcd6"),
      cyl(0.42, 0.02, [-0.1, 0, 0.33], "#3a3a3a", { rotDeg: [90, 0, 0], tessellation: 10 }),
      ...[-0.3, 0.3].map((x) => box([0.04, 0.04, 0.36], [x, -0.3, 0.18], STEEL)),
      box([0.03, 0.6, 0.03], [0.36, -0.5, 0.03], "#e8e8e0"),
    ],
  },

  // ── walls & drainage ──────────────────────────────────────────────────────
  concrete_wall_3m: {
    category: "wall",
    description: "3 m of plastered hollow-block perimeter wall with cap and pilaster. Tiled along wall runs.",
    parts: [
      box([3, 2, 0.15], [0, 1, 0], CONCRETE),
      box([3.04, 0.08, 0.22], [0, 2.04, 0], CONCRETE_DARK),
      box([0.28, 2.12, 0.28], [1.5, 1.06, 0], "#918c81"),
      box([3, 0.25, 0.17], [0, 0.125, 0], "#5f5a50"),
    ],
    collider: { size: [3, 2.1, 0.3], at: [0, 1.05, 0] },
  },
  concrete_wall_low_3m: {
    category: "wall",
    description: "Waist-high front wall with a painted gate-side post. Tiled along house frontages.",
    parts: [
      box([3, 1.1, 0.15], [0, 0.55, 0], "#a9a394"),
      box([3.04, 0.07, 0.22], [0, 1.13, 0], CONCRETE_DARK),
      box([0.28, 1.2, 0.28], [1.5, 0.6, 0], "#8b8f78"),
    ],
    collider: { size: [3, 1.2, 0.3], at: [0, 0.6, 0] },
  },
  steel_fence_3m: {
    category: "wall",
    description: "3 m black steel bar fence/gate panel, the kind that fronts every motorcycle corner.",
    parts: [
      ...[0.12, 1.1, 2.0].map((y) => box([3, 0.05, 0.05], [0, y, 0], "#1e2022")),
      ...[-1.5, 1.5].map((x) => box([0.08, 2.1, 0.08], [x, 1.05, 0], "#1e2022")),
      ...Array.from({ length: 11 }, (_, i) => box([0.025, 1.9, 0.025], [-1.25 + i * 0.25, 1.05, 0], "#1e2022")),
    ],
    collider: { size: [3, 2.1, 0.12], at: [0, 1.05, 0] },
  },
  canal_4m: {
    category: "drainage",
    description: "Open roadside drainage canal, 4 m. Low lips only, so a car can straddle it without a collider.",
    parts: [
      box([0.9, 0.02, 4], [0, 0.01, 0], "#141715"),
      box([0.16, 0.22, 4], [-0.53, 0.11, 0], CONCRETE_DARK),
      box([0.16, 0.22, 4], [0.53, 0.11, 0], CONCRETE_DARK),
      box([0.6, 0.015, 0.9], [0, 0.02, 1.2], "#1f2a1c"),
    ],
  },
  drain_grate: {
    category: "drainage",
    description: "Steel drain grate set in a concrete frame at a curb or driveway mouth.",
    parts: [
      box([1.0, 0.03, 0.6], [0, 0.015, 0], CONCRETE_DARK),
      box([0.8, 0.035, 0.42], [0, 0.02, 0], "#232323"),
    ],
  },
  culvert_end: {
    category: "drainage",
    description: "Concrete culvert headwall where the canal ducks under a driveway.",
    parts: [box([1.6, 0.5, 0.25], [0, 0.25, 0], CONCRETE_DARK), cyl(0.6, 0.3, [0, 0.3, 0.1], "#0e0f0e", { rotDeg: [90, 0, 0] })],
  },

  // ── signage ───────────────────────────────────────────────────────────────
  sign_roadside: {
    category: "signage",
    description: "Two-post roadside sign. The face is a glow part; tint it per placement (fictional brands only).",
    parts: [
      cyl(0.1, 3.3, [-1.1, 1.65, 0], STEEL),
      cyl(0.1, 3.3, [1.1, 1.65, 0], STEEL),
      box([2.6, 1.3, 0.1], [0, 2.7, 0], "#3a3a3a"),
      box([2.4, 1.1, 0.02], [0, 2.7, 0.06], "#ffffff", { layer: "glow" }),
    ],
    collider: { size: [2.6, 3.4, 0.3], at: [0, 1.7, 0] },
  },
  sign_pylon: {
    category: "signage",
    description: "Tall forecourt pylon (brand + price board). Faces glow on both sides; tint per brand.",
    parts: [
      box([0.3, 4, 0.3], [-0.8, 2, 0], "#2f2f2f"),
      box([0.3, 4, 0.3], [0.8, 2, 0], "#2f2f2f"),
      box([2.2, 2.8, 0.45], [0, 5.3, 0], "#2a2a2a"),
      box([2.0, 1.2, 0.02], [0, 6.0, 0.24], "#ffffff", { layer: "glow" }),
      box([2.0, 1.2, 0.02], [0, 6.0, -0.24], "#ffffff", { layer: "glow" }),
      box([1.8, 1.0, 0.02], [0, 4.6, 0.24], "#f2f2e8", { layer: "glow" }),
      box([1.8, 1.0, 0.02], [0, 4.6, -0.24], "#f2f2e8", { layer: "glow" }),
    ],
    collider: { size: [2.2, 6.7, 0.5], at: [0, 3.35, 0] },
  },
  sign_fascia: {
    category: "signage",
    description: "Shopfront fascia box, 6 m wide at scale 1. Mount on a facade at eave height; tint the face.",
    parts: [box([6.2, 1.1, 0.3], [0, 0, 0], "#2c2c2c"), box([5.9, 0.85, 0.02], [0, 0, 0.16], "#ffffff", { layer: "glow" })],
  },
  sign_tarp: {
    category: "signage",
    description: "Tarpaulin banner on a bamboo frame (vulcanizing, load, 'for sale'). Unlit; tinted.",
    parts: [
      cyl(0.07, 2.4, [-1.3, 1.2, 0], "#8a7a4a"),
      cyl(0.07, 2.4, [1.3, 1.2, 0], "#8a7a4a"),
      box([2.5, 1.1, 0.02], [0, 1.75, 0.04], "#ffffff", { layer: "tint" }),
    ],
  },
  sign_route: {
    category: "signage",
    description: "Green route/direction board on a single post (fictional place names).",
    parts: [cyl(0.1, 3, [0, 1.5, 0], STEEL), box([2.2, 0.9, 0.06], [0, 2.8, 0.05], "#1e5a38"), box([2.0, 0.08, 0.01], [0, 2.8, 0.09], "#e8e8e0", { layer: "glow" })],
    collider: { size: [0.3, 3.2, 0.3], at: [0, 1.6, 0] },
  },

  sign_aframe: {
    category: "signage",
    description: "Folding A-frame sidewalk sign (parking notice). The face takes the tint; walk-through.",
    parts: [
      box([0.62, 0.9, 0.03], [0, 0.6, 0.12], "#5a3a26", { rotDeg: [-12, 0, 0] }),
      box([0.54, 0.78, 0.01], [0, 0.61, 0.145], "#ffffff", { layer: "tint", rotDeg: [-12, 0, 0] }),
      box([0.62, 0.9, 0.03], [0, 0.6, -0.12], "#5a3a26", { rotDeg: [12, 0, 0] }),
    ],
  },

  // ── lighting fixtures ─────────────────────────────────────────────────────
  street_lamp: {
    category: "lighting",
    description: "Sodium street lamp; the head reaches 2.2 m along +z at 7 m. Pair with a `sodium` light.",
    parts: streetLampParts(7, 2.2, "#ffb45a"),
    collider: { size: [0.35, 7, 0.35], at: [0, 3.5, 0] },
  },
  fluorescent_tube: {
    category: "lighting",
    description: "Bare 4 ft fluorescent batten. Hang under talyer/store ceilings (set y).",
    parts: [box([1.25, 0.05, 0.1], [0, 0.03, 0], "#d8d8d4"), box([1.2, 0.035, 0.06], [0, 0, 0], "#e6fff0", { layer: "glow" })],
  },
  canopy_panel: {
    category: "lighting",
    description: "Recessed forecourt canopy light panel.",
    parts: [box([1.3, 0.05, 1.3], [0, 0.02, 0], "#bfc3c7"), box([1.15, 0.03, 1.15], [0, 0, 0], "#f4f8ff", { layer: "glow" })],
  },
  string_lights_6m: {
    category: "lighting",
    description: "Warm café string lights, 6 m along x with a slight sag. Set y at hang height.",
    parts: [
      box([6, 0.015, 0.015], [0, 0, 0], "#1a1a1a"),
      ...Array.from({ length: 9 }, (_, i): PropPart => {
        const x = -2.7 + i * 0.675;
        const sag = -0.3 * (1 - (x / 3) ** 2);
        return box([0.07, 0.1, 0.07], [x, sag - 0.06, 0], "#ffc070", { layer: "glow" });
      }),
    ],
  },
  porch_bulb: {
    category: "lighting",
    description: "Bare porch bulb on a bracket. Mount on a facade (set y).",
    parts: [box([0.08, 0.08, 0.3], [0, 0, -0.15], STEEL), box([0.12, 0.14, 0.12], [0, -0.08, 0], "#ffd9a0", { layer: "glow" })],
  },

  // ── shop clutter ──────────────────────────────────────────────────────────
  plastic_chair: {
    category: "clutter",
    description: "Monobloc chair. White by default; tint red/blue/green per placement.",
    parts: [
      box([0.46, 0.04, 0.44], [0, 0.44, 0], WHITE_PLASTIC, { layer: "tint" }),
      box([0.46, 0.42, 0.04], [0, 0.67, -0.21], WHITE_PLASTIC, { layer: "tint", rotDeg: [-10, 0, 0] }),
      ...[
        [-0.2, 0.19],
        [0.2, 0.19],
        [-0.2, -0.19],
        [0.2, -0.19],
      ].map(([x, z]) => box([0.04, 0.44, 0.04], [x, 0.22, z], WHITE_PLASTIC, { layer: "tint" })),
    ],
  },
  plastic_table: {
    category: "clutter",
    description: "Round monobloc table.",
    parts: [
      cyl(0.8, 0.03, [0, 0.72, 0], WHITE_PLASTIC, { layer: "tint", tessellation: 12 }),
      cyl(0.12, 0.7, [0, 0.36, 0], WHITE_PLASTIC, { layer: "tint" }),
      cyl(0.5, 0.03, [0, 0.015, 0], WHITE_PLASTIC, { layer: "tint" }),
    ],
  },
  folding_chair: {
    category: "clutter",
    description: "Steel folding café chair. Cream by default; tint per placement.",
    parts: [
      box([0.42, 0.03, 0.4], [0, 0.45, 0.02], "#ffffff", { layer: "tint" }),
      box([0.42, 0.28, 0.03], [0, 0.8, -0.2], "#ffffff", { layer: "tint", rotDeg: [-6, 0, 0] }),
      ...[-0.19, 0.19].flatMap((x) => [
        box([0.03, 0.46, 0.03], [x, 0.23, 0.18], "#ffffff", { layer: "tint" }),
        box([0.03, 0.94, 0.03], [x, 0.47, -0.2], "#ffffff", { layer: "tint", rotDeg: [-6, 0, 0] }),
      ]),
    ],
  },
  cafe_table: {
    category: "clutter",
    description: "Small square café table: timber top on a black pedestal.",
    parts: [
      box([0.7, 0.04, 0.7], [0, 0.74, 0], "#6b4a32"),
      cyl(0.08, 0.72, [0, 0.36, 0], "#1a1a1a"),
      box([0.5, 0.03, 0.5], [0, 0.015, 0], "#1a1a1a"),
    ],
  },
  tabletop_cups: {
    category: "clutter",
    description: "Iced coffees, a hot cup and a bottle for a table top (set y to the table height).",
    parts: [
      cyl(0.08, 0.1, [-0.12, 0.05, 0.1], "#f2efe8"),
      cyl(0.08, 0.13, [0.14, 0.065, -0.08], "#6a4028"),
      cyl(0.08, 0.13, [-0.1, 0.065, -0.14], "#8a5a38"),
      cyl(0.07, 0.24, [0.08, 0.12, 0.16], "#2f6a3a"),
    ],
  },
  patio_umbrella: {
    category: "clutter",
    description: "Large open market umbrella on a weighted base, 2.8 m across. Tint the fabric.",
    parts: [
      box([0.5, 0.08, 0.5], [0, 0.04, 0], "#2a2a2a"),
      cyl(0.05, 2.5, [0, 1.25, 0], "#d8d4c8"),
      cyl(2.8, 0.06, [0, 2.3, 0], "#ffffff", { layer: "tint" }),
      cyl(1.5, 0.14, [0, 2.4, 0], "#ffffff", { layer: "tint" }),
      ball([0.1, 0.1, 0.1], [0, 2.52, 0], STEEL),
    ],
  },
  umbrella_closed: {
    category: "clutter",
    description: "Market umbrella furled on its base, as it stands most of the day. Tint the fabric.",
    parts: [
      box([0.5, 0.1, 0.5], [0, 0.05, 0], "#1d1d1d"),
      cyl(0.05, 2.6, [0, 1.3, 0], "#d8d4c8"),
      cyl(0.24, 1.3, [0, 1.8, 0], "#ffffff", { layer: "tint", tessellation: 6 }),
      cyl(0.1, 0.25, [0, 2.55, 0], "#ffffff", { layer: "tint", tessellation: 6 }),
    ],
  },
  beer_crate_stack: {
    category: "clutter",
    description: "Three stacked plastic bottle crates. Tint per placement.",
    parts: [0, 1, 2].map((i) => box([0.46, 0.29, 0.33], [0, 0.15 + i * 0.3, i === 1 ? 0.03 : 0], "#ffffff", { layer: "tint" })),
  },
  water_jug: {
    category: "clutter",
    description: "Blue 5-gallon refill jug.",
    parts: [cyl(0.27, 0.42, [0, 0.21, 0], "#2f6fb8"), cyl(0.08, 0.08, [0, 0.46, 0], "#2f6fb8")],
  },
  lpg_tank: {
    category: "clutter",
    description: "11 kg LPG cylinder. Tint per placement.",
    parts: [cyl(0.32, 0.55, [0, 0.3, 0], "#ffffff", { layer: "tint" }), cyl(0.2, 0.08, [0, 0.62, 0], STEEL)],
  },
  ice_cooler: {
    category: "clutter",
    description: "Picnic cooler by the café or talyer door. Tint per placement.",
    parts: [box([0.75, 0.42, 0.42], [0, 0.21, 0], "#ffffff", { layer: "tint" }), box([0.77, 0.06, 0.44], [0, 0.45, 0], WHITE_PLASTIC)],
  },
  trash_drum: {
    category: "clutter",
    description: "Cut-down drum used as a trash bin.",
    parts: [cyl(0.55, 0.8, [0, 0.4, 0], "#3d4a3a")],
  },
  store_rack: {
    category: "clutter",
    description: "Outdoor snack/ice rack by a convenience store door. Tint the panel per brand.",
    parts: [box([1.2, 1.5, 0.45], [0, 0.75, 0], "#d0d0cc"), box([1.1, 0.3, 0.02], [0, 1.35, 0.24], "#ffffff", { layer: "glow" })],
  },
  dog_sleeping: {
    category: "clutter",
    description: "Askal asleep in the one spot everyone has to step around.",
    parts: [
      box([0.34, 0.2, 0.62], [0, 0.1, 0], "#8a6a45", { rotDeg: [0, 0, 8] }),
      box([0.2, 0.16, 0.22], [0.05, 0.09, 0.4], "#8a6a45"),
      box([0.06, 0.06, 0.35], [-0.05, 0.04, -0.45], "#6e5436", { rotDeg: [0, 30, 0] }),
    ],
  },

  // ── talyer ────────────────────────────────────────────────────────────────
  tire_stack: {
    category: "talyer",
    description: "Four used tires stacked flat.",
    parts: [0, 1, 2, 3].map((i) => cyl(0.62, 0.19, [0, 0.1 + i * 0.2, 0], RUBBER, { tessellation: 10 })),
  },
  loose_wheel: {
    category: "talyer",
    description: "A wheel leaning where somebody left it.",
    parts: wheel(0.6, 0.19, [0, 0.3, 0]).map((p) => ({ ...p, rotDeg: [0, 0, 80] as Vec3Tuple })),
  },
  oil_drum: {
    category: "talyer",
    description: "200 L drum. Tint per placement (blue, rust, green).",
    parts: [
      cyl(0.58, 0.88, [0, 0.44, 0], "#ffffff", { layer: "tint", tessellation: 10 }),
      cyl(0.6, 0.03, [0, 0.3, 0], "#2a2a2a"),
      cyl(0.6, 0.03, [0, 0.6, 0], "#2a2a2a"),
    ],
  },
  stand_fan: {
    category: "talyer",
    description: "Electric stand fan, the talyer's only climate control.",
    parts: [
      cyl(0.36, 0.05, [0, 0.03, 0], "#2d4e7a"),
      cyl(0.04, 1.1, [0, 0.58, 0], "#c8c8c8"),
      cyl(0.46, 0.12, [0, 1.2, 0], "#dcdcdc", { rotDeg: [90, 0, 0], tessellation: 12 }),
    ],
  },
  tool_cabinet: {
    category: "talyer",
    description: "Red rolling tool chest.",
    parts: [
      box([0.72, 1.0, 0.46], [0, 0.55, 0], "#9e241c"),
      ...[0.3, 0.55, 0.8].map((y) => box([0.6, 0.02, 0.01], [0, y, 0.235], "#c8c8c8")),
      ...[-0.3, 0.3].map((x) => cyl(0.08, 0.05, [x, 0.04, 0.15], RUBBER, { rotDeg: [0, 0, 90] })),
    ],
  },
  workbench: {
    category: "talyer",
    description: "Oily timber workbench with a vise.",
    parts: [
      box([2.0, 0.08, 0.7], [0, 0.88, 0], "#5d4a36"),
      ...[
        [-0.9, 0.3],
        [0.9, 0.3],
        [-0.9, -0.3],
        [0.9, -0.3],
      ].map(([x, z]) => box([0.08, 0.86, 0.08], [x, 0.43, z], "#4a3a2a")),
      box([0.2, 0.15, 0.2], [0.75, 1.0, 0.2], STEEL),
      box([1.9, 0.05, 0.6], [0, 0.25, 0], "#4a3a2a"),
    ],
    collider: { size: [2.0, 0.95, 0.7], at: [0, 0.47, 0] },
  },
  engine_block: {
    category: "talyer",
    description: "Pulled 4-cylinder on a pallet.",
    parts: [
      box([1.0, 0.1, 0.8], [0, 0.05, 0], "#6b5641"),
      box([0.62, 0.42, 0.42], [0, 0.31, 0], "#4b4b4d"),
      box([0.6, 0.12, 0.3], [0, 0.58, 0], "#6a2c24"),
    ],
  },
  spare_bumper: {
    category: "talyer",
    description: "Take-off bumper leaning on a wall. Tint to any paint colour.",
    parts: [box([1.65, 0.34, 0.2], [0, 0.45, 0], "#ffffff", { layer: "tint", rotDeg: [-18, 0, 0] })],
  },
  car_jack_stand: {
    category: "talyer",
    description: "Pair of jack stands and a trolley jack.",
    parts: [
      cyl(0.22, 0.45, [-0.4, 0.22, 0], "#b08a1c"),
      cyl(0.22, 0.45, [0.4, 0.22, 0], "#b08a1c"),
      box([0.3, 0.14, 0.9], [0, 0.07, 0.8], "#9e241c"),
    ],
  },
  wall_calendar: {
    category: "talyer",
    description: "Hardware-store calendar on the wall. Mount on a wall (set y ≈ 1.6).",
    parts: [box([0.36, 0.52, 0.01], [0, 0, 0], "#efe8d8"), box([0.36, 0.14, 0.012], [0, 0.19, 0], "#a8261e")],
  },
  welding_set: {
    category: "talyer",
    description: "Transformer welder on a cart with its gas bottle.",
    parts: [box([0.5, 0.45, 0.35], [0, 0.35, 0], "#c46d18"), cyl(0.22, 1.1, [0, 0.55, -0.3], "#2f5d3a"), box([0.55, 0.05, 0.7], [0, 0.1, -0.1], STEEL)],
  },

  // ── parked two/three-wheelers ─────────────────────────────────────────────
  motorcycle_parked: {
    category: "vehicle",
    description: "Parked underbone motorcycle. Tint the bodywork per placement.",
    parts: motorcycleParts(),
    collider: { size: [0.7, 1.1, 1.8], at: [0, 0.55, 0] },
  },
  tricycle_parked: {
    category: "vehicle",
    description: "Low-detail tricycle placeholder: motorcycle plus sidecar with a roof. Tint the sidecar.",
    parts: [
      ...motorcycleParts(),
      box([0.95, 1.0, 1.55], [0.85, 0.95, -0.05], "#ffffff", { layer: "tint" }),
      box([0.8, 0.5, 0.02], [0.85, 1.1, 0.74], "#1a1d20"),
      box([1.9, 0.06, 1.9], [0.45, 1.75, -0.05], "#262626"),
      box([0.05, 0.9, 0.05], [0.05, 1.3, 0.7], STEEL),
      ...wheel(0.45, 0.1, [1.3, 0.225, -0.1]),
    ],
    collider: { size: [2.0, 1.8, 2.0], at: [0.45, 0.9, -0.05] },
  },

  // ── barriers ──────────────────────────────────────────────────────────────
  bollard: {
    category: "barrier",
    description: "Concrete bollard with a painted band. Keeps cars off walking areas.",
    parts: [cyl(0.22, 0.9, [0, 0.45, 0], "#b5ae9c"), cyl(0.23, 0.12, [0, 0.72, 0], "#c9a227")],
    collider: { size: [0.25, 0.9, 0.25], at: [0, 0.45, 0] },
  },
  bollard_round: {
    category: "barrier",
    description: "Round painted bollard along a café frontage. Tint per placement (black at Kyo).",
    parts: [cyl(0.24, 0.8, [0, 0.4, 0], "#ffffff", { layer: "tint" }), cyl(0.26, 0.05, [0, 0.82, 0], "#2a2a2a")],
    collider: { size: [0.26, 0.85, 0.26], at: [0, 0.425, 0] },
  },
  post_slim: {
    category: "barrier",
    description: "Slim painted steel post on a base plate. Tint per placement (pink at Kyo).",
    parts: [box([0.3, 0.05, 0.3], [0, 0.025, 0], "#3a3a3a"), cyl(0.1, 1.2, [0, 0.625, 0], "#ffffff", { layer: "tint" })],
    collider: { size: [0.15, 1.25, 0.15], at: [0, 0.625, 0] },
  },
  planter_box: {
    category: "barrier",
    description: "Concrete planter with shrubs. Edge for café terraces and store walkways.",
    parts: [
      box([1.4, 0.5, 0.5], [0, 0.25, 0], CONCRETE),
      ball([0.6, 0.45, 0.45], [-0.35, 0.65, 0], FOLIAGE_LIGHT),
      ball([0.6, 0.5, 0.45], [0.35, 0.66, 0], FOLIAGE),
    ],
    collider: { size: [1.4, 0.6, 0.5], at: [0, 0.3, 0] },
  },
  curb_stop: {
    category: "barrier",
    description: "Parking wheel stop.",
    parts: [box([1.6, 0.12, 0.2], [0, 0.06, 0], "#a7a296")],
  },

  // ── vegetation ────────────────────────────────────────────────────────────
  tree_mango: {
    category: "vegetation",
    description: "Big old mango tree: the default shade over any wall or corner.",
    parts: [
      cyl(0.4, 3.0, [0, 1.5, 0], "#4a3b2c"),
      ball([5.5, 3.6, 5.2], [0, 4.6, 0], FOLIAGE),
      ball([3.4, 2.4, 3.2], [1.3, 5.6, -0.6], "#244428"),
    ],
    collider: { size: [0.5, 3, 0.5], at: [0, 1.5, 0] },
  },
  banana_plant: {
    category: "vegetation",
    description: "Backyard banana plant.",
    parts: [
      cyl(0.2, 1.7, [0, 0.85, 0], "#4d5a33"),
      ...[0, 72, 144, 216, 288].map((yaw) =>
        box([0.4, 0.03, 1.6], [0, 1.85, 0], FOLIAGE_LIGHT, { rotDeg: [-30, yaw, 0] }),
      ),
    ],
  },
  bush: {
    category: "vegetation",
    description: "Roadside shrub/weed clump.",
    parts: [ball([1.7, 1.0, 1.4], [0, 0.45, 0], "#22401f")],
  },
  potted_plant: {
    category: "vegetation",
    description: "Snake plant in a dark pot by a shop door.",
    parts: [
      cyl(0.45, 0.45, [0, 0.225, 0], "#3a3a38"),
      ...[0, 72, 144, 216, 288].map((yaw) => box([0.08, 0.7, 0.2], [0, 0.75, 0], FOLIAGE_LIGHT, { rotDeg: [12, yaw, 0] })),
      ball([0.4, 0.3, 0.4], [0, 0.5, 0], FOLIAGE),
    ],
  },
  coconut_palm: {
    category: "vegetation",
    description: "Leaning coconut palm.",
    parts: [
      cyl(0.28, 8, [0.3, 4, 0], "#6a5a44", { rotDeg: [0, 0, -4] }),
      ...[0, 60, 120, 180, 240, 300].map((yaw) => box([0.5, 0.03, 3.2], [0.6, 7.9, 0], FOLIAGE_LIGHT, { rotDeg: [25, yaw, 0] })),
    ],
    collider: { size: [0.4, 8, 0.4], at: [0.3, 4, 0] },
  },

  // ── fuel ──────────────────────────────────────────────────────────────────
  fuel_island: {
    category: "fuel",
    description: "Pump island with two dispensers. The display strips glow; tint them per brand.",
    parts: [
      box([1.3, 0.2, 4.2], [0, 0.1, 0], "#b0aca3"),
      ...[-1.1, 1.1].flatMap((z) => [
        box([0.8, 1.8, 0.5], [0, 1.1, z], "#e6e6e6"),
        box([0.82, 0.25, 0.52], [0, 1.9, z], "#ffffff", { layer: "glow" }),
        box([0.5, 0.25, 0.01], [0.41, 1.35, z], "#9fe0ff", { layer: "glow" }),
        box([0.5, 0.25, 0.01], [-0.41, 1.35, z], "#9fe0ff", { layer: "glow" }),
      ]),
      box([0.25, 0.9, 0.25], [0, 0.45, 1.95], "#c9a227"),
      box([0.25, 0.9, 0.25], [0, 0.45, -1.95], "#c9a227"),
    ],
    collider: { size: [1.3, 2.0, 4.2], at: [0, 1.0, 0] },
  },
  air_water_stand: {
    category: "fuel",
    description: "Air/water service post at the forecourt edge.",
    parts: [box([0.4, 1.3, 0.3], [0, 0.65, 0], "#d7d2c6"), box([0.3, 0.25, 0.01], [0, 1.0, 0.16], "#8fd0ff", { layer: "glow" })],
  },
} satisfies Record<string, PropDefinition>;

export type PropId = keyof typeof PROP_KIT;

export function isPropId(id: string): id is PropId {
  return id in PROP_KIT;
}
