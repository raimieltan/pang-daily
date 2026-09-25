import { z } from "zod";

/**
 * Reusable definition of a (fictionalized) car model: what the car *is*, independent of
 * any one owned copy. Pure data + Zod, no Babylon and no React, so the same entries can be
 * validated by game-core rules, persisted/served by the backend, and consumed by the
 * Babylon runtime (TECH_ARCHITECTURE §7, §8, §17).
 *
 * Owned-car state (condition, installed parts, paint) lives elsewhere and refers to a
 * definition by `id`. Runtime handling tuning and collision shapes are bound on the game
 * side (src/game/vehicles/VehicleDefinition.ts); this file only states the car's specs.
 */

export const VEHICLE_SCHEMA_VERSION = 1;

export const DRIVETRAINS = ["FWD", "RWD", "AWD"] as const;
export const WHEEL_IDS = ["fl", "fr", "rl", "rr"] as const;

/** Wear-tracked components. Each can degrade one or more stats via `condition.effects`. */
export const CONDITION_COMPONENTS = [
  "engine",
  "transmission",
  "suspension",
  "brakes",
  "tires",
  "body",
  "electrical",
] as const;

/** Stats that condition can degrade. */
export const CONDITION_STATS = ["power", "grip", "braking", "reliability"] as const;

/** Exterior customization slots, in ART_DIRECTION §6 priority order after wheels/ride height. */
export const EXTERIOR_SLOTS = [
  "hood",
  "bumper_front",
  "bumper_rear",
  "spoiler",
  "side_mirrors",
  "exhaust",
  "headlight_l",
  "headlight_r",
  "taillight_l",
  "taillight_r",
] as const;

/**
 * Default wheel socket names (`wheel_<fl|fr|rl|rr>_socket`). A socket is the runtime node a wheel
 * visual hangs from, inside the steer/spin hub; see docs/VEHICLE_ASSETS.md §4 and
 * src/game-core/wheels/README.md.
 */
export const wheelSocketName = (id: (typeof WHEEL_IDS)[number]) => `wheel_${id}_socket` as const;

export type Drivetrain = (typeof DRIVETRAINS)[number];
export type WheelId = (typeof WHEEL_IDS)[number];
export type ConditionComponent = (typeof CONDITION_COMPONENTS)[number];
export type ConditionStat = (typeof CONDITION_STATS)[number];
export type ExteriorSlot = (typeof EXTERIOR_SLOTS)[number];

const slug = z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "expected snake_case id");
const nodeName = z.string().min(1);
const unit = z.number().min(0).max(1);
const positive = z.number().positive();
const positiveInt = z.number().int().positive();
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "expected #rrggbb");
/** Car space: metres, +x right, +y up, +z forward, y = 0 at the tire contact patch. */
const vec3 = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });

const identitySchema = z.strictObject({
  /** Fictional marque. Never a real manufacturer name. */
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().min(1),
  year: z.number().int().min(1970).max(2015),
  bodyStyle: z.enum(["sedan", "hatchback", "coupe", "wagon"]),
  /** One line of flavour for garage/marketplace copy. */
  description: z.string().min(1),
});

const drivetrainSchema = z.strictObject({
  layout: z.enum(DRIVETRAINS),
  transmission: z.enum(["manual", "automatic"]),
  gears: z.number().int().min(3).max(6),
});

const powerSchema = z
  .strictObject({
    displacementCc: positiveInt,
    aspiration: z.enum(["naturally_aspirated", "turbo"]),
    /** Stock, healthy, at the crank. Condition scales this down. */
    peakPowerHp: positive,
    peakPowerRpm: positiveInt,
    peakTorqueNm: positive,
    peakTorqueRpm: positiveInt,
    redlineRpm: positiveInt,
  })
  .refine((p) => p.peakPowerRpm <= p.redlineRpm && p.peakTorqueRpm <= p.redlineRpm, {
    message: "peak power/torque rpm must not exceed redline",
  });

const weightSchema = z.strictObject({
  curbKg: positive,
  /** Static share of weight on the front axle. FWD sedans sit around 0.6. */
  frontWeightRatio: z.number().min(0.3).max(0.75),
});

const gripSchema = z.strictObject({
  /** Stock-tire friction coefficient on dry tarmac (~1.0 for a period economy tire). */
  tireGrip: positive,
  tireSize: z.string().regex(/^\d{3}\/\d{2}R\d{2}$/, "expected e.g. 175/70R13"),
});

const brakingSchema = z.strictObject({
  /** Full-pedal deceleration on dry grip with healthy brakes. */
  decelerationMps2: positive,
  /** Share of braking on the front axle. */
  frontBias: unit,
  front: z.enum(["disc", "drum"]),
  rear: z.enum(["disc", "drum"]),
});

const reliabilitySchema = z.strictObject({
  /** 0–1 chance-style score for a healthy car: higher = fewer breakdowns. */
  baseline: unit,
  /** Multiplies component wear per km. 1 = average for the era. */
  wearRate: positive,
  /** Components that fail first on this model; flavour for mechanics and inspection. */
  weakPoints: z.array(z.enum(CONDITION_COMPONENTS)),
});

const dimensionsSchema = z.strictObject({
  lengthM: positive,
  widthM: positive,
  heightM: positive,
  wheelbaseM: positive,
  trackM: positive,
  wheelRadiusM: positive,
});

const marketSchema = z.strictObject({
  /** Typical used price in PHP for an average example. */
  basePricePhp: positiveInt,
  /** 0 = parts are hunted in junkyards, 1 = every talyer has them. */
  partsAvailability: unit,
});

/**
 * One exterior slot on the model. `stockNode` is the mesh an aftermarket part replaces (null =
 * empty slot, e.g. no factory spoiler). Parts mount at, in order of preference: an
 * `attach_<slot>` empty in the GLB, `anchor`, or the centre of the stock mesh.
 */
const attachmentSchema = z
  .strictObject({
    slot: z.enum(EXTERIOR_SLOTS),
    stockNode: nodeName.nullable(),
    anchor: vec3.nullable(),
  })
  .refine((a) => a.stockNode !== null || a.anchor !== null, {
    message: "an empty slot (no stockNode) needs an anchor",
  });

/**
 * Contract between the Blender export and the runtime importer. Renderer-agnostic: node and
 * material names plus numbers; the Babylon importer enforces it and fails on missing nodes.
 */
const modelSchema = z.strictObject({
  url: z.string().min(1),
  /** Multiplies the file's units into metres (1 for a correct Blender export). */
  unitScale: positive,
  /** Static bodywork that rides on the suspension (moved by ride height). */
  bodyNodes: z.array(nodeName).min(1),
  /** Separate wheel meshes. The importer re-pivots each at its geometric centre. */
  wheelNodes: z.strictObject({ fl: nodeName, fr: nodeName, rl: nodeName, rr: nodeName }),
  /** Material recoloured by paint customization. */
  paintMaterial: nodeName,
  attachments: z.array(attachmentSchema),
  /** Asset budget (ART_DIRECTION §14). Exceeding it is reported, not fatal. */
  budget: z.strictObject({
    maxTriangles: positiveInt,
    maxDrawCalls: positiveInt,
    maxMaterials: positiveInt,
  }),
});

const visualSchema = z
  .strictObject({
    model: modelSchema,
    /** Visual ride-height offset from the modelled stance, in metres (negative = lowered). */
    rideHeight: z.strictObject({ minM: z.number(), maxM: z.number(), defaultM: z.number() }),
    defaultPaint: hexColor,
  })
  .refine((v) => v.rideHeight.minM <= v.rideHeight.defaultM && v.rideHeight.defaultM <= v.rideHeight.maxM, {
    message: "rideHeight must satisfy minM <= defaultM <= maxM",
    path: ["rideHeight"],
  })
  .refine((v) => new Set(v.model.attachments.map((a) => a.slot)).size === v.model.attachments.length, {
    message: "attachment slots must be unique",
    path: ["model", "attachments"],
  });

/** The overall size and placement of a mounted wheel + tire. Shared by stock specs and wheel parts. */
export const wheelFitSchema = z.strictObject({
  /** Overall tire diameter, in metres. Drives visual scale, hub height and arch gap. */
  diameterM: positive,
  /** Tread width, in metres. */
  widthM: positive,
  /** ET in millimetres: positive pulls the wheel into the arch, negative pushes it out. */
  offsetMm: z.number().int().min(-60).max(80),
});

export type WheelFit = z.infer<typeof wheelFitSchema>;

/**
 * Wheel sockets, the factory wheels and the arch around them. Fitment reads these; the runtime
 * names its socket nodes after `sockets`. All lateral numbers are distances from the centreline.
 */
const wheelsSchema = z
  .strictObject({
    sockets: z.strictObject({ fl: nodeName, fr: nodeName, rl: nodeName, rr: nodeName }),
    /** The GLB's own wheels. `massKg` is one wheel + tire; wheel parts are weighed against it. */
    stock: wheelFitSchema.extend({ massKg: positive }),
    arch: z.strictObject({
      /** Tire top to arch lip at the default ride height with stock wheels. */
      gapM: positive,
      /** Fender lip. A tire face outside this pokes; well inside it looks sunken. */
      lipM: positive,
      /** Nearest inboard obstruction (strut, inner liner). A tire face inside this rubs. */
      innerM: positive,
    }),
  })
  .refine((w) => new Set(Object.values(w.sockets)).size === 4, { message: "wheel socket names must be unique", path: ["sockets"] })
  .refine((w) => w.arch.innerM < w.arch.lipM, { message: "arch innerM must be inside lipM", path: ["arch"] });

/**
 * Condition hook: at component condition `c` (0–1), `stat` is scaled by `1 - maxLoss * (1 - c)`.
 * Several effects on the same stat multiply. See `resolveVehicleStats`.
 */
const conditionEffectSchema = z.strictObject({
  component: z.enum(CONDITION_COMPONENTS),
  stat: z.enum(CONDITION_STATS),
  maxLoss: unit,
});

export const vehicleConditionSchema = z.strictObject(
  Object.fromEntries(CONDITION_COMPONENTS.map((c) => [c, unit])) as Record<ConditionComponent, typeof unit>,
);

export type VehicleCondition = z.infer<typeof vehicleConditionSchema>;

const conditionSchema = z.strictObject({
  effects: z.array(conditionEffectSchema),
  /** Condition of a typical example when first offered (starter car, marketplace default). */
  typical: vehicleConditionSchema,
});

export const vehicleDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(VEHICLE_SCHEMA_VERSION),
  id: slug,
  identity: identitySchema,
  drivetrain: drivetrainSchema,
  power: powerSchema,
  weight: weightSchema,
  grip: gripSchema,
  braking: brakingSchema,
  reliability: reliabilitySchema,
  dimensions: dimensionsSchema,
  market: marketSchema,
  visual: visualSchema,
  wheels: wheelsSchema,
  condition: conditionSchema,
});

export type VehicleDefinition = z.infer<typeof vehicleDefinitionSchema>;
export type VehicleModelSpec = VehicleDefinition["visual"]["model"];
export type VehicleAttachmentSpec = VehicleModelSpec["attachments"][number];
export type VehicleWheelsSpec = VehicleDefinition["wheels"];

/** Throws with the offending path when a definition is malformed (e.g. loaded from JSON or the API). */
export function parseVehicleDefinition(data: unknown): VehicleDefinition {
  return vehicleDefinitionSchema.parse(data);
}
