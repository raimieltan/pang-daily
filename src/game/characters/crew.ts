import { box, ring, round, taper, type CharacterAppearance } from "./CharacterVisual";

/**
 * The Kyo regulars: named, recurring characters on the shared CharacterVisual rig. Identity
 * reads from hair silhouette, glasses/brows and outfit, not facial detail — same budget as
 * any café NPC. Parts are rebuilt per call because CharacterVisual transforms them in place.
 */
export type CrewMember = {
  readonly id: "Sean" | "MichaelHandumon" | "Casey";
  readonly displayName: string;
  readonly nickname?: string;
  readonly appearance: () => CharacterAppearance;
};

const TAN = "#b07a52";
const HAIR = "#1c1a19";

export const SEAN: CrewMember = {
  id: "Sean",
  displayName: "Sean",
  appearance: () => ({
    skin: TAN, shirt: "#e9e1cd", pants: "#a68660", shoes: "#5a4a3c",
    sleeves: "long", oversized: true, pocket: false,
    torso: [
      // Chunky ribbed crew neck.
      taper([0, 0.37, 0], [0.17, 0.045, 0.16], "#ddd3bc", 1),
    ],
    head: [
      // Centre-parted curtains over a crown cap, grown out to the lower ears and nape.
      round([0, 0.07, -0.015], [0.228, 0.155, 0.222], HAIR),
      box([-0.052, 0.085, 0.093], [0.085, 0.055, 0.035], HAIR, [0.25, 0, 0.42]),
      box([0.052, 0.085, 0.093], [0.085, 0.055, 0.035], HAIR, [0.25, 0, -0.42]),
      box([-0.103, 0.0, -0.025], [0.045, 0.16, 0.16], HAIR, [0, 0, 0.08]),
      box([0.103, 0.0, -0.025], [0.045, 0.16, 0.16], HAIR, [0, 0, -0.08]),
      box([0, -0.03, -0.088], [0.2, 0.15, 0.06], HAIR, [-0.18, 0, 0]),
      // Round thin wire glasses.
      ring([-0.046, 0.026, 0.108], 0.056, "#8d8676"),
      ring([0.046, 0.026, 0.108], 0.056, "#8d8676"),
      box([0, 0.03, 0.11], [0.034, 0.006, 0.006], "#8d8676"),
      box([-0.097, 0.03, 0.055], [0.006, 0.006, 0.105], "#8d8676"),
      box([0.097, 0.03, 0.055], [0.006, 0.006, 0.105], "#8d8676"),
      // Light moustache and chin tuft.
      box([0, -0.047, 0.1], [0.05, 0.008, 0.01], "#3a2e26"),
      box([0, -0.1, 0.09], [0.032, 0.026, 0.014], "#3a2e26"),
    ],
  }),
};

export const MICHAEL_HANDUMON: CrewMember = {
  id: "MichaelHandumon",
  displayName: "Michael Handumon",
  nickname: "Kent",
  appearance: () => ({
    skin: TAN, shirt: "#bdbcb8", pants: "#5c5e61", shoes: "#e6e3dc",
    sleeves: "long", oversized: true, pocket: false,
    torso: [
      // White undershirt with its black gothic neck text, under the quarter-zip's big collar.
      taper([0, 0.372, 0], [0.145, 0.04, 0.145], "#f1f0ec", 1),
      box([0, 0.382, 0.074], [0.05, 0.012, 0.004], "#141414"),
      box([-0.058, 0.36, 0.1], [0.1, 0.055, 0.075], "#cfceca", [0.35, 0, 0.55]),
      box([0.058, 0.36, 0.1], [0.1, 0.055, 0.075], "#cfceca", [0.35, 0, -0.55]),
      box([0, 0.375, -0.05], [0.22, 0.06, 0.13], "#cfceca"),
      box([0, 0.27, 0.132], [0.008, 0.15, 0.006], "#8a8a88"),
      box([0.009, 0.2, 0.136], [0.012, 0.022, 0.006], "#6d6d6b"),
    ],
    head: [
      // Squarer jaw than Sean.
      box([0, -0.07, 0.008], [0.178, 0.1, 0.182], TAN),
      // Tall brushed-up quiff swept back, with full sides and crown.
      round([0, 0.075, -0.02], [0.226, 0.155, 0.216], HAIR),
      box([0, 0.155, 0.045], [0.205, 0.095, 0.1], HAIR, [-0.38, 0, 0]),
      box([0, 0.165, -0.035], [0.212, 0.085, 0.15], HAIR, [0.12, 0, 0]),
      box([0.015, 0.2, 0.07], [0.165, 0.05, 0.065], HAIR, [-0.55, 0, 0.08]),
      box([-0.102, 0.05, -0.015], [0.048, 0.12, 0.17], HAIR),
      box([0.102, 0.05, -0.015], [0.048, 0.12, 0.17], HAIR),
      round([0, 0.02, -0.07], [0.2, 0.16, 0.1], HAIR),
      // Thick brows.
      box([-0.046, 0.055, 0.099], [0.038, 0.013, 0.012], HAIR),
      box([0.046, 0.055, 0.099], [0.038, 0.013, 0.012], HAIR),
    ],
  }),
};

export const CASEY: CrewMember = {
  id: "Casey",
  displayName: "Casey",
  appearance: () => ({
    skin: TAN, shirt: "#c8b695", pants: "#1e1e20", shoes: "#dcd7cc",
    shorts: true, oversized: true, pocket: false,
    torso: [
      // Understated generic print lines, thin chain and a dark oval pendant.
      box([0.035, 0.24, 0.138], [0.1, 0.012, 0.004], "#4a4238"),
      box([-0.075, 0.2, 0.133], [0.05, 0.008, 0.004], "#4a4238"),
      box([0.095, 0.29, 0.135], [0.045, 0.008, 0.004], "#4a4238"),
      box([-0.034, 0.345, 0.126], [0.006, 0.08, 0.006], "#c9a54a", [0, 0, 0.5]),
      box([0.034, 0.345, 0.126], [0.006, 0.08, 0.006], "#c9a54a", [0, 0, -0.5]),
      round([0, 0.3, 0.14], [0.025, 0.032, 0.012], "#2d2a26"),
    ],
    head: [
      // Volume on top, a few fringe sections toward the forehead, short tidy sides.
      round([0, 0.08, -0.02], [0.222, 0.16, 0.212], HAIR),
      box([0, 0.14, 0], [0.19, 0.07, 0.18], HAIR, [-0.1, 0, 0]),
      box([-0.045, 0.088, 0.098], [0.07, 0.06, 0.03], HAIR, [0.2, 0, 0.3]),
      box([0.04, 0.092, 0.1], [0.06, 0.05, 0.03], HAIR, [0.2, 0, -0.25]),
      box([0, 0.105, 0.102], [0.05, 0.055, 0.03], HAIR, [0.25, 0, 0]),
      box([-0.1, 0.035, -0.02], [0.03, 0.08, 0.15], HAIR),
      box([0.1, 0.035, -0.02], [0.03, 0.08, 0.15], HAIR),
      box([-0.046, 0.052, 0.098], [0.034, 0.009, 0.01], HAIR),
      box([0.046, 0.052, 0.098], [0.034, 0.009, 0.01], HAIR),
      // Wide smile with a thin braces line across the teeth.
      box([0, -0.06, 0.098], [0.07, 0.018, 0.012], "#f0ece2"),
      box([0, -0.06, 0.105], [0.066, 0.005, 0.004], "#8a8f96"),
    ],
  }),
};

export const CREW = [SEAN, MICHAEL_HANDUMON, CASEY] as const;
