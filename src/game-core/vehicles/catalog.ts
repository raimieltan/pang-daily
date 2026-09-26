import { parseVehicleDefinition, type VehicleDefinition } from "./VehicleDefinition";

/**
 * Baseline starter: a fictional mid-'90s 1.5L FWD compact sedan, the kind every Iloilo family
 * seemed to own one of (GAME_VISION §3.3, §15). Deliberately average everywhere so later
 * starters can be tuned relative to it. "Banwa" is a fictional marque.
 *
 * Specs line up with the `fwd_worn_sedan` handling preset and banwa_dalagan_1996_modular.glb;
 * VehicleDefinition.test.ts on the game side keeps them from drifting apart.
 */
export const BANWA_DALAGAN_1996: VehicleDefinition = parseVehicleDefinition({
  schemaVersion: 1,
  id: "banwa_dalagan_1996",
  tags: ["banwa_dalagan", "sedan", "compact", "nineties", "fwd"],
  identity: {
    make: "Banwa",
    model: "Dalagan",
    trim: "1.5 SE",
    year: 1996,
    bodyStyle: "sedan",
    description: "Tito's old daily. 1.5 sixteen-valve, five-speed, a trunk that fits a lechon and half the barkada.",
  },
  drivetrain: { layout: "FWD", transmission: "manual", gears: 5 },
  power: {
    displacementCc: 1493,
    aspiration: "naturally_aspirated",
    peakPowerHp: 98,
    peakPowerRpm: 6000,
    peakTorqueNm: 130,
    peakTorqueRpm: 4800,
    redlineRpm: 6800,
  },
  weight: { curbKg: 1080, frontWeightRatio: 0.62 },
  grip: { tireGrip: 1.0, tireSize: "175/70R13" },
  braking: { decelerationMps2: 8, frontBias: 0.68, front: "disc", rear: "drum" },
  reliability: { baseline: 0.8, wearRate: 1, weakPoints: ["electrical", "suspension"] },
  dimensions: { lengthM: 4.33, widthM: 1.69, heightM: 1.4, wheelbaseM: 2.5, trackM: 1.456, wheelRadiusM: 0.3 },
  market: { basePricePhp: 95000, partsAvailability: 0.85 },
  visual: {
    model: {
      url: "/model/banwa_dalagan_1996_modular.glb",
      unitScale: 1,
      bodyNodes: ["shell_base", "bumper_front_stock", "bumper_rear_stock"],
      wheelNodes: { fl: "wheel_fl", fr: "wheel_fr", rl: "wheel_rl", rr: "wheel_rr" },
      paintMaterial: "paint",
      // Mount frames and panel seams are authored in the modular GLB. Babylon converts
      // its +X-left glTF axes to our +X-right car space; keep the supplied node names.
      attachments: [
        { slot: "hood", socket: "hood_socket", stockNode: "hood_stock", anchor: null },
        { slot: "bumper_front", socket: "bumper_front_socket", stockNode: "bumper_front_stock", anchor: null },
        { slot: "bumper_rear", socket: "bumper_rear_socket", stockNode: "bumper_rear_stock", anchor: null },
        { slot: "front_lip", socket: "front_lip_socket", stockNode: "lip_front_stock", mountNode: "attach_lip_front", anchor: null },
        { slot: "chin", socket: "chin_socket", stockNode: "chin_front_stock", mountNode: "attach_chin_front", anchor: null },
        { slot: "side_skirts", socket: "side_skirts_socket", stockNode: ["sideskirt_l_stock", "sideskirt_r_stock"], anchor: { x: 0, y: 0.2, z: 0 } },
        { slot: "spoiler", socket: "spoiler_socket", stockNode: "spoiler_rear_stock", mountNode: "attach_spoiler_rear", anchor: null },
        { slot: "fender_fl", socket: "fender_fl_socket", stockNode: "fender_fl_stock", anchor: null },
        { slot: "fender_fr", socket: "fender_fr_socket", stockNode: "fender_fr_stock", anchor: null },
        { slot: "side_mirrors", socket: "side_mirrors_socket", stockNode: ["mirror_l", "mirror_r", "mirror_glass"], anchor: null },
        { slot: "roof", socket: "roof_socket", stockNode: null, anchor: { x: 0, y: 1.395, z: -0.2 } },
        { slot: "accessory_front", socket: "accessory_front_socket", stockNode: null, anchor: { x: 0, y: 0.3, z: 2.18 } },
        { slot: "accessory_rear", socket: "accessory_rear_socket", stockNode: null, anchor: { x: 0, y: 0.45, z: -2.18 } },
        { slot: "exhaust", socket: "exhaust_socket", stockNode: ["exhaust", "exhaust_tip"], anchor: null },
        { slot: "headlight_l", socket: "headlight_l_socket", stockNode: "headlight_l", anchor: null },
        { slot: "headlight_r", socket: "headlight_r_socket", stockNode: "headlight_r", anchor: null },
        { slot: "taillight_l", socket: "taillight_l_socket", stockNode: "taillight_l", anchor: null },
        { slot: "taillight_r", socket: "taillight_r_socket", stockNode: "taillight_r", anchor: null },
      ],
      budget: { maxTriangles: 30000, maxDrawCalls: 80, maxMaterials: 16 },
    },
    rideHeight: { minM: -0.06, maxM: 0.04, defaultM: 0 },
    // The model's own paint (linear 0.70/0.72/0.74) in sRGB: tired factory silver.
    defaultPaint: "#dadddf",
  },
  wheels: {
    sockets: { fl: "wheel_fl_socket", fr: "wheel_fr_socket", rl: "wheel_rl_socket", rr: "wheel_rr_socket" },
    // The GLB's tire is 0.60 m across (a touch over a real 175/70R13), 175 wide, factory ET45.
    stock: { diameterM: 0.6, widthM: 0.175, offsetMm: 45, massKg: 13 },
    // Tito-spec stance: a finger of gap, stock tire ~15 mm inside the lip.
    arch: { gapM: 0.05, lipM: 0.83, innerM: 0.62 },
  },
  condition: {
    effects: [
      { component: "engine", stat: "power", maxLoss: 0.35 },
      { component: "transmission", stat: "power", maxLoss: 0.1 },
      { component: "tires", stat: "grip", maxLoss: 0.3 },
      { component: "suspension", stat: "grip", maxLoss: 0.15 },
      { component: "brakes", stat: "braking", maxLoss: 0.4 },
      { component: "engine", stat: "reliability", maxLoss: 0.5 },
      { component: "electrical", stat: "reliability", maxLoss: 0.3 },
      { component: "transmission", stat: "reliability", maxLoss: 0.2 },
    ],
    typical: {
      engine: 0.72,
      transmission: 0.78,
      suspension: 0.55,
      brakes: 0.65,
      tires: 0.5,
      body: 0.6,
      electrical: 0.58,
    },
  },
});

/**
 * A fictional late-'90s 1.6L three-door hatch: lighter, longer-legged and angrier than the
 * Dalagan, the car the Dalagan's owner wishes they'd bought. "Hiraya" is a fictional marque.
 *
 * Specs line up with the `fwd_hatch` handling preset and civic/ek_hatch_1997_modular.glb.
 */
export const HIRAYA_KIDLAT_1997: VehicleDefinition = parseVehicleDefinition({
  schemaVersion: 1,
  id: "hiraya_kidlat_1997",
  tags: ["hiraya_kidlat", "hatchback", "compact", "nineties", "fwd"],
  identity: {
    make: "Hiraya",
    model: "Kidlat",
    trim: "1.6 SR",
    year: 1997,
    bodyStyle: "hatchback",
    description: "Three doors, a 1.6 that lives above five thousand rpm, and a hatch that fits exactly one sound system.",
  },
  drivetrain: { layout: "FWD", transmission: "manual", gears: 5 },
  power: {
    displacementCc: 1590,
    aspiration: "naturally_aspirated",
    peakPowerHp: 120,
    peakPowerRpm: 6500,
    peakTorqueNm: 144,
    peakTorqueRpm: 5000,
    redlineRpm: 7200,
  },
  weight: { curbKg: 1030, frontWeightRatio: 0.61 },
  grip: { tireGrip: 1.05, tireSize: "195/55R15" },
  braking: { decelerationMps2: 8.5, frontBias: 0.66, front: "disc", rear: "disc" },
  reliability: { baseline: 0.78, wearRate: 1.1, weakPoints: ["engine", "suspension"] },
  dimensions: { lengthM: 4.24, widthM: 1.71, heightM: 1.38, wheelbaseM: 2.62, trackM: 1.48, wheelRadiusM: 0.295 },
  market: { basePricePhp: 145000, partsAvailability: 0.9 },
  visual: {
    model: {
      url: "/model/civic/ek_hatch_1997_modular.glb",
      unitScale: 1,
      bodyNodes: ["shell_base", "bumper_front_stock", "bumper_rear_stock"],
      wheelNodes: { fl: "wheel_fl", fr: "wheel_fr", rl: "wheel_rl", rr: "wheel_rr" },
      paintMaterial: "paint",
      // Same `attach_*` naming as the Dalagan GLB. The spoiler mount rides on `attach_hatch`.
      attachments: [
        { slot: "hood", socket: "hood_socket", stockNode: "hood_stock", anchor: null },
        { slot: "bumper_front", socket: "bumper_front_socket", stockNode: "bumper_front_stock", anchor: null },
        { slot: "bumper_rear", socket: "bumper_rear_socket", stockNode: "bumper_rear_stock", anchor: null },
        { slot: "front_lip", socket: "front_lip_socket", stockNode: "lip_front_stock", mountNode: "attach_lip_front", anchor: null },
        { slot: "chin", socket: "chin_socket", stockNode: "chin_front_stock", mountNode: "attach_chin_front", anchor: null },
        { slot: "side_skirts", socket: "side_skirts_socket", stockNode: ["sideskirt_l_stock", "sideskirt_r_stock"], anchor: { x: 0, y: 0.265, z: 0 } },
        { slot: "spoiler", socket: "spoiler_socket", stockNode: "spoiler_rear_stock", mountNode: "attach_spoiler_rear", anchor: null },
        { slot: "fender_fl", socket: "fender_fl_socket", stockNode: "fender_fl_stock", anchor: null },
        { slot: "fender_fr", socket: "fender_fr_socket", stockNode: "fender_fr_stock", anchor: null },
        { slot: "side_mirrors", socket: "side_mirrors_socket", stockNode: ["mirror_l", "mirror_r"], anchor: null },
        { slot: "roof", socket: "roof_socket", stockNode: null, anchor: { x: 0, y: 1.372, z: -0.1 } },
        { slot: "accessory_front", socket: "accessory_front_socket", stockNode: null, anchor: { x: 0, y: 0.3, z: 2.13 } },
        { slot: "accessory_rear", socket: "accessory_rear_socket", stockNode: null, anchor: { x: 0, y: 0.45, z: -2.12 } },
        { slot: "exhaust", socket: "exhaust_socket", stockNode: "exhaust_stock", anchor: null },
        { slot: "headlight_l", socket: "headlight_l_socket", stockNode: "headlight_l", anchor: null },
        { slot: "headlight_r", socket: "headlight_r_socket", stockNode: "headlight_r", anchor: null },
        { slot: "taillight_l", socket: "taillight_l_socket", stockNode: "taillight_l", anchor: null },
        { slot: "taillight_r", socket: "taillight_r_socket", stockNode: "taillight_r", anchor: null },
      ],
      // The generated GLB has a cabin interior and no LODs: ~48.7k triangles over 101 primitives.
      budget: { maxTriangles: 50000, maxDrawCalls: 110, maxMaterials: 16 },
    },
    rideHeight: { minM: -0.06, maxM: 0.04, defaultM: 0 },
    // The model's own paint (linear 0.82/0.84/0.81) in sRGB: faded championship white.
    defaultPaint: "#eaece9",
  },
  wheels: {
    sockets: { fl: "wheel_fl_socket", fr: "wheel_fr_socket", rl: "wheel_rl_socket", rr: "wheel_rr_socket" },
    // The GLB's tire is 0.59 m across and 0.21 m at the sidewall bulge: a 195/55R15 on factory ET45.
    stock: { diameterM: 0.59, widthM: 0.195, offsetMm: 45, massKg: 14 },
    // Fender lip at x = 0.857; the stock tire face sits ~15 mm inside it.
    arch: { gapM: 0.04, lipM: 0.857, innerM: 0.62 },
  },
  condition: {
    effects: [
      { component: "engine", stat: "power", maxLoss: 0.35 },
      { component: "transmission", stat: "power", maxLoss: 0.1 },
      { component: "tires", stat: "grip", maxLoss: 0.3 },
      { component: "suspension", stat: "grip", maxLoss: 0.15 },
      { component: "brakes", stat: "braking", maxLoss: 0.4 },
      { component: "engine", stat: "reliability", maxLoss: 0.5 },
      { component: "electrical", stat: "reliability", maxLoss: 0.3 },
      { component: "transmission", stat: "reliability", maxLoss: 0.2 },
    ],
    typical: {
      engine: 0.68,
      transmission: 0.75,
      suspension: 0.5,
      brakes: 0.7,
      tires: 0.55,
      body: 0.55,
      electrical: 0.65,
    },
  },
});

export const VEHICLE_CATALOG: Readonly<Record<string, VehicleDefinition>> = {
  [BANWA_DALAGAN_1996.id]: BANWA_DALAGAN_1996,
  [HIRAYA_KIDLAT_1997.id]: HIRAYA_KIDLAT_1997,
};

export function getVehicleDefinition(id: string): VehicleDefinition {
  const definition = VEHICLE_CATALOG[id];
  if (!definition) throw new Error(`Unknown vehicle definition "${id}"`);
  return definition;
}
