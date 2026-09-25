import type { VehicleDefinition, WheelFit } from "../vehicles/VehicleDefinition";

/**
 * Stance, the way people at the gas station judge it: side-on (arch gap) and from behind (how far
 * the tire face sits from the fender lip). Pure geometry from the definition's arch data; no
 * suspension travel, no collision. Same result for every corner, since one set goes on all four.
 */
export const FITMENT_STATES = ["clean", "sunken", "poke", "rubbing", "excessive_gap"] as const;
export type FitmentState = (typeof FITMENT_STATES)[number];
export type FitmentIssue = Exclude<FitmentState, "clean">;

export const FITMENT_LABELS: Readonly<Record<FitmentState, string>> = {
  clean: "Clean fitment",
  sunken: "Sunken",
  poke: "Poke",
  rubbing: "Rubbing",
  excessive_gap: "Monster-truck gap",
};

/** Tire face this far outside the lip counts as poke. */
export const POKE_M = 0.01;
/** Tire face this far inside the lip looks sunken. */
export const SUNKEN_M = 0.02;
/** Less arch gap than this and the tire hits the arch over bumps. */
export const RUB_GAP_M = 0.008;
/** A poking tire rubs the lip with less gap than this. */
export const POKE_RUB_GAP_M = 0.02;
/** More arch gap than this reads as a lifted 4x4, not a sedan. */
export const EXCESSIVE_GAP_M = 0.085;

export type Fitment = {
  /** Worst issue first: rubbing > poke > excessive gap > sunken; clean when there are none. */
  state: FitmentState;
  issues: readonly FitmentIssue[];
  /** Tire top to arch lip. Negative means the tire is inside the arch. */
  archGapM: number;
  /** Outer tire face minus fender lip: positive pokes, negative tucks. */
  lipM: number;
  /** Inner tire face minus the inner obstruction: negative rubs the strut/liner. */
  innerM: number;
  /** How far the hub (and body) rise over stock because the tire is taller. */
  hubLiftM: number;
  /** Axle-line shift of the wheel centre from stock: positive pushes outward. */
  lateralShiftM: number;
};

/**
 * Classifies `fit` on `definition` at a visual ride-height offset (negative = lowered). A taller
 * tire lifts the whole car by half its extra diameter and fills the arch by the other half.
 */
export function calculateFitment(definition: VehicleDefinition, fit: WheelFit, rideHeightM = 0): Fitment {
  const { stock, arch } = definition.wheels;
  const hubLiftM = (fit.diameterM - stock.diameterM) / 2;
  const lateralShiftM = (stock.offsetMm - fit.offsetMm) / 1000;
  const centreM = definition.dimensions.trackM / 2 + lateralShiftM;
  const archGapM = arch.gapM + rideHeightM - hubLiftM;
  const lipM = centreM + fit.widthM / 2 - arch.lipM;
  const innerM = centreM - fit.widthM / 2 - arch.innerM;

  const issues: FitmentIssue[] = [];
  const poke = lipM > POKE_M;
  if (archGapM < RUB_GAP_M || innerM < 0 || (poke && archGapM < POKE_RUB_GAP_M)) issues.push("rubbing");
  if (poke) issues.push("poke");
  if (archGapM > EXCESSIVE_GAP_M) issues.push("excessive_gap");
  if (lipM < -SUNKEN_M) issues.push("sunken");

  return { state: issues[0] ?? "clean", issues, archGapM, lipM, innerM, hubLiftM, lateralShiftM };
}
