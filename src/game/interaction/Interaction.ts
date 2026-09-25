import type { DialogueId } from "../bridge/types";
import type { PlayerMode } from "../player/PlayerMode";
import { containsPoint } from "../world/layoutTools";
import type { LocationId, Rect, ZoneData } from "../world/WorldLayout";

/**
 * Renderer-agnostic interaction data: what the player can do where. Nothing here imports
 * Babylon, so layouts and resolution rules are checked in plain unit tests.
 *
 * Adding a new kind of interaction (refuel, browse shelves, talk to an NPC) means adding an
 * action here and authoring zones with it. Only actions the engine itself carries out (getting
 * in the car) need a runtime handler; the rest reach React as `interactionTriggered`.
 */
export const INTERACTION_ACTIONS = [
  "enter_vehicle",
  "start_race",
  "order_coffee",
  "hang_out",
  "talk_mechanic",
] as const;

export type InteractionAction = (typeof INTERACTION_ACTIONS)[number];

/** Zone id for authored interactions, `vehicle:<id>` for the car. */
export type InteractionId = string;

/** Where the player has to stand. Circles are for things that move (the car). */
export type InteractionArea =
  | { readonly kind: "rect"; readonly rect: Rect }
  | { readonly kind: "circle"; readonly x: number; readonly z: number; readonly radius: number };

export type Interactable = {
  readonly id: InteractionId;
  readonly action: InteractionAction;
  /** Prompt text: "Order a coffee". */
  readonly label: string;
  readonly area: InteractionArea;
  /** Higher wins when areas overlap. Default 0. */
  readonly priority?: number;
  /** Modes it is offered in. Default: on foot only. */
  readonly modes?: readonly PlayerMode[];
  readonly locationId?: LocationId;
  /** What the action is done to (the vehicle id for `enter_vehicle`). */
  readonly target?: string;
  /** Placeholder line fired with the interaction until dialogue is data-driven. */
  readonly dialogueId?: DialogueId;
};

/** Authored on an `interact` zone (see `WorldLayout.ZoneData`). */
export type ZoneInteraction = {
  readonly action: InteractionAction;
  readonly label: string;
  /** Metres the trigger area reaches past the zone rect, so counters work from the customer side. */
  readonly reach?: number;
  readonly priority?: number;
  readonly dialogueId?: DialogueId;
};

export function isInteractionAction(value: string): value is InteractionAction {
  return (INTERACTION_ACTIONS as readonly string[]).includes(value);
}

/** Interactables for every zone that authors one, in zone order. */
export function interactablesFromZones(zones: readonly ZoneData[]): Interactable[] {
  return zones.flatMap((zone) => {
    const i = zone.interaction;
    if (!i) return [];
    const reach = i.reach ?? 0;
    const { minX, minZ, maxX, maxZ } = zone.rect;
    return [
      {
        id: zone.id,
        action: i.action,
        label: i.label,
        area: { kind: "rect", rect: { minX: minX - reach, minZ: minZ - reach, maxX: maxX + reach, maxZ: maxZ + reach } },
        priority: i.priority,
        locationId: zone.locationId,
        dialogueId: i.dialogueId,
      } satisfies Interactable,
    ];
  });
}

export function areaContains(area: InteractionArea, x: number, z: number): boolean {
  if (area.kind === "rect") return containsPoint(area.rect, x, z);
  return Math.hypot(x - area.x, z - area.z) <= area.radius;
}

/** Ground distance from (x, z) to the area's centre: the tie-breaker between equal priorities. */
export function distanceToCentre(area: InteractionArea, x: number, z: number): number {
  if (area.kind === "circle") return Math.hypot(x - area.x, z - area.z);
  const r = area.rect;
  return Math.hypot(x - (r.minX + r.maxX) / 2, z - (r.minZ + r.maxZ) / 2);
}

/**
 * The one interaction to offer at (x, z) in `mode`, or null. Overlaps resolve the same way
 * every time: highest priority, then nearest centre, then id order.
 */
export function resolveInteraction(
  interactables: Iterable<Interactable>,
  x: number,
  z: number,
  mode: PlayerMode,
): Interactable | null {
  let best: Interactable | null = null;
  let bestDistance = Infinity;
  for (const candidate of interactables) {
    if (!(candidate.modes ?? DEFAULT_MODES).includes(mode) || !areaContains(candidate.area, x, z)) continue;
    const distance = distanceToCentre(candidate.area, x, z);
    if (!best || compare(candidate, distance, best, bestDistance) < 0) [best, bestDistance] = [candidate, distance];
  }
  return best;
}

const DEFAULT_MODES: readonly PlayerMode[] = ["walking"];
function compare(a: Interactable, da: number, b: Interactable, db: number): number {
  const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
  if (byPriority !== 0) return byPriority;
  // Quantization gives a transitive ordering, independent of source iteration order.
  const byDistance = Math.round(da * 1000) - Math.round(db * 1000);
  if (byDistance !== 0) return byDistance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
