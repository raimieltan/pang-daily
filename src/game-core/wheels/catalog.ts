import { parseWheelPart, type WheelPart } from "./WheelPart";

/**
 * Wheel sets you actually find on the Iloilo used market: the ones that came off someone's
 * daily, the mags everyone had in 2009, and the too-big set a seller swears "fits, boss".
 * Fitment notes are against the Banwa Dalagan (stock 0.60 m, 175 wide, ET45).
 */
export const WHEEL_PARTS: readonly WheelPart[] = [
  // Narrow and high offset: tucks well inside the lip. Honest, light, a bit sunken.
  parseWheelPart({
    id: "steelies_14",
    name: '14" steel wheels w/ caps',
    description: "Galing sa Dalagan ni Tito. Caps kumpleto pa, isang may gasgas.",
    fits: "4x100 PCD",
    assetPath: "/model/wheels/steelies_14.glb",
    rimDiameterIn: 14,
    tireSize: "165/65R14",
    fit: { diameterM: 0.57, widthM: 0.165, offsetMm: 49 },
    massKg: 12.5,
    market: { priceRangePhp: [1500, 2400], conditionRange: [0.5, 1] },
    modifiers: { grip: -0.03, braking: 0, acceleration: 0.02 },
    visual: { style: "steelie", rimColor: "#9aa0a6" },
  }),
  // Wider rubber and a flush ET35: the clean upgrade, if the rims aren't bent.
  parseWheelPart({
    id: "mags_15_4x100",
    name: '15" mags 4x100',
    description: "Used mags, 4x100. May konting curb rash, walang bitak. Swap ok.",
    fits: "4x100 PCD",
    assetPath: "/model/wheels/mags_15.glb",
    rimDiameterIn: 15,
    tireSize: "195/55R15",
    fit: { diameterM: 0.6, widthM: 0.195, offsetMm: 35 },
    massKg: 14,
    market: { priceRangePhp: [7000, 11000], conditionRange: [0.4, 0.95] },
    modifiers: { grip: 0.06, braking: 0.03, acceleration: 0 },
    visual: { style: "multi_spoke", rimColor: "#c9ccd1" },
  }),
  // Tall, wide, low offset: pokes out of the fender and rubs as soon as you drop it.
  parseWheelPart({
    id: "oversized_17_deep_dish",
    name: '17" deep dish replicas',
    description: "Pang porma! Fit daw sa Dalagan, lagyan lang spacer. Isang rim medyo umuuga.",
    fits: "4x100 / 4x114.3 multi",
    assetPath: "/model/wheels/deep_dish_17.glb",
    rimDiameterIn: 17,
    tireSize: "215/45R17",
    fit: { diameterM: 0.64, widthM: 0.215, offsetMm: 15 },
    massKg: 19,
    market: { priceRangePhp: [5500, 9500], conditionRange: [0.25, 0.8] },
    modifiers: { grip: 0.04, braking: -0.04, acceleration: -0.06 },
    visual: { style: "deep_dish", rimColor: "#e3e5e8" },
  }),
];

const byId = new Map(WHEEL_PARTS.map((part) => [part.id, part]));

export const wheelPart = (id: string): WheelPart | undefined => byId.get(id);
