import { filletPolyline, LayoutAuthor, rect } from "../layoutTools";
import { pixelText } from "../pixelFont";
import type { Vec3Tuple } from "../props/PropDefinition";
import type { LocationData, RoadPoint, Vec2, WorldLayout } from "../WorldLayout";

/**
 * Vertical-slice hub greybox (GAME_VISION §8, ART_DIRECTION §7, TECH_ARCHITECTURE §12):
 * a compact, fictionalised Iloilo-edge neighbourhood on one drivable loop.
 *
 * ```text
 *   z 200 ┌──────── perimeter wall / backyards ───────────────────────────┐
 *         │  HOME (NW)          TALYER (N)             COFFEE SHOP (NE)   │
 *   z 140 │  ╭───────────── barangay street (9 m) ─────────────╮          │
 *         │  │ houses            basketball court              │ café     │
 *         │  │ (10 m)                                          │ (10 m)   │
 *    z 70 ├──┼──────────────────────┼──────────────────────────┼──────────┤ ← chunk seam
 *         │  │ CONVENIENCE STORE    │ GAS STATION              │          │
 *     z 0 ═══╯══════════════ main road (12 m) ═════════════════╧══════ ══ exit → mountain
 *         │  canal · poles · houses across the road                       │
 *   z −60 └───────────────────────────────────────────────────────────────┘
 *        x −160       −20                   70                        250
 * ```
 *
 * Chunks (one per location) tile the bounds; `LayoutAuthor.partition` clips roads at the
 * seams. Traffic drives on the right. Everything is placeholder: the job of this file is
 * driving flow and recognisability, not final art. See docs/HUB_LAYOUT.md.
 */

const DEG = Math.PI / 180;

/** Centreline radius of every loop corner: ~50 km/h at 0.9 g, comfortably inside the sedan's lock. */
export const LOOP_CORNER_RADIUS = 22;

export const HUB_BOUNDS = rect(-160, -70, 250, 210);

const CHUNKS = [
  { id: "convenience_store", rect: rect(-160, -70, -20, 70) },
  { id: "gas_station", rect: rect(-20, -70, 70, 70) },
  { id: "main_road", rect: rect(70, -70, 250, 70) },
  { id: "home", rect: rect(-160, 70, -20, 210) },
  { id: "talyer", rect: rect(-20, 70, 70, 210) },
  { id: "coffee_shop", rect: rect(70, 70, 250, 210) },
] as const;

// Fictional brands (ART_DIRECTION §7): colours evoke the category, not a real chain. The one
// exception is Kyo Coffee, built after the real café on purpose (see coffeeShop).
const BRAND = {
  fuel: "#19b58a",
  fuelAccent: "#f2f2e8",
  store: "#2f6bff",
  storeAccent: "#ffd23a",
  talyerTarp: "#e8e2d0",
};

const WALL = { cream: "#a89f8a", sage: "#8f9a85", sand: "#b3a58c", blue: "#8a8f99", pink: "#a8908c" };
const ROOF = { rust: "#5b3a2c", gi: "#4a4f55", green: "#3f5245" };

/** Loop corners in driving order (clockwise from the store end of the main road). */
const LOOP_CORNERS: RoadPoint[] = [
  { x: 0, z: 0, width: 12 },
  { x: -110, z: 0, width: 12 },
  { x: -110, z: 50, width: 10 },
  { x: -110, z: 140, width: 9 },
  { x: 120, z: 140, width: 9 },
  { x: 120, z: 50, width: 10 },
  { x: 120, z: 0, width: 12 },
  { x: 0, z: 0, width: 12 },
];

const a = new LayoutAuthor();

// ── roads ───────────────────────────────────────────────────────────────────
const loop = filletPolyline(LOOP_CORNERS, LOOP_CORNER_RADIUS);
// The south leg is the main road itself; drawing it twice would z-fight. The cut ends sit
// inside the main road's width even at the slant where they leave the corner arcs.
a.road({ id: "loop", kind: "connector", points: loop.filter((p) => p.z >= 3), markings: "centre_dashed" });
// Main road runs straight through the south of the loop: west stub to the city, east to the mountain.
a.road({
  id: "main_road",
  kind: "main",
  markings: "centre_and_edges",
  points: [
    { x: -152, z: 0, width: 12 },
    { x: 215, z: 0, width: 12 },
    { x: 232, z: 0, width: 9 },
    { x: 246, z: 0, width: 9 },
  ],
});
a.road({ id: "home_driveway", kind: "driveway", markings: "none", points: [{ x: -78, z: 143, width: 4 }, { x: -78, z: 150, width: 4 }] });

// ── shared roadside: canal, poles, street lamps, perimeter ──────────────────
for (let x = -148; x < 240; x += 4) a.prop("canal_4m", [x, -9.2], { rotDeg: 90 });
// Poles stay out of the loop's corner arcs and the forecourt/parking mouths.
a.poleLine(range(-148, 244, 36).map((x): Vec2 => [x, -12.5]), 3);
a.poleLine(range(-80, 95, 30).map((x): Vec2 => [x, 134]), 4, 1.1);
a.poleLine(range(40, 100, 30).map((z): Vec2 => [113.5, z]), 3);
for (const x of [-140, -95, -50, -5, 40, 85, 130, 175, 215]) a.streetLamp(`lamp_main_${x}`, [x, -7.5], 0);
for (const z of [45, 100]) a.streetLamp(`lamp_west_${z}`, [-116.5, z], 90);
for (const z of [40, 70]) a.streetLamp(`lamp_east_${z}`, [114, z], 90);
a.streetLamp("lamp_north_-40", [-40, 145.5], 180);
a.streetLamp("lamp_north_60", [60, 145.5], 180);

a.wallRun([-158, -58], [248, -58]);
a.wallRun([248, 198], [-158, 198]);
a.wallRun([-158, 198], [-158, 8]);
a.wallRun([-158, -8], [-158, -58]);
a.wallRun([248, -58], [248, -7]);
a.wallRun([248, 7], [248, 198]);
// Road ends: the city stub and the mountain exit are closed until those chunks exist.
roadClosure([-154, 0], 90, "city");
roadClosure([244, 0], 270, "mountain");
a.prop("sign_route", [226, 7.5], { rotDeg: 270 });
a.prop("sign_route", [-146, -7.5], { rotDeg: 90 });
a.surface({ kind: "gravel", center: [236, 0], size: [20, 24] });

// Houses facing the main road from the south, and backyard greenery everywhere.
southRoadsideHouses();
vegetation();

// ── locations ───────────────────────────────────────────────────────────────
home();
talyer();
coffeeShop();
gasStation();
convenienceStore();
innerBlock();

export const HUB_LOCATIONS: readonly LocationData[] = [
  {
    id: "home",
    name: "Home",
    chunk: "home",
    area: rect(-92, 144.5, -62, 175),
    spawn: { x: -78, z: 151.5, headingDeg: 180 },
    returnPoint: { x: -70, z: 137.5, headingDeg: 90 },
  },
  {
    id: "talyer",
    name: "Talyer ni Mang Boy",
    chunk: "talyer",
    area: rect(4, 144.5, 50, 170),
    spawn: { x: 16, z: 158, headingDeg: 180 },
    returnPoint: { x: 25, z: 137.5, headingDeg: 90 },
  },
  {
    id: "coffee_shop",
    name: "Kyo Coffee",
    chunk: "coffee_shop",
    area: rect(125, 82, 166, 126),
    spawn: { x: 131, z: 97, headingDeg: 270 },
    returnPoint: { x: 117.5, z: 100, headingDeg: 180 },
  },
  {
    id: "gas_station",
    name: "Bahandi Fuels",
    chunk: "gas_station",
    area: rect(-6, 6, 58, 46),
    spawn: { x: 25, z: 24, headingDeg: 90 },
    returnPoint: { x: 25, z: -3, headingDeg: 90 },
  },
  {
    id: "convenience_store",
    name: "Suki 24",
    chunk: "convenience_store",
    area: rect(-86, 6, -50, 38),
    spawn: { x: -71, z: 13, headingDeg: 180 },
    returnPoint: { x: -68, z: -3, headingDeg: 90 },
  },
  {
    id: "main_road",
    name: "Main Road — to the mountain",
    chunk: "main_road",
    area: rect(195, -14, 248, 14),
    spawn: { x: 210, z: 3, headingDeg: 270 },
    returnPoint: { x: 190, z: 3, headingDeg: 270 },
  },
];

export const HUB_LAYOUT: WorldLayout = {
  id: "hub",
  bounds: HUB_BOUNDS,
  chunks: a.partition(CHUNKS),
  locations: HUB_LOCATIONS,
  loop: loop.map(({ x, z }): Vec2 => [x, z]),
};

// ─────────────────────────────────────────────────────────────────────────────

function home() {
  // Player's bungalow: low front wall with a gate gap, carport, porch bulb.
  a.surface({ kind: "concrete", center: [-78, 150.5], size: [8, 11] });
  a.surface({ kind: "grass", center: [-85.5, 157], size: [7, 22] });
  a.wallRun([-90, 145.5], [-80.5, 145.5], "concrete_wall_low_3m");
  a.wallRun([-75.5, 145.5], [-66, 145.5], "concrete_wall_low_3m");
  a.wallRun([-90, 172], [-90, 145.8]);
  a.wallRun([-66, 145.8], [-66, 172]);
  house([-77, 164], [18, 12], { wall: WALL.cream, roof: ROOF.rust, facingDeg: 180 });
  // Carport roof on two posts.
  a.block({ center: [-78, 3.0, 152], size: [7, 0.15, 8], color: ROOF.gi });
  for (const [x, z] of [[-81.2, 148.4], [-74.8, 148.4]] as const) a.block({ center: [x, 1.5, z], size: [0.2, 3, 0.2], color: "#6b6b6b", collide: true });
  a.prop("porch_bulb", [-80.8, 145.7], { y: 2.3, rotDeg: 180 });
  a.lamp({ id: "home_porch", at: [-80.8, 2.2, 145.3], profile: "porch" });
  a.lamp({ id: "home_window", at: [-72, 1.8, 156.5], profile: "porch", strength: 0.6 });
  a.prop("plastic_chair", [-85, 150], { rotDeg: 120, tint: "#c23a2a" });
  a.prop("plastic_chair", [-86.4, 152], { rotDeg: 80, tint: "#c23a2a" });
  a.prop("water_jug", [-84, 157.5]);
  a.prop("lpg_tank", [-83.6, 158.2], { tint: "#2f7a5a" });
  a.prop("motorcycle_parked", [-83, 154], { rotDeg: 180, tint: "#1f3f8a" });
  a.prop("banana_plant", [-87.5, 166]);
  a.prop("tree_mango", [-70, 176]);
  a.zone({ id: "home_yard", kind: "walk", rect: rect(-89.5, 147, -82, 162), locationId: "home" });
  a.zone({ id: "home_carport", kind: "parking", rect: rect(-82, 146, -74, 156), locationId: "home" });
  a.zone({ id: "home_gate", kind: "interact", rect: rect(-80.5, 144.5, -75.5, 147), locationId: "home" });

  // Neighbours on both sides and across the street.
  house([-112, 160], [14, 11], { wall: WALL.sage, roof: ROOF.gi, facingDeg: 180, window: true });
  a.wallRun([-120, 146], [-104, 146], "concrete_wall_low_3m");
  house([-50, 158], [14, 12], { wall: WALL.pink, roof: ROOF.rust, facingDeg: 180, window: true });
  a.wallRun([-58, 146], [-42, 146], "concrete_wall_low_3m");
  a.lamp({ id: "neighbour_porch", at: [-50, 2.4, 151.5], profile: "porch", strength: 0.7 });
  house([-128, 184], [12, 10], { wall: WALL.sand, roof: ROOF.green, facingDeg: 90 });
  house([-60, 186], [16, 10], { wall: WALL.blue, roof: ROOF.gi, facingDeg: 180 });
  house([-92, 118], [16, 12], { wall: WALL.sand, roof: ROOF.rust, facingDeg: 0, window: true });
  house([-62, 116], [14, 12], { wall: WALL.sage, roof: ROOF.gi, facingDeg: 0 });
  a.wallRun([-100, 126], [-54, 126], "concrete_wall_low_3m");
  a.prop("tricycle_parked", [-66, 130], { rotDeg: 90, tint: "#1c6a4a" });
  a.prop("sign_tarp", [-100, 129], { rotDeg: 0, tint: "#d8d0b8" });
  a.prop("dog_sleeping", [-88, 144.4], { rotDeg: 70 });
}

function talyer() {
  // Open-front shed: back wall, two side walls, GI roof overhanging the apron.
  a.surface({ kind: "concrete", center: [26, 150], size: [42, 10] });
  a.surface({ kind: "concrete", center: [24, 160], size: [32, 16] });
  const roofY = 4.4;
  a.block({ center: [24, roofY / 2, 168.2], size: [33, roofY, 0.3], color: "#8d887c", collide: true });
  a.block({ center: [7.8, roofY / 2, 160], size: [0.3, roofY, 16.6], color: "#8d887c", collide: true });
  a.block({ center: [40.2, roofY / 2, 160], size: [0.3, roofY, 16.6], color: "#8d887c", collide: true });
  a.block({ center: [24, 1.2, 168.4], size: [33, 0.3, 0.05], color: "#5a3c2a" });
  a.block({ center: [24, roofY + 0.15, 159], size: [35, 0.18, 20], color: ROOF.rust });
  for (const x of [8, 24, 40]) a.block({ center: [x, roofY / 2, 150.4], size: [0.25, roofY, 0.25], color: "#5d6166", collide: true });
  // Bay divider and grease pit edges.
  a.block({ center: [24, 0.5, 164], size: [0.4, 1, 8], color: "#8d887c", collide: true });

  for (const [x, z] of [[16, 158], [32, 158], [16, 152.5], [32, 152.5]] as const) {
    a.prop("fluorescent_tube", [x, z], { y: roofY - 0.25, rotDeg: 90 });
  }
  a.lamp({ id: "talyer_bay_1", at: [16, 3.9, 158], profile: "fluorescent" });
  a.lamp({ id: "talyer_bay_2", at: [32, 3.9, 158], profile: "fluorescent" });
  a.lamp({ id: "talyer_apron", at: [24, 3.9, 151], profile: "fluorescent", strength: 0.8 });
  a.prop("fluorescent_tube", [44, 153], { y: 2.8 });
  a.lamp({ id: "talyer_waiting", at: [44, 2.7, 153], profile: "fluorescent", strength: 0.6 });

  a.prop("workbench", [14, 167.2], { rotDeg: 180 });
  a.prop("tool_cabinet", [19, 167.4], { rotDeg: 180 });
  a.prop("wall_calendar", [11, 168], { y: 1.7, rotDeg: 180 });
  a.prop("wall_calendar", [29, 168], { y: 1.8, rotDeg: 180 });
  a.prop("workbench", [34, 167.2], { rotDeg: 180 });
  a.prop("tire_stack", [9.2, 153]);
  a.prop("tire_stack", [9.3, 154.4]);
  a.prop("tire_stack", [38.8, 166.5]);
  a.prop("loose_wheel", [10, 161], { rotDeg: 90 });
  a.prop("loose_wheel", [10.2, 162.2], { rotDeg: 95 });
  a.prop("oil_drum", [9.4, 166.8], { tint: "#2d4e7a" });
  a.prop("oil_drum", [10.2, 167.1], { tint: "#7a4a2e" });
  a.prop("oil_drum", [39, 163], { tint: "#2f5d3a" });
  a.prop("engine_block", [27, 165]);
  a.prop("spare_bumper", [36, 167.6], { tint: "#a31f1f" });
  a.prop("spare_bumper", [31, 167.7], { tint: "#dadddf" });
  a.prop("stand_fan", [22.5, 166], { rotDeg: 200 });
  a.prop("welding_set", [38.5, 158], { rotDeg: 270 });
  a.prop("car_jack_stand", [28, 155], { rotDeg: 90 });
  a.prop("motorcycle_parked", [38, 152.5], { rotDeg: 200, tint: "#8a1f1f" });
  a.prop("dog_sleeping", [21, 147.5], { rotDeg: 30 });
  a.prop("sign_tarp", [3, 147], { rotDeg: 0, tint: BRAND.talyerTarp });
  a.prop("sign_roadside", [48, 146.2], { rotDeg: 0, tint: "#e0d8c4" });

  // Tambay corner beside the shed.
  a.surface({ kind: "concrete", center: [45, 157], size: [9, 16] });
  for (const [x, z, r, tint] of [
    [43, 155, 210, "#c23a2a"],
    [45, 155.5, 160, "#e7e4dc"],
    [44, 157.5, 250, "#2a5cb0"],
  ] as const) {
    a.prop("plastic_chair", [x, z], { rotDeg: r, tint });
  }
  a.prop("plastic_table", [44.5, 156.5], { tint: "#e7e4dc" });
  a.prop("ice_cooler", [47.5, 159], { tint: "#2a5cb0" });
  a.prop("beer_crate_stack", [47.8, 161], { tint: "#c9a227" });
  for (const x of [41, 44, 47]) a.prop("bollard", [x, 149.2]);
  a.wallRun([40.6, 165], [49.5, 165]);

  a.zone({
    id: "talyer_waiting",
    kind: "walk",
    rect: rect(40.5, 150, 49.5, 164.5),
    locationId: "talyer",
    interaction: { action: "hang_out", label: "Tambay muna", dialogueId: "talyer_tambay" },
  });
  for (const [id, r] of [
    ["talyer_bay_1", rect(8.5, 151, 23.5, 167.5)],
    ["talyer_bay_2", rect(24.5, 151, 39.5, 167.5)],
  ] as const) {
    a.zone({
      id,
      kind: "interact",
      rect: r,
      locationId: "talyer",
      interaction: { action: "talk_mechanic", label: "Talk to Mang Boy", dialogueId: "talyer_mang_boy" },
    });
  }
  a.zone({ id: "talyer_apron", kind: "parking", rect: rect(5, 145, 40, 150), locationId: "talyer" });

  // Neighbours: sari-sari store house and a vacant lot with tall grass.
  house([-5, 160], [14, 12], { wall: WALL.sand, roof: ROOF.gi, facingDeg: 180, window: true });
  a.prop("sign_roadside", [-5, 149], { rotDeg: 0, tint: "#ffe9b0" });
  a.lamp({ id: "sari_sari", at: [-5, 2.4, 153.5], profile: "porch" });
  house([58, 184], [14, 12], { wall: WALL.blue, roof: ROOF.rust, facingDeg: 180 });
  house([12, 186], [18, 10], { wall: WALL.cream, roof: ROOF.green, facingDeg: 180 });
}

function coffeeShop() {
  // Kyo Coffee on the ground floor of the KLMB Bldg., modelled on the real place so Ilonggo
  // players know it on sight (the one real brand in the hub, on purpose). Three storeys: white
  // facade, dark slab bands with glass-railed balconies, a dark-glass stair tower on the south
  // end, wood soffit under the roof. The black-framed glass front faces the connector road
  // (−x). Out front: a bare concrete apron to park on, black bollards and pink posts; to the
  // south the gravel lot behind its white wall; to the north the fenced motorcycle corner.
  const glass = 140.6;
  const f2 = 3.9;
  const f3 = 7.25;
  const white = "#d9d6ce";
  const band = "#35363a";
  const frame = "#141414";

  a.surface({ kind: "concrete", center: [130.65, 98], size: [11.3, 28] });
  a.surface({ kind: "tile", center: [138.45, 103], size: [4.3, 18] });
  a.surface({ kind: "gravel", center: [150.65, 85], size: [28.7, 18] });
  a.surface({ kind: "gravel", center: [130.65, 80], size: [11.3, 8] });
  a.surface({ kind: "gravel", center: [158, 100], size: [14, 12] });
  a.surface({ kind: "dirt", center: [152.8, 115], size: [24.4, 18] });

  // ── building mass ──
  a.block({ center: [(glass + 151) / 2, 1.7, 101], size: [151 - glass, 3.4, 10], color: white, collide: true });
  a.block({ center: [145.5, 7.05, 101], size: [11, 6.3, 10], color: white, collide: true });
  for (const [z0, z1] of [[105.4, 106], [99.4, 100.2], [96, 97.2]] as const) {
    a.block({ center: [(140 + glass) / 2, 1.7, (z0 + z1) / 2], size: [glass - 140, 3.4, z1 - z0], color: white, collide: true });
  }
  a.block({ center: [140.1, 0.05, 101], size: [1.2, 0.1, 10], color: "#8f8b83" });
  // Dark slab bands: the 2nd-floor one runs the full width and carries the storefront sign.
  a.block({ center: [145, 3.65, 101], size: [12, 0.5, 10.2], color: band });
  a.block({ center: [139.66, 7.02, 102.3], size: [0.72, 0.45, 7.6], color: band });
  // Stair tower in dark glass, floor lines and a cool reflection.
  a.block({ center: [140, 7, 97.2], size: [1, 6.2, 2.6], color: "#1b2638" });
  for (const y of [f3, 9.6]) a.block({ center: [139.49, y, 97.2], size: [0.02, 0.08, 2.6], color: "#0e131c" });
  a.block({ center: [139.48, 7, 97.9], size: [0.02, 6.1, 0.35], color: "#2d4466" });
  // Roof slab with the wood soffit and downlights along the front.
  a.block({ center: [145.1, 10.4, 101], size: [12.6, 0.4, 10.8], color: "#ecebe6" });
  a.block({ center: [139.4, 10.15, 101], size: [1.2, 0.1, 10.8], color: "#8a5a3a" });
  for (const z of [98, 101, 104]) a.block({ center: [139.4, 10.09, z], size: [0.14, 0.02, 0.14], color: "#fff0cc", glow: true });
  // Solar panels on the roof, as seen from above.
  for (const x of [144.5, 147.5]) a.block({ center: [x, 10.68, 101], size: [2.6, 0.08, 8], color: "#1d2a44" });

  // ── ground floor: black-framed glass, warm café behind it ──
  const bays: [number, number, string][] = [
    [100.2, 105.4, "#eeb27a"],
    [97.2, 99.4, "#d89a66"],
  ];
  for (const [z0, z1, wall] of bays) {
    const zc = (z0 + z1) / 2;
    const w = z1 - z0;
    a.block({ center: [glass, 0.45, zc], size: [0.04, 0.9, w], color: "#9a5a34", glow: true });
    a.block({ center: [glass, 1.8, zc], size: [0.04, 1.8, w], color: wall, glow: true });
    a.block({ center: [glass, 2.83, zc], size: [0.04, 0.26, w], color: "#ffe2b0", glow: true });
    a.block({ center: [140.5, 2.45, zc], size: [0.08, 0.06, w], color: frame });
    a.block({ center: [140.5, 3.18, zc], size: [0.08, 0.44, w], color: frame });
    a.block({ center: [140.5, 0.13, zc], size: [0.08, 0.06, w], color: frame });
  }
  for (const z of [100.25, 102.4, 103.6, 105.35, 97.25, 99.35]) a.block({ center: [140.5, 1.5, z], size: [0.08, 3, 0.08], color: frame });
  a.block({ center: [140.42, 1.05, 102.55], size: [0.05, 0.6, 0.04], color: "#b8bcc0" });
  // Interior read through the glass: counter, espresso machine, menu board, pendants, seats.
  const inside = (center: Vec3Tuple, size: [number, number], color: string) =>
    a.block({ center: [140.56, center[1], center[2]], size: [0.03, size[0], size[1]], color, glow: true });
  inside([0, 0.52, 104.5], [1.05, 1.4], "#3b2418");
  inside([0, 1.22, 104.45], [0.34, 0.5], "#5e5e5e");
  inside([0, 1.95, 104.5], [0.7, 1.4], "#2a1a12");
  for (const y of [1.8, 1.95, 2.1]) inside([0, y, 104.5], [0.03, 1.1], "#f4e2c0");
  for (const z of [100.9, 102.9, 104.6]) inside([0, 2.3, z], [0.18, 0.18], "#fff4d6");
  for (const z of [101.1, 101.9]) inside([0, 0.7, z], [0.5, 0.3], "#2a1a12");
  inside([0, 0.74, 101.5], [0.05, 0.7], "#2a1a12");
  for (let y = 1.2; y < 2.8; y += 0.25) inside([0, y, 98.3], [0.03, 2.1], "#b07048");
  inside([0, 0.6, 98.3], [1.2, 1.0], "#1f3a24");
  // Vertical Kyo logo panel on the glass beside the door.
  a.block({ center: [140.49, 1.9, 100.9], size: [0.02, 1.3, 0.5], color: "#f4efe6", glow: true });
  [..."KYO"].forEach((ch, i) => signText(ch, 140.48, 2.45 - i * 0.4, 100.9, 0.05, "#b8322a"));
  // The storefront sign on the slab band, with downlights under it.
  signText("KYO COFFEE", 139, 3.86, 102.8, 0.06, "#fff1d6");
  for (const z of [98, 100, 102, 104]) a.block({ center: [139.4, 3.39, z], size: [0.14, 0.02, 0.14], color: "#ffe6b8", glow: true });

  // ── upper floors: balconies, wood-framed windows, KLMB Bldg. lettering ──
  for (const [base, railX] of [[f2, 139.12], [f3, 139.4]] as const) {
    for (let z = 98.7; z <= 106; z += 1.2) a.block({ center: [railX, base + 0.52, z], size: [0.05, 1.05, 0.05], color: "#b8bcc0" });
    a.block({ center: [railX, base + 1.06, 102.2], size: [0.06, 0.05, 7.4], color: "#c8ccd0" });
    a.block({ center: [railX, base + 0.06, 102.2], size: [0.06, 0.06, 7.4], color: "#8e959c" });
    a.block({ center: [139.97, base + 1.15, 102.2], size: [0.06, 2.1, 2.0], color: "#6b3f24" });
    a.block({ center: [139.93, base + 1.15, 102.2], size: [0.03, 1.9, 1.8], color: base === f3 ? "#b88a5c" : "#161c26", glow: base === f3 });
    a.block({ center: [139.9, base + 1.15, 102.2], size: [0.02, 1.9, 0.06], color: "#6b3f24" });
    a.block({ center: [139.92, base + 2.3, 102.2], size: [0.16, 0.1, 2.5], color: "#f4f3ef" });
    a.block({ center: [139.97, base + 1.25, 104.8], size: [0.06, 0.7, 0.7], color: "#6b3f24" });
    a.block({ center: [139.93, base + 1.25, 104.8], size: [0.03, 0.56, 0.56], color: "#161c26" });
    a.block({ center: [139.93, base + 1.7, 104.8], size: [0.14, 0.08, 1.0], color: "#f4f3ef" });
  }
  signText("KLMB", 139.98, 10.06, 104.68, 0.08, "#8fb4e0");
  signText("BLDG.", 139.98, 9.415, 104.68, 0.045, "#8fb4e0");
  a.prop("aircon_unit", [139.98, 99.9], { y: 8.9, rotDeg: 270 });
  a.prop("aircon_unit", [141.8, 95.98], { y: 2.2, rotDeg: 180 });
  a.prop("plastic_chair", [139.5, 104.8], { y: f2, rotDeg: 270, tint: "#d8d8d4" });

  // ── outdoor tambay: café tables tight against the glass, one big umbrella ──
  const cream = "#e2d6bf";
  a.prop("patio_umbrella", [137.8, 104.6], { tint: "#d8c8a8" });
  for (const [x, z] of [[137.8, 104.6], [138.2, 101.2], [138, 98]] as const) {
    a.prop("cafe_table", [x, z]);
    a.prop("tabletop_cups", [x, z], { y: 0.76, rotDeg: x * 40 });
    a.prop("folding_chair", [x, z + 0.7], { rotDeg: 180, tint: cream });
    a.prop("folding_chair", [x, z - 0.7], { rotDeg: 0, tint: cream });
  }
  a.prop("plastic_chair", [137.4, 101.3], { rotDeg: 80, tint: "#e7e4dc" });
  a.prop("plastic_chair", [138.9, 97.4], { rotDeg: 300, tint: "#2c2a28" });
  a.prop("umbrella_closed", [139.6, 100.8], { tint: "#d8c8a8" });
  a.prop("string_lights_6m", [138.9, 102], { y: 3.3, rotDeg: 90 });
  for (const z of [97, 99.8, 105.8]) a.prop("potted_plant", [139.75, z]);
  a.prop("dog_sleeping", [137.2, 96.8], { rotDeg: 200 });

  // Frontage: black bollards, pink posts and the parking notice on its A-frame.
  for (const z of [96.6, 98.4, 100.2]) a.prop("bollard_round", [136.1, z], { tint: "#262626" });
  a.prop("post_slim", [135.3, 103.4], { tint: "#e7a7b3" });
  a.prop("post_slim", [134.4, 99.6], { tint: "#e7a7b3" });
  a.prop("sign_aframe", [135.4, 101.8], { rotDeg: 270, tint: "#ececea" });

  // ── north corner: tall white gate pillars, steel fence, parked motorcycles ──
  a.block({ center: [142.5, 1.2, 112.5], size: [17, 2.4, 0.3], color: "#e6e4dc", collide: true });
  for (const x of [134.3, 137]) a.block({ center: [x, 2.8, 112.4], size: [0.6, 5.6, 0.6], color: "#e6e4dc", collide: true });
  a.block({ center: [135.65, 3.3, 111.8], size: [3.4, 0.3, 1.4], color: "#dcdad2" });
  a.wallRun([151, 112.5], [165, 112.5]);
  for (const z of [107.9, 110.9]) a.prop("steel_fence_3m", [134.6, z], { rotDeg: 90 });
  a.prop("utility_box", [134, 112.1], { y: 1.5, rotDeg: 270 });
  a.prop("motorcycle_parked", [136.6, 108.8], { rotDeg: 200, tint: "#1d1d1d" });
  a.prop("motorcycle_parked", [138.4, 109.4], { rotDeg: 160, tint: "#8a1f1f" });
  a.prop("trash_drum", [133.6, 113.3]);

  // ── south: the gravel lot behind its white wall, gate leaf swung open ──
  a.wallRun([127, 76.2], [165, 76.2]);
  a.prop("steel_fence_3m", [128.2, 77.8], { rotDeg: 30 });
  for (let x = 140; x <= 162; x += 3.2) a.prop("curb_stop", [x, 78]);
  a.prop("beer_crate_stack", [141.2, 94.6], { tint: "#c9a227" });
  a.prop("water_jug", [142.2, 95.3]);

  // ── roadside: drainage edge, poles and wires across the front, the Kyo sign ──
  for (const z of [74, 116, 120, 124]) a.prop("canal_4m", [125.9, z]);
  for (const z of [90, 106]) a.prop("drain_grate", [125.6, z], { rotDeg: 90 });
  a.poleLine([[127, 122], [127, 79]], 2, 1.4);
  for (const z of [113, 116]) a.block({ center: [128, 1.4, z], size: [0.12, 2.8, 0.12], color: "#2a2a2a", collide: true });
  a.block({ center: [128.02, 2.55, 114.5], size: [0.1, 0.8, 3.4], color: "#1a1a1a" });
  signText("KYO COFFEE", 127.96, 2.73, 114.5, 0.05, "#ffe9c4");

  // Tropical side plants and the old mango tree behind the building.
  a.prop("tree_mango", [160, 121]);
  for (const [x, z] of [[131, 118], [146, 114.5], [163, 80], [152, 94.8]] as const) a.prop("banana_plant", [x, z]);
  for (const [x, z] of [[139, 114], [156, 115], [133, 78]] as const) a.prop("bush", [x, z]);

  // Out over the terrace, not against the glass: a lamp that close blows the white wall out.
  a.lamp({ id: "kyo_interior", at: [136.2, 2.8, 102.5], profile: "cafe", strength: 0.75 });
  a.lamp({ id: "kyo_terrace", at: [136.5, 3.0, 98], profile: "cafe", strength: 0.6 });
  a.lamp({ id: "kyo_sign", at: [128.8, 2.6, 114.5], profile: "porch", strength: 0.6 });
  a.lamp({ id: "kyo_side", at: [141, 3, 94.8], profile: "porch", strength: 0.7 });

  a.zone({
    id: "kyo_terrace",
    kind: "walk",
    rect: rect(136.6, 96.5, 140, 106.2),
    locationId: "coffee_shop",
    interaction: { action: "hang_out", label: "Tambay muna", dialogueId: "kyo_tambay" },
  });
  // The door is the counter for now; reach lets it work from the terrace, and it outranks tambay there.
  a.zone({
    id: "kyo_counter",
    kind: "interact",
    rect: rect(139.6, 102.2, 140.5, 103.8),
    locationId: "coffee_shop",
    interaction: { action: "order_coffee", label: "Order a coffee", reach: 1.2, priority: 1, dialogueId: "kyo_order" },
  });
  a.zone({ id: "kyo_apron", kind: "parking", rect: rect(125.5, 84, 136, 112), locationId: "coffee_shop" });
  a.zone({ id: "kyo_moto_corner", kind: "parking", rect: rect(134.8, 106.6, 140.4, 111.8), locationId: "coffee_shop" });
  a.zone({ id: "kyo_lot", kind: "parking", rect: rect(128, 77, 164, 93.5), locationId: "coffee_shop" });

  // Neighbours along the connector.
  house([150, 150], [14, 12], { wall: WALL.pink, roof: ROOF.gi, facingDeg: 270, window: true });
  house([95, 165], [16, 12], { wall: WALL.cream, roof: ROOF.gi, facingDeg: 180, window: true });
  a.wallRun([165, 128], [165, 76]);
}

function gasStation() {
  a.surface({ kind: "concrete", center: [25, 25], size: [62, 38] });
  // Canopy: brightest island in the hub.
  a.block({ center: [25, 5.8, 24], size: [40, 0.6, 20], color: "#e6e6e2" });
  a.block({ center: [25, 5.8, 13.95], size: [40.2, 0.5, 0.12], color: BRAND.fuel, glow: true });
  a.block({ center: [25, 5.8, 34.05], size: [40.2, 0.5, 0.12], color: BRAND.fuel, glow: true });
  for (const [x, z] of [[9, 17], [41, 17], [9, 31], [41, 31]] as const) {
    a.block({ center: [x, 2.75, z], size: [0.6, 5.5, 0.6], color: "#d8d8d4", collide: true });
  }
  for (let x = 10; x <= 40; x += 7.5) for (const z of [17.5, 24, 30.5]) a.prop("canopy_panel", [x, z], { y: 5.45 });
  for (const [x, z] of [[15, 19], [35, 19], [15, 29], [35, 29]] as const) {
    a.prop("fuel_island", [x, z], { rotDeg: 90, tint: BRAND.fuel });
  }
  for (const [x, z] of [[15, 21], [35, 21], [15, 27], [35, 27]] as const) {
    a.lamp({ id: `canopy_${x}_${z}`, at: [x, 5.2, z], profile: "canopy" });
  }
  a.prop("sign_pylon", [-3, 9.5], { rotDeg: 0, tint: BRAND.fuel });
  a.lamp({ id: "fuel_pylon", at: [-3, 5, 11], profile: "canopy", strength: 0.35 });

  // Kiosk (cashier + restroom) with a small walkway.
  a.block({ center: [50, 1.6, 39], size: [10, 3.2, 9], color: "#e0ddd4", collide: true });
  a.block({ center: [50, 3.3, 38.5], size: [11, 0.25, 11], color: "#2c2c2c" });
  a.block({ center: [50, 1.3, 34.47], size: [6, 2, 0.05], color: "#eef6ff", glow: true });
  a.block({ center: [50, 2.85, 34.3], size: [9, 0.45, 0.1], color: BRAND.fuel, glow: true });
  a.lamp({ id: "fuel_kiosk", at: [50, 3.0, 32.5], profile: "store", strength: 0.8 });
  for (const x of [45.5, 48.5, 51.5, 54.5]) a.prop("bollard", [x, 30.6]);
  a.prop("air_water_stand", [55, 18], { rotDeg: 270 });
  a.prop("ice_cooler", [46, 33.3], { tint: "#c23a2a" });
  a.prop("trash_drum", [55.2, 33]);
  a.prop("drain_grate", [2, 6.6]);
  a.prop("drain_grate", [48, 6.6]);
  a.prop("motorcycle_parked", [55.5, 24], { rotDeg: 270, tint: "#1d1d1d" });
  // The unofficial meet spot: a couple of chairs by the air stand.
  a.prop("plastic_chair", [55.5, 14], { rotDeg: 250, tint: "#e7e4dc" });
  a.prop("plastic_chair", [54.2, 12.6], { rotDeg: 300, tint: "#2a5cb0" });

  a.zone({ id: "fuel_kiosk_walk", kind: "walk", rect: rect(44.5, 31, 56, 34.4), locationId: "gas_station" });
  a.zone({ id: "fuel_meet", kind: "walk", rect: rect(52.5, 11, 57, 16), locationId: "gas_station" });
  for (const [x, z] of [[15, 19], [35, 19], [15, 29], [35, 29]] as const) {
    a.zone({ id: `pump_${x}_${z}`, kind: "interact", rect: rect(x - 3, z - 3.5, x + 3, z + 3.5), locationId: "gas_station" });
  }
  a.zone({ id: "fuel_forecourt", kind: "parking", rect: rect(-5, 7, 44, 43), locationId: "gas_station" });

  // Across the road: roadside houses behind the canal (see southRoadsideHouses) and a carinderia.
  house([25, -22], [16, 10], { wall: WALL.cream, roof: ROOF.gi, facingDeg: 0, window: true });
  a.block({ center: [25, 2.6, -15.6], size: [16, 0.12, 3], color: "#8a2f24" });
  a.lamp({ id: "carinderia", at: [25, 2.4, -16], profile: "porch", strength: 1.1 });
  a.prop("plastic_table", [21, -15.5], { tint: "#c23a2a" });
  a.prop("plastic_chair", [20, -15], { rotDeg: 90, tint: "#c23a2a" });
  a.prop("plastic_chair", [22, -16], { rotDeg: 270, tint: "#c23a2a" });
}

function convenienceStore() {
  a.surface({ kind: "asphalt", center: [-68, 12], size: [34, 12] });
  a.surface({ kind: "tile", center: [-68, 20], size: [26, 4] });
  a.block({ center: [-68, 2.1, 29], size: [24, 4.2, 14], color: "#e4e2dc", collide: true });
  a.block({ center: [-68, 4.35, 28.8], size: [25, 0.3, 15], color: "#2a2a2a" });
  // All-glass front, bright interior, blue/yellow fascia band (fictional "Suki 24").
  a.block({ center: [-68, 1.5, 21.98], size: [20, 2.6, 0.05], color: "#f4fbff", glow: true });
  a.block({ center: [-68, 3.55, 21.9], size: [24.2, 0.9, 0.2], color: BRAND.store, glow: true });
  a.block({ center: [-68, 3.02, 21.85], size: [24.2, 0.16, 0.2], color: BRAND.storeAccent, glow: true });
  a.block({ center: [-68, 3.2, 20], size: [26, 0.12, 4], color: "#2a2a2a" });
  a.prop("sign_roadside", [-49, 7.5], { rotDeg: 0, tint: BRAND.store });
  for (const x of [-74, -68, -62]) a.lamp({ id: `store_${x}`, at: [x, 3.0, 20], profile: "store" });
  for (const x of [-77, -71, -65, -59]) a.prop("fluorescent_tube", [x, 20], { y: 3.1 });

  for (let x = -80; x <= -56; x += 3) if (x !== -68 && x !== -65) a.prop("bollard", [x, 17.6]);
  for (let x = -82; x <= -54; x += 3.2) a.prop("curb_stop", [x, 16.4]);
  a.prop("store_rack", [-78, 20.9], { rotDeg: 180, tint: BRAND.storeAccent });
  a.prop("ice_cooler", [-58, 21], { tint: BRAND.store });
  a.prop("trash_drum", [-55.3, 21]);
  a.prop("water_jug", [-79.5, 21.2]);
  a.prop("water_jug", [-79.9, 20.8]);
  a.prop("motorcycle_parked", [-53, 13], { rotDeg: 0, tint: "#1f3f8a" });
  a.prop("motorcycle_parked", [-51.6, 13], { rotDeg: 10, tint: "#dadddf" });
  // Tricycle terminal on the shoulder outside the store.
  a.prop("tricycle_parked", [-44, 8.8], { rotDeg: 270, tint: "#1c6a4a" });
  a.prop("tricycle_parked", [-38, 8.8], { rotDeg: 270, tint: "#8a1f1f" });
  a.prop("plastic_chair", [-41, 11.5], { rotDeg: 180, tint: "#2a5cb0" });
  a.prop("drain_grate", [-68, 6.6]);

  a.zone({ id: "store_walkway", kind: "walk", rect: rect(-81, 18, -55, 22), locationId: "convenience_store" });
  a.zone({ id: "store_counter", kind: "interact", rect: rect(-71, 20, -65, 22), locationId: "convenience_store" });
  a.zone({ id: "store_parking", kind: "parking", rect: rect(-84, 6.5, -52, 16.4), locationId: "convenience_store" });

  // Behind the store: back wall and a mango tree.
  a.wallRun([-86, 44], [-50, 44]);
  a.prop("tree_mango", [-90, 36]);
  house([-128, 30], [14, 12], { wall: WALL.pink, roof: ROOF.rust, facingDeg: 90, window: true });
  house([-128, -24], [14, 10], { wall: WALL.sage, roof: ROOF.gi, facingDeg: 0 });
}

function innerBlock() {
  // Barangay basketball court: a landmark from any corner of the loop.
  a.surface({ kind: "concrete", center: [15, 100], size: [30, 17] });
  for (const x of [1.5, 28.5]) {
    a.block({ center: [x, 1.6, 100], size: [0.25, 3.2, 0.25], color: "#5d6166", collide: true });
    a.block({ center: [x + (x < 15 ? 0.6 : -0.6), 3.1, 100], size: [0.08, 1.05, 1.8], color: "#e8e8e0" });
  }
  a.prop("street_lamp", [15, 110], { rotDeg: 180 });
  a.lamp({ id: "court", at: [15, 6.6, 107.8], profile: "sodium", strength: 1.2 });
  a.prop("plastic_chair", [4, 110], { rotDeg: 180, tint: "#2a5cb0" });
  a.prop("plastic_chair", [5.2, 110.4], { rotDeg: 170, tint: "#c23a2a" });

  house([55, 110], [18, 12], { wall: WALL.cream, roof: ROOF.rust, facingDeg: 0, window: true });
  house([90, 112], [14, 12], { wall: WALL.blue, roof: ROOF.gi, facingDeg: 90 });
  house([90, 50], [16, 14], { wall: WALL.sand, roof: ROOF.green, facingDeg: 90, window: true });
  house([-10, 50], [14, 12], { wall: WALL.sage, roof: ROOF.rust, facingDeg: 180 });
  house([-60, 58], [14, 10], { wall: WALL.blue, roof: ROOF.gi, facingDeg: 0 });
  a.wallRun([-100, 80], [-30, 80]);
  a.wallRun([62, 76], [62, 30]);
  a.wallRun([-18, 42], [-18, 76]);
  for (const [x, z] of [[-40, 95], [-25, 60], [70, 90], [100, 30], [80, 128]] as const) a.prop("tree_mango", [x, z]);
  for (let x = -95; x <= -35; x += 7) a.prop("bush", [x, 88 + ((x * 7) % 5)]);
  a.prop("coconut_palm", [103, 20]);
  a.prop("coconut_palm", [-96, 20]);
}

function southRoadsideHouses() {
  for (const [x, wall, roof] of [
    [-100, WALL.cream, ROOF.rust],
    [-60, WALL.blue, ROOF.gi],
    [-38, WALL.sand, ROOF.green],
    [80, WALL.sage, ROOF.rust],
    [110, WALL.pink, ROOF.gi],
    [150, WALL.cream, ROOF.green],
    [190, WALL.sand, ROOF.rust],
  ] as const) {
    house([x, -24], [14, 10], { wall, roof, facingDeg: 0, window: x % 40 === 30 || x === -60 });
  }
  a.lamp({ id: "south_porch_-60", at: [-60, 2.4, -18.5], profile: "porch", strength: 0.7 });
  a.lamp({ id: "south_porch_150", at: [150, 2.4, -18.5], profile: "porch", strength: 0.7 });
  a.prop("motorcycle_parked", [-56, -15], { rotDeg: 0, tint: "#a31f1f" });
  a.prop("sign_tarp", [112, -13], { rotDeg: 0, tint: "#f2e6c8" });
  a.prop("tricycle_parked", [185, -14.5], { rotDeg: 90, tint: "#2a5cb0" });
}

function vegetation() {
  for (let x = -150; x < 245; x += 11) {
    a.prop(x % 3 === 0 ? "banana_plant" : "bush", [x, -48 + ((x * 13) % 7)]);
    a.prop(x % 2 === 0 ? "bush" : "banana_plant", [x + 4, 193 - ((x * 5) % 4)]);
  }
  for (const x of [-140, -30, 80, 170, 230]) a.prop("tree_mango", [x, -40]);
  for (const z of [30, 90, 150]) a.prop("tree_mango", [-148, z]);
  for (const z of [30, 100, 170]) a.prop("tree_mango", [238, z]);
  a.prop("coconut_palm", [205, 25]);
  a.prop("coconut_palm", [215, 60]);
  a.surface({ kind: "grass", center: [200, 130], size: [90, 120] });
}

type HouseOptions = { wall: string; roof: string; facingDeg: number; height?: number; window?: boolean };

/** Single-storey house block with a roof slab and, optionally, a lit window on its front. */
function house([x, z]: Vec2, [w, d]: Vec2, { wall, roof, facingDeg, height = 3.2, window = false }: HouseOptions) {
  a.block({ center: [x, height / 2, z], size: [w, height, d], rotDeg: facingDeg, color: wall, collide: true });
  a.block({ center: [x, height + 0.15, z], size: [w + 1, 0.3, d + 1], rotDeg: facingDeg, color: roof });
  if (window) {
    const [wx, wz] = local(x, z, facingDeg, -w * 0.22, d / 2 + 0.03);
    a.block({ center: [wx, 1.6, wz], size: [w * 0.22, 1.0, 0.05], rotDeg: facingDeg, color: "#ffc98a", glow: true });
  }
  const [dx, dz] = local(x, z, facingDeg, w * 0.18, d / 2 + 0.03);
  a.block({ center: [dx, 1.05, dz], size: [1.0, 2.1, 0.06], rotDeg: facingDeg, color: "#4a3626" });
}

/** World position of a point given in a block's local frame (+z = its facing). */
function local(x: number, z: number, facingDeg: number, lx: number, lz: number): Vec2 {
  const c = Math.cos(facingDeg * DEG);
  const s = Math.sin(facingDeg * DEG);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

/**
 * Block-letter `text` on a wall facing −x (read looking east, so it runs from +z to −z),
 * centred on `centerZ` with its top at `top`. `px` is one font pixel in metres.
 */
function signText(text: string, x: number, top: number, centerZ: number, px: number, color: string) {
  const { runs, columns } = pixelText(text);
  const left = centerZ + (columns * px) / 2;
  for (const run of runs) {
    a.block({
      center: [x - 0.015, top - (run.row + 0.5) * px, left - (run.col + run.length / 2) * px],
      size: [0.03, px, run.length * px],
      color,
      glow: true,
    });
  }
}

/** Barrier and closed-road sign where a road leaves the hub. */
function roadClosure([x, z]: Vec2, facingDeg: number, id: string) {
  for (let offset = -5; offset <= 5; offset += 2.5) {
    const [bx, bz] = local(x, z, facingDeg, offset, 0);
    a.block({ center: [bx, 0.5, bz], size: [2.2, 1, 0.5], rotDeg: facingDeg, color: offset % 5 === 0 ? "#d9d4c7" : "#b8322a", collide: true });
  }
  const [lx, lz] = local(x, z, facingDeg, 0, 1.5);
  a.lamp({ id: `closure_${id}`, at: [lx, 1.4, lz], profile: "sodium", strength: 0.5 });
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

