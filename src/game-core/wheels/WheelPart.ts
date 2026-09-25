import { z } from "zod";
import { wheelFitSchema } from "../vehicles/VehicleDefinition";

/**
 * A wheel + tire assembly you can bolt on: the same set on all four sockets. Pure data + Zod, no
 * Babylon, so the marketplace, garage, backend and runtime agree on one shape (TECH_ARCHITECTURE
 * §17). Physical numbers drive the visual swap and fitment; `modifiers` are the only handling
 * effect. Owned copies live in the inventory with their own condition; this is the template.
 */

const slug = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "expected snake_case id");
const unit = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "expected #rrggbb");
/** Fractional change on a stat, 0 = same as stock. Kept small: wheels flavour a car, they don't remake it. */
const modifier = z.number().min(-0.3).max(0.3);
const range = (n: z.ZodNumber) => z.tuple([n, n]).refine(([min, max]) => min <= max, { message: "range must be [min, max]" });

export const WHEEL_STYLES = ["steelie", "multi_spoke", "deep_dish"] as const;
export type WheelStyle = (typeof WHEEL_STYLES)[number];

export const wheelPartSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  /** Seller-speak for the listing. */
  description: z.string().min(1),
  /** Bolt pattern / hub notes for the listing; not enforced yet. */
  fits: z.string().min(1),
  /** One-wheel GLB (docs/VEHICLE_ASSETS.md §7). Cloned onto every socket and scaled to `fit`. */
  assetPath: z.string().regex(/\.glb$/, "expected a .glb path"),
  rimDiameterIn: z.number().int().min(12).max(20),
  tireSize: z.string().regex(/^\d{3}\/\d{2}R\d{2}$/, "expected e.g. 195/55R15"),
  fit: wheelFitSchema,
  /** One wheel + tire. Compared against the car's stock wheel: heavier is slower. */
  massKg: z.number().positive(),
  market: z.strictObject({
    /** PHP for the set at 100% condition. */
    priceRangePhp: range(z.number().int().positive()),
    /** Bounds a generated copy's condition (bends, curb rash, old rubber). */
    conditionRange: range(unit),
  }),
  modifiers: z.strictObject({ grip: modifier, braking: modifier, acceleration: modifier }),
  visual: z.strictObject({
    style: z.enum(WHEEL_STYLES),
    /** sRGB tint for the `rim` material; the asset keeps its own tire/lug materials. */
    rimColor: hexColor,
  }),
});

export type WheelPart = z.infer<typeof wheelPartSchema>;

/** Throws with the offending path when a wheel part is malformed (JSON, API). */
export function parseWheelPart(data: unknown): WheelPart {
  return wheelPartSchema.parse(data);
}
