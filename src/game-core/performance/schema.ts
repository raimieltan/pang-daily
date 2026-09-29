import { z } from 'zod';

const unit = z.number().min(0).max(1);
const positive = z.number().positive();
export const PERFORMANCE_CATEGORIES = ['engine', 'fuel_system', 'intake', 'exhaust', 'turbo', 'cooling', 'ecu', 'clutch', 'transmission', 'differential', 'supporting_mod'] as const;
export const FUEL_SYSTEMS = ['carb', 'efi'] as const;
export const ENGINE_LAYOUTS = ['inline_3', 'inline_4', 'inline_6', 'v6', 'v8', 'boxer_4'] as const;
export const engineDefinitionSchema = z.strictObject({
  id: z.string().min(1), displacementCc: positive, layout: z.enum(ENGINE_LAYOUTS),
  aspiration: z.enum(['naturally_aspirated', 'turbo']), fuelSystem: z.enum(FUEL_SYSTEMS),
  basePowerHp: positive, baseTorqueNm: positive, weightKg: positive, reliability: unit,
  /** Relative heat load; 1 = ordinary stock engine. */
  heatOutput: positive,
});
export type EngineDefinition = z.infer<typeof engineDefinitionSchema>;
export type FuelSystem = typeof FUEL_SYSTEMS[number];
export type PerformanceCategory = typeof PERFORMANCE_CATEGORIES[number];
export const installRequirementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('has_part'), partId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('has_category'), category: z.enum(PERFORMANCE_CATEGORIES) }),
  z.strictObject({ kind: z.literal('fuel_system'), fuelSystem: z.enum(FUEL_SYSTEMS) }),
  z.strictObject({ kind: z.literal('engine_layout'), layout: z.enum(ENGINE_LAYOUTS) }),
  z.strictObject({ kind: z.literal('chassis_tag'), tag: z.string().min(1) }),
  z.strictObject({ kind: z.literal('mechanic_level'), minimum: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('reputation'), minimum: z.number().nonnegative() }),
]);
export type InstallRequirement = z.infer<typeof installRequirementSchema>;
/** Additive deltas, composed once before clamping. Fractions: .1 = +10%, never a level. */
export const partEffectsSchema = z.strictObject({
  powerFraction: z.number().optional(), torqueFraction: z.number().optional(), weightKg: z.number().optional(),
  throttleResponse: z.number().optional(), turboLagSeconds: z.number().optional(),
  heatRate: z.number().optional(), coolingRate: z.number().optional(), reliability: z.number().optional(),
  fuelConsumption: z.number().optional(), tuneability: z.number().optional(),
  clutchCapacityNm: z.number().optional(), transmissionCapacityNm: z.number().optional(),
});
/** Optional mechanical hardware delivered by an installed part, independent of the runtime solver. */
export const mechanicalPartSchema = z.strictObject({
  differential: z.strictObject({ type: z.enum(['open', 'lsd', 'welded']), lock: unit, preloadNm: z.number().nonnegative() }).optional(),
  gearRatios: z.array(positive).min(1).optional(),
  steering: z.strictObject({ roadAngleDeg: z.number().min(5).max(65).optional(), driftAngleDeg: z.number().min(5).max(65).optional(), rackRate: positive.optional() }).optional(),
  suspension: z.strictObject({ frontSpring: positive.optional(), rearSpring: positive.optional(), damping: positive.optional(),
    frontAntiRoll: z.number().nonnegative().optional(), rearAntiRoll: z.number().nonnegative().optional(),
    rideHeightOffsetM: z.number().min(-.2).max(.2).optional(), camberDeg: z.number().min(-10).max(10).optional(),
    toeDeg: z.number().min(-3).max(3).optional(), casterDeg: z.number().min(0).max(15).optional() }).optional(),
});
export type MechanicalPartEffects = z.infer<typeof mechanicalPartSchema>;

export const performancePartSchema = z.strictObject({
  id: z.string().min(1), name: z.string().min(1), category: z.enum(PERFORMANCE_CATEGORIES),
  /** Supporting mods occupy named slots so several different supports can coexist. */
  slot: z.string().min(1), priceRangePhp: z.tuple([positive, positive]), conditionRange: z.tuple([unit, unit]),
  rarity: z.enum(['common', 'uncommon', 'rare']), compatibleTags: z.array(z.string().min(1)),
  requiredParts: z.array(z.string()), incompatibleParts: z.array(z.string()), requirements: z.array(installRequirementSchema),
  /** Equivalent replacements can satisfy supporting-part requirements across used/new variants. */
  satisfiesParts: z.array(z.string()).default([]),
  effects: partEffectsSchema,
  mechanical: mechanicalPartSchema.optional(), sketchiness: unit,
  engine: engineDefinitionSchema.optional(), fuelSystem: z.enum(FUEL_SYSTEMS).optional(),
  turbo: z.strictObject({ boostBar: z.number().min(0).max(2), spoolSeconds: z.number().nonnegative(), supportedFuelSystems: z.array(z.enum(FUEL_SYSTEMS)).min(1) }).optional(),
}).superRefine((p, ctx) => {
  if (p.priceRangePhp[0] > p.priceRangePhp[1] || p.conditionRange[0] > p.conditionRange[1]) ctx.addIssue({ code: 'custom', message: 'Invalid market range' });
  if ((p.category === 'engine') !== !!p.engine || (p.category === 'turbo') !== !!p.turbo || (p.category === 'fuel_system') !== !!p.fuelSystem) ctx.addIssue({ code: 'custom', message: 'Category payload mismatch' });
});
export type PerformancePart = z.infer<typeof performancePartSchema>;
/** Structural match for owned inventory items; actual condition, never seller claims. */
export type InstalledPerformancePart = { id: string; partId: string; condition: number | null };
export type InstallContext = { mechanicLevel: number; reputation: number };
