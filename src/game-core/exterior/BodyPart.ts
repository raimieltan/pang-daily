import { z } from "zod";
import { EXTERIOR_SLOTS, type ExteriorSlot } from "../vehicles/VehicleDefinition";

/**
 * An exterior body part you can bolt, screw or zip-tie on: lips, chins, bumpers, skirts, wings,
 * hoods, fenders, mirrors, roof bits and small accessories. Pure data + Zod, no Babylon, so the
 * marketplace, garage, backend and runtime agree on one shape (TECH_ARCHITECTURE §17). Owned
 * copies live in the inventory with their own condition and finish; this is the template.
 */

const slug = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "expected snake_case id");
const unit = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "expected #rrggbb");
const range = (n: z.ZodNumber) => z.tuple([n, n]).refine(([min, max]) => min <= max, { message: "range must be [min, max]" });
const vec3 = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });

export const BODY_PART_CATEGORIES = [
  "front_lip",
  "chin",
  "front_bumper",
  "rear_bumper",
  "side_skirt",
  "spoiler",
  "hood",
  "fender",
  "mirror",
  "roof_accessory",
  "accessory",
] as const;
export type BodyPartCategory = (typeof BODY_PART_CATEGORIES)[number];

/** Which of the car's exterior sockets a category may use. Only fenders and accessories have a choice. */
export const CATEGORY_SOCKETS: Readonly<Record<BodyPartCategory, readonly ExteriorSlot[]>> = {
  front_lip: ["front_lip"],
  chin: ["chin"],
  front_bumper: ["bumper_front"],
  rear_bumper: ["bumper_rear"],
  side_skirt: ["side_skirts"],
  spoiler: ["spoiler"],
  hood: ["hood"],
  fender: ["fender_fl", "fender_fr"],
  mirror: ["side_mirrors"],
  roof_accessory: ["roof"],
  accessory: ["accessory_front", "accessory_rear"],
};

/** Every socket a body part can use, i.e. the slots `ExteriorSystem` manages. */
export const BODY_PART_SOCKETS: readonly ExteriorSlot[] = [...new Set(Object.values(CATEGORY_SOCKETS).flat())];

/**
 * What the panel surface looks like. `body_color` follows the car's paint; `mismatched` is
 * someone else's paint (`paint.mismatchColor`); `damaged` is faded, chalky and beaten.
 * Scratches and cracks come on top, from condition (see `resolveBodyPartLook`).
 */
export const PAINT_FINISHES = ["body_color", "primer", "mismatched", "bare_plastic", "fake_carbon", "damaged"] as const;
export type PaintFinish = (typeof PAINT_FINISHES)[number];

/** Finishes that need paint on the part: a non-paintable part can't be sprayed into them. */
export const PAINTED_FINISHES: readonly PaintFinish[] = ["body_color", "primer", "mismatched"];

/** What it's made of: fibreglass cracks, polyurethane scuffs and bends, ABS goes chalky, steel dents. */
export const CONSTRUCTIONS = ["abs", "polyurethane", "fiberglass", "steel", "aluminium"] as const;
export type Construction = (typeof CONSTRUCTIONS)[number];

const PLASTIC_CONSTRUCTIONS: readonly Construction[] = ["abs", "polyurethane"];

export const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Matches any car in `compatibleTags`. Universal parts usually come with worse `fitment`. */
export const UNIVERSAL_TAG = "universal";

export const bodyPartSchema = z
  .strictObject({
    id: slug,
    name: z.string().min(1),
    /** Seller-speak for the listing. */
    description: z.string().min(1),
    /** Fitment note for the listing. */
    fits: z.string().min(1),
    category: z.enum(BODY_PART_CATEGORIES),
    /** The car socket it mounts on; must be one of `CATEGORY_SOCKETS[category]`. */
    socket: z.enum(EXTERIOR_SLOTS),
    /** GLB in car axes, origin at the socket (docs/VEHICLE_ASSETS.md §8). Its `panel` material takes the finish. */
    assetPath: z.string().regex(/\.glb$/, "expected a .glb path"),
    /** Fine placement against the socket, for parts that sit a touch off the car's own anchor. */
    transform: z
      .strictObject({ positionM: vec3, rotationDeg: vec3, scale: z.number().positive() })
      .default({ positionM: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 }),
    /** Vehicle `tags` it bolts onto; any match fits. `universal` fits everything. */
    compatibleTags: z.array(slug).min(1),
    construction: z.enum(CONSTRUCTIONS),
    rarity: z.enum(RARITIES),
    /** How well the mould lines up on a matching car: 1 = OEM gaps, 0.4 = drill it and zip-tie it. */
    fitment: unit,
    paint: z.strictObject({
      /** Can take paint (body colour, primer, a respray). Bare plastic trim and real weave can't. */
      paintable: z.boolean(),
      /** How a copy arrives from the seller. */
      finish: z.enum(PAINT_FINISHES),
      /** The donor car's colour, for `mismatched`. */
      mismatchColor: hexColor.nullable(),
    }),
    market: z.strictObject({
      /** PHP at 100% condition. */
      priceRangePhp: range(z.number().int().positive()),
      /** Bounds a generated copy's condition (scuffs, cracks, missing clips). */
      conditionRange: range(unit),
    }),
    /** Small, mostly-for-show effects. Weight is against the stock panel (a fibreglass hood is negative). */
    effects: z.strictObject({
      weightKg: z.number().min(-20).max(20),
      /** Fractional drag change: a huge wing is +, a tidy lip about 0. */
      drag: z.number().min(-0.05).max(0.1),
      /** Fractional grip gain at speed. Honest numbers: tiny. */
      downforce: z.number().min(0).max(0.05),
      /** Airflow to the radiator: vents +, a chin blocking the intake −. Feeds overheating later. */
      cooling: z.number().min(-0.2).max(0.2),
      /** Porma points at the tambayan when it looks right. Can be negative. */
      reputation: z.number().int().min(-5).max(10),
    }),
  })
  .refine((p) => CATEGORY_SOCKETS[p.category].includes(p.socket), {
    message: "socket must be one of the category's sockets",
    path: ["socket"],
  })
  .refine((p) => p.paint.paintable || !PAINTED_FINISHES.includes(p.paint.finish), {
    message: "a non-paintable part can't come painted",
    path: ["paint", "finish"],
  })
  .refine((p) => p.paint.finish !== "mismatched" || p.paint.mismatchColor !== null, {
    message: "a mismatched part needs its mismatchColor",
    path: ["paint", "mismatchColor"],
  })
  .refine((p) => p.paint.finish !== "bare_plastic" || PLASTIC_CONSTRUCTIONS.includes(p.construction), {
    message: "bare plastic requires ABS or polyurethane construction",
    path: ["paint", "finish"],
  });

export type BodyPart = z.infer<typeof bodyPartSchema>;
export type BodyPartInput = z.input<typeof bodyPartSchema>;

/** Throws with the offending path when a body part is malformed (JSON, API). */
export function parseBodyPart(data: unknown): BodyPart {
  return bodyPartSchema.parse(data);
}

/** Whether `part` bolts onto a car with these `tags`. */
export function fitsVehicle(part: BodyPart, tags: readonly string[]): boolean {
  return part.compatibleTags.some((tag) => tag === UNIVERSAL_TAG || tags.includes(tag));
}

/**
 * Whether an owned copy can be given `finish`. Paintable parts take any finish their material
 * allows (only plastics strip back to bare plastic; paint never hides cracks: see
 * `resolveBodyPartLook`); unpainted ones only keep what they are or get beaten up.
 */
export function canRefinish(part: BodyPart, finish: PaintFinish): boolean {
  if (finish === "mismatched" && part.paint.mismatchColor === null) return false;
  if (finish === "bare_plastic" && !PLASTIC_CONSTRUCTIONS.includes(part.construction)) return false;
  if (part.paint.paintable) return true;
  return finish === part.paint.finish || finish === "damaged";
}
