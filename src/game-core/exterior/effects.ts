import { NO_MODIFIERS, type StatModifiers } from "../vehicles/vehicleStats";
import type { BodyPart, Construction } from "./BodyPart";
import type { BodyPartLook, WearState } from "./look";

/** Share of a part's drag change that shows up as lost pull. Keeps a huge wing at a few percent. */
export const DRAG_ACCELERATION_SHARE = 0.5;
/** A flapping, gappy panel adds up to this much drag at fit 0. */
export const MISFIT_DRAG = 0.01;
/** Share of the part's mid price it takes to put a worn copy right, by wear. */
const WEAR_REPAIR: Record<WearState, number> = { clean: 0, scratched: 0.2, cracked: 0.5 };
/** Fibreglass needs glassing; polyurethane plastic-welds cheap. */
const CONSTRUCTION_REPAIR: Record<Construction, number> = { abs: 1, polyurethane: 0.8, fiberglass: 1.2, steel: 1, aluminium: 1.1 };
/** Re-hanging a part that doesn't sit right: brackets, clips, a talyer hour. */
const REFIT_SHARE = 0.1;
const REPAINT_SHARE = 0.3;

export type FittedBodyPart = { part: BodyPart; look: BodyPartLook };

export type ExteriorEffects = {
  /** Feeds `resolveVehicleStats` alongside the wheels'. */
  modifiers: StatModifiers;
  /** Summed fractional drag change, misfit included. */
  drag: number;
  downforce: number;
  /** Radiator airflow change; clamped to ±0.3. Read by overheating later. */
  cooling: number;
  /** Porma points: what the tambayan thinks, after finish, wear and fit. */
  reputation: number;
  /** PHP to get every fitted part to clean and flush (wear, refit, a respray on beaten panels). */
  repairCostPhp: number;
};

export const NO_EXTERIOR_EFFECTS: ExteriorEffects = {
  modifiers: NO_MODIFIERS, drag: 0, downforce: 0, cooling: 0, reputation: 0, repairCostPhp: 0,
};

/**
 * What the fitted body parts do, lightly: weight, drag against pull, a sliver of grip from
 * downforce, cooling, reputation and repair cost. Reads each part's look (not the raw condition),
 * so every number follows from what you can see on the car.
 */
export function exteriorEffects(fitted: readonly FittedBodyPart[]): ExteriorEffects {
  let weight = 0, drag = 0, downforce = 0, cooling = 0, reputation = 0, repair = 0;
  for (const { part, look } of fitted) {
    const e = part.effects;
    weight += e.weightKg;
    drag += e.drag + (1 - look.fit) * MISFIT_DRAG;
    downforce += e.downforce;
    cooling += e.cooling;
    reputation += partReputation(part, look);
    const [low, high] = part.market.priceRangePhp;
    const mid = (low + high) / 2;
    repair += mid * (WEAR_REPAIR[look.wear] * CONSTRUCTION_REPAIR[part.construction]
      + (look.fitState === "flush" ? 0 : REFIT_SHARE) + (look.finish === "damaged" ? REPAINT_SHARE : 0));
  }
  return {
    modifiers: { grip: 1 + downforce, braking: 1, acceleration: 1 - DRAG_ACCELERATION_SHARE * drag, addedWeightKg: weight },
    drag, downforce, cooling: Math.max(-0.3, Math.min(0.3, cooling)), reputation,
    repairCostPhp: Math.ceil(repair / 10) * 10,
  };
}

/** Looks only count when they look finished: primer halves the porma, cracks and zip ties cost it. */
export function partReputation(part: BodyPart, look: BodyPartLook): number {
  let points = part.effects.reputation;
  if (points > 0 && (look.finish === "primer" || look.finish === "mismatched" || look.finish === "damaged")) points = Math.floor(points / 2);
  if (look.wear === "cracked") points -= 2;
  else if (look.wear === "scratched") points -= 1;
  if (look.fitState === "zip_tied") points -= 1;
  return points;
}
