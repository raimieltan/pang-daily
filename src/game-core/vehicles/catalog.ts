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
      attachments: [
        { slot: "hood", stockNode: null, anchor: { x: 0, y: 0.86, z: 1.5 } },
        { slot: "bumper_front", stockNode: null, anchor: { x: 0, y: 0.36, z: 2.16 } },
        { slot: "bumper_rear", stockNode: null, anchor: { x: 0, y: 0.36, z: -2.16 } },
        { slot: "spoiler", stockNode: null, anchor: { x: 0, y: 0.94, z: -1.95 } },
        { slot: "side_mirrors", stockNode: "mirrors", anchor: null },
        { slot: "exhaust", stockNode: "exhaust", anchor: null },
        { slot: "headlight_l", stockNode: "headlight_l", anchor: null },
        { slot: "headlight_r", stockNode: "headlight_r", anchor: null },
        { slot: "taillight_l", stockNode: "taillight_l", anchor: null },
        { slot: "taillight_r", stockNode: "taillight_r", anchor: null },
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
