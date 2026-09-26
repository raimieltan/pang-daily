import { UNIVERSAL_TAG, type BodyPart, type Construction, type PaintFinish } from "./BodyPart";

/** Surface wear from condition. Only brittle parts crack; the rest scuff, bend and dent. */
export const WEAR_STATES = ["clean", "scratched", "cracked"] as const;
export type WearState = (typeof WEAR_STATES)[number];

/** How the part sits on the car, from the mould's fitment, the copy's condition and the match. */
export const FIT_STATES = ["flush", "gappy", "zip_tied"] as const;
export type FitState = (typeof FIT_STATES)[number];

export const SCRATCHED_BELOW = 0.65;
export const CRACKED_BELOW = 0.35;
const BRITTLE: readonly Construction[] = ["fiberglass", "abs"];
export const FLUSH_FROM = 0.75;
export const GAPPY_FROM = 0.5;
/** A universal part on a car it wasn't moulded for fits this much worse. */
export const UNIVERSAL_FIT = 0.85;
/** At fit 0, the part hangs this far off its socket and tilts this much. */
export const MAX_GAP_M = 0.025;
export const MAX_TILT_DEG = 4;

/** Panel surface per finish, sRGB. `null` colour = taken from the car or the part (see below). */
const FINISH_SURFACE: Record<PaintFinish, { color: string | null; roughness: number; metallic: number; clearCoat: number }> = {
  body_color: { color: null, roughness: 0.45, metallic: 0.2, clearCoat: 0.5 },
  primer: { color: "#8b8e89", roughness: 0.95, metallic: 0, clearCoat: 0 },
  // Someone else's paint, on a different age of clear coat.
  mismatched: { color: null, roughness: 0.55, metallic: 0.2, clearCoat: 0.25 },
  bare_plastic: { color: "#26272a", roughness: 0.85, metallic: 0, clearCoat: 0 },
  fake_carbon: { color: "#18191c", roughness: 0.25, metallic: 0.15, clearCoat: 1 },
  damaged: { color: null, roughness: 1, metallic: 0, clearCoat: 0 },
};
const CHALK = "#9a968c";
const SCUFF = "#b8b6b0";
const GRIME = "#2b2926";

export type BodyPartLook = {
  finish: PaintFinish;
  /** Panel colour, sRGB `#rrggbb`, with wear applied. */
  color: string;
  roughness: number;
  metallic: number;
  clearCoat: number;
  wear: WearState;
  /** 0–1: how well it sits. */
  fit: number;
  fitState: FitState;
  /** Visual misfit: the part hangs this far below its socket and pitches this much. */
  gapM: number;
  tiltDeg: number;
};

export type LookInput = {
  /** The owned copy's condition (null = doesn't wear, treated as 1). */
  condition: number | null;
  /** Owner's refinish, or null for how the part came. */
  finish?: PaintFinish | null;
  /** The car's paint, sRGB, for `body_color`. */
  bodyColor: string;
  /** The car's `tags`, to tell a made-for fit from a universal one. */
  vehicleTags: readonly string[];
};

/**
 * How an installed copy looks: finish (inherited body colour, primer, someone else's red...),
 * wear from condition (scuffs, then cracks on fibreglass/ABS) and fit (tight, gappy, zip-tied).
 * Pure, so the garage preview, the listing photos and the runtime agree.
 */
export function resolveBodyPartLook(part: BodyPart, input: LookInput): BodyPartLook {
  const health = input.condition === null ? 1 : clamp01(input.condition);
  const finish = input.finish ?? part.paint.finish;
  const surface = FINISH_SURFACE[finish];
  const painted = finish === "mismatched" ? part.paint.mismatchColor ?? input.bodyColor : input.bodyColor;
  let color = surface.color ?? (finish === "damaged" ? mix(painted, CHALK, 0.55) : painted);
  let { roughness, clearCoat } = surface;

  let wear: WearState = health < CRACKED_BELOW && BRITTLE.includes(part.construction) ? "cracked"
    : health < SCRATCHED_BELOW ? "scratched" : "clean";
  if (finish === "damaged" && wear === "clean") wear = "scratched";
  if (wear === "scratched") {
    color = mix(color, SCUFF, 0.12);
    roughness = Math.min(1, roughness + 0.2);
    clearCoat *= 0.4;
  } else if (wear === "cracked") {
    color = mix(color, GRIME, 0.25);
    roughness = 1;
    clearCoat = 0;
  }

  const direct = part.compatibleTags.some((tag) => tag !== UNIVERSAL_TAG && input.vehicleTags.includes(tag));
  const fit = part.fitment * (0.75 + 0.25 * health) * (direct ? 1 : UNIVERSAL_FIT);
  const fitState: FitState = fit >= FLUSH_FROM ? "flush" : fit >= GAPPY_FROM ? "gappy" : "zip_tied";
  return {
    finish, color, roughness, metallic: surface.metallic, clearCoat, wear, fit, fitState,
    gapM: (1 - fit) * MAX_GAP_M, tiltDeg: (1 - fit) * MAX_TILT_DEG,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** sRGB mix, good enough for tints. */
function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t).toString(16).padStart(2, "0")).join("")}`;
}
