import { filletPolyline, LayoutAuthor, rect } from "../layoutTools";
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

// Fictional brands only (ART_DIRECTION §7): colours evoke the category, not a real chain.
const BRAND = {
  fuel: "#19b58a",
  fuelAccent: "#f2f2e8",
  store: "#2f6bff",
  storeAccent: "#ffd23a",
  cafe: "#ffd9a0",
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
    name: "Tambay Coffee",
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

  a.zone({ id: "talyer_waiting", kind: "walk", rect: rect(40.5, 150, 49.5, 164.5), locationId: "talyer" });
  a.zone({ id: "talyer_bay_1", kind: "interact", rect: rect(8.5, 151, 23.5, 167.5), locationId: "talyer" });
  a.zone({ id: "talyer_bay_2", kind: "interact", rect: rect(24.5, 151, 39.5, 167.5), locationId: "talyer" });
  a.zone({ id: "talyer_apron", kind: "parking", rect: rect(5, 145, 40, 150), locationId: "talyer" });

  // Neighbours: sari-sari store house and a vacant lot with tall grass.
  house([-5, 160], [14, 12], { wall: WALL.sand, roof: ROOF.gi, facingDeg: 180, window: true });
  a.prop("sign_roadside", [-5, 149], { rotDeg: 0, tint: "#ffe9b0" });
  a.lamp({ id: "sari_sari", at: [-5, 2.4, 153.5], profile: "porch" });
  house([58, 184], [14, 12], { wall: WALL.blue, roof: ROOF.rust, facingDeg: 180 });
  house([12, 186], [18, 10], { wall: WALL.cream, roof: ROOF.green, facingDeg: 180 });
}

function coffeeShop() {
  // Low modern box with a glass front facing the connector road, nose-in parking right in front,
  // and a terrace fenced from the lot by planters (walking-safe).
  const front = 147;
  a.surface({ kind: "asphalt", center: [132.5, 100], size: [15, 44] });
  a.surface({ kind: "tile", center: [143.5, 100], size: [7, 30] });
  a.surface({ kind: "tile", center: [155, 119], size: [16, 10] });
  a.block({ center: [155, 2, 100], size: [16, 4, 28], color: "#c9c3b6", collide: true });
  a.block({ center: [155, 4.2, 100], size: [17, 0.4, 29], color: "#2c2a28" });
  // Glass front (lit interior) and warm fascia.
  a.block({ center: [front - 0.02, 1.5, 100], size: [0.05, 2.6, 22], color: "#ffcf8a", glow: true });
  a.block({ center: [front - 0.3, 3.2, 100], size: [0.6, 0.6, 26], color: "#4a3626" });
  a.prop("sign_fascia", [front - 0.7, 100], { y: 3.3, rotDeg: 270, scale: 0.7, tint: BRAND.cafe });
  // Terrace awning.
  a.block({ center: [143.5, 3.4, 100], size: [7, 0.12, 28], color: "#3a2e26" });
  for (const z of [86.5, 100, 113.5]) a.block({ center: [140.3, 1.7, z], size: [0.15, 3.4, 0.15], color: "#3a2e26", collide: true });

  for (const z of [89, 95, 105, 111]) a.prop("string_lights_6m", [140.5, z], { y: 3.2, rotDeg: 90 });
  a.lamp({ id: "cafe_terrace_n", at: [143, 3.0, 109], profile: "cafe" });
  a.lamp({ id: "cafe_terrace_s", at: [143, 3.0, 91], profile: "cafe" });
  a.lamp({ id: "cafe_interior", at: [148.5, 2.4, 100], profile: "cafe", strength: 1.1 });
  a.lamp({ id: "cafe_side", at: [155, 2.8, 119], profile: "cafe", strength: 0.7 });

  // Planters with gaps as the lot/terrace edge; a sign at the road.
  for (const z of [87.5, 92.5, 107.5, 112.5]) a.prop("planter_box", [139.6, z], { rotDeg: 90 });
  for (const z of [97.5, 102.5]) a.prop("bollard", [139.6, z]);
  for (let z = 81; z <= 119; z += 3.2) a.prop("curb_stop", [137.6, z], { rotDeg: 90 });
  a.prop("sign_roadside", [126.5, 124], { rotDeg: 270, tint: BRAND.cafe });

  const seats: [number, number][] = [
    [142, 90],
    [145, 93],
    [142, 97.5],
    [145, 106],
    [142, 109.5],
    [145, 112],
  ];
  for (const [x, z] of seats) {
    a.prop("plastic_table", [x, z], { tint: "#2c2a28" });
    a.prop("plastic_chair", [x - 0.8, z + 0.4], { rotDeg: 110, tint: "#2c2a28" });
    a.prop("plastic_chair", [x + 0.8, z - 0.4], { rotDeg: 290, tint: "#2c2a28" });
  }
  // Side yard seating under the mango tree (the actual tambay spot).
  a.prop("tree_mango", [160, 121]);
  for (const [x, z, r] of [[151, 118, 30], [153, 120.5, 200], [156, 117.5, 320], [149.5, 121, 90]] as const) {
    a.prop("plastic_chair", [x, z], { rotDeg: r, tint: "#e7e4dc" });
  }
  a.prop("plastic_table", [153, 119], { tint: "#e7e4dc" });
  a.prop("string_lights_6m", [155, 117], { y: 3.0 });
  a.prop("motorcycle_parked", [129, 123], { rotDeg: 90, tint: "#1d1d1d" });
  a.prop("motorcycle_parked", [129, 121.6], { rotDeg: 90, tint: "#a31f1f" });
  a.prop("trash_drum", [146.2, 85.8]);
  a.prop("dog_sleeping", [146, 116], { rotDeg: 200 });

  a.zone({ id: "cafe_terrace", kind: "walk", rect: rect(140, 86, 147, 114), locationId: "coffee_shop" });
  a.zone({ id: "cafe_side_yard", kind: "walk", rect: rect(147, 114, 163, 124), locationId: "coffee_shop" });
  a.zone({ id: "cafe_counter", kind: "interact", rect: rect(145, 97, 147, 103), locationId: "coffee_shop" });
  a.zone({ id: "cafe_parking", kind: "parking", rect: rect(125, 80, 138, 120), locationId: "coffee_shop" });

  // Neighbours along the connector.
  house([150, 150], [14, 12], { wall: WALL.pink, roof: ROOF.gi, facingDeg: 270, window: true });
  house([155, 77.5], [12, 8], { wall: WALL.sage, roof: ROOF.rust, facingDeg: 270 });
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

