import { parseVehicleDefinition, type VehicleDefinition } from "./VehicleDefinition";

/**
 * Baseline starter: a fictional mid-'90s 1.5L FWD compact sedan, the kind every Iloilo family
 * seemed to own one of (GAME_VISION §3.3, §15). Deliberately average everywhere so later
 * starters can be tuned relative to it. "Banwa" is a fictional marque.
 *
 * Specs line up with the `fwd_worn_sedan` handling preset and starter_sedan.glb;
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
      url: "/model/starter_sedan.glb",
      unitScale: 1,
      bodyNodes: ["body", "cabin", "body_trim"],
      wheelNodes: { fl: "wheel_fl", fr: "wheel_fr", rl: "wheel_rl", rr: "wheel_rr" },
      paintMaterial: "paint",
      // Anchors sit on the modelled surface, car-space metres: hood 0.81 at mid-hood (sloping 0.72
      // at the nose to 0.85 at the cowl), trunk lid 0.95, bumper faces z ±2.16 (bottom edge 0.16),
      // sills x ±0.82, front arches z 1.28, roof 1.40.
      attachments: [
        { slot: "hood", socket: "hood_socket", stockNode: null, anchor: { x: 0, y: 0.81, z: 1.5 } },
        { slot: "bumper_front", socket: "bumper_front_socket", stockNode: null, anchor: { x: 0, y: 0.36, z: 2.16 } },
        { slot: "bumper_rear", socket: "bumper_rear_socket", stockNode: null, anchor: { x: 0, y: 0.36, z: -2.16 } },
        { slot: "front_lip", socket: "front_lip_socket", stockNode: null, anchor: { x: 0, y: 0.16, z: 2.06 } },
        { slot: "chin", socket: "chin_socket", stockNode: null, anchor: { x: 0, y: 0.14, z: 2.1 } },
        { slot: "side_skirts", socket: "side_skirts_socket", stockNode: null, anchor: { x: 0, y: 0.2, z: 0 } },
        { slot: "spoiler", socket: "spoiler_socket", stockNode: null, anchor: { x: 0, y: 0.95, z: -1.95 } },
        { slot: "fender_fl", socket: "fender_fl_socket", stockNode: null, anchor: { x: -0.84, y: 0.62, z: 1.28 } },
        { slot: "fender_fr", socket: "fender_fr_socket", stockNode: null, anchor: { x: 0.84, y: 0.62, z: 1.28 } },
        { slot: "side_mirrors", socket: "side_mirrors_socket", stockNode: "mirrors", anchor: null },
        { slot: "roof", socket: "roof_socket", stockNode: null, anchor: { x: 0, y: 1.395, z: -0.2 } },
        { slot: "accessory_front", socket: "accessory_front_socket", stockNode: null, anchor: { x: 0, y: 0.3, z: 2.18 } },
        { slot: "accessory_rear", socket: "accessory_rear_socket", stockNode: null, anchor: { x: 0, y: 0.45, z: -2.18 } },
        { slot: "exhaust", socket: "exhaust_socket", stockNode: "exhaust", anchor: null },
        { slot: "headlight_l", socket: "headlight_l_socket", stockNode: "headlight_l", anchor: null },
        { slot: "headlight_r", socket: "headlight_r_socket", stockNode: "headlight_r", anchor: null },
        { slot: "taillight_l", socket: "taillight_l_socket", stockNode: "taillight_l", anchor: null },
        { slot: "taillight_r", socket: "taillight_r_socket", stockNode: "taillight_r", anchor: null },
      ],
      budget: { maxTriangles: 30000, maxDrawCalls: 40, maxMaterials: 16 },
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

export const VEHICLE_CATALOG: Readonly<Record<string, VehicleDefinition>> = {
  [BANWA_DALAGAN_1996.id]: BANWA_DALAGAN_1996,
};

export function getVehicleDefinition(id: string): VehicleDefinition {
  const definition = VEHICLE_CATALOG[id];
  if (!definition) throw new Error(`Unknown vehicle definition "${id}"`);
  return definition;
}
