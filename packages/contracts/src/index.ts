import { z } from 'zod';
import type { SocialState } from '@pang-daily/game-core/social/contract';
import { vehicleTireStateSchema } from '@pang-daily/game-core/tires/TireSession';
import { tuneIdSchema } from '@pang-daily/game-core/tuning/tunes';

export const SAVE_VERSION = 2;
export const CONTENT_VERSION = 'm3-content-1';
export const BOOTSTRAP_VERSION = 1;
export const credentialsSchema = z.strictObject({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/, 'Use 3–32 letters, numbers or underscores.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128),
});
export type Credentials = z.infer<typeof credentialsSchema>;
const exactInteger = z.string().max(19).regex(/^\d+$/);
const fraction = z.number().min(0).max(1);
const vehicleCondition = z.strictObject({ engine: fraction, transmission: fraction, suspension: fraction, brakes: fraction,
  tires: fraction, body: fraction, electrical: fraction, clutch: fraction, cooling: fraction });
export const bootstrapSchema = z.object({
  bootstrapVersion: z.literal(BOOTSTRAP_VERSION), saveVersion: z.literal(SAVE_VERSION), contentVersion: z.literal(CONTENT_VERSION),
  revision: exactInteger,
  profile: z.object({ id: z.string().uuid(), displayName: z.string(), activeVehicleId: z.string().uuid() }),
  economy: z.object({ balanceCentavos: exactInteger, revision: exactInteger, towCount: z.number().int().nonnegative().optional() }),
  vehicles: z.array(z.object({ id: z.string().uuid(), definitionId: z.string(), condition: vehicleCondition,
    conditionRevision: exactInteger, fuelLiters: z.number().nonnegative(), paint: z.string().regex(/^#[0-9a-f]{6}$/i),
    rideHeightM: z.number().min(-.15).max(.15), stockSpoilerRemoved: z.boolean(),
    /** Tito Jun's setup; absent from older servers = street. */
    tune: tuneIdSchema.optional(),
    /** Simulated wheel assemblies; `state` null = never saved (a stock set). */
    tires: z.object({ revision: exactInteger, state: vehicleTireStateSchema.nullable() }).optional() })).min(1),
  inventory: z.object({ revision: exactInteger,
    parts: z.array(z.object({ id: z.string().uuid(), definitionId: z.string(), acquisitionKey: z.string(), condition: fraction.nullable(),
      revealedBy: z.enum(['mechanic','known']).nullable(), finish: z.enum(['body_color','primer','mismatched','bare_plastic','fake_carbon','damaged']).nullable(),
      origin: z.enum(['parts_shop','marketplace','grant']), sourceReference: z.string(), sellerId: z.string().nullable(),
      paidCentavos: exactInteger.nullable(), purchaseSequence: exactInteger.nullable(), advertisedGrade: z.enum(['like_new','good','fair','as_is']).nullable(), acquiredAt: z.string().datetime(), retired: z.boolean() })),
    installed: z.array(z.object({ ownedPartId: z.string().uuid(), vehicleId: z.string().uuid(), slots: z.array(z.string()).min(1) })),
  }),
  // A deliberate game-domain shape, validated with SocialSession against the pinned content catalog.
  social: z.object({ state: z.custom<SocialState>((value) => !!value && typeof value === 'object' && (value as {version?: number}).version === 4),
    rivals: z.array(z.object({ npcId: z.string(), vehicleContentId: z.string(), metAtHub: z.boolean(), wins: z.number().int().nonnegative(), losses: z.number().int().nonnegative(), dnfs: z.number().int().nonnegative(), latestOutcome: z.enum(['win','loss','dnf']).nullable() })) }),
  progression: z.object({
    jobs: z.array(z.object({ runId: z.string(), definitionId: z.string(), status: z.enum(['accepted','active','completed','failed','abandoned']),
      objectiveIndex: z.number().int().nonnegative(), elapsedMs: exactInteger, cargoLoaded: z.boolean(), cargoDamage: fraction, reason: z.string().nullable() })),
    recentRaces: z.array(z.object({ attemptId: z.string(), definitionId: z.string(), vehicleId: z.string().uuid(), rivalNpcId: z.string().nullable(),
      outcome: z.enum(['started','win','loss','dnf']), position: z.number().int().positive().nullable(), elapsedMs: exactInteger.nullable(),
      completedAt: z.string().datetime().nullable().optional(), payoutTransactionId: z.string().uuid().nullable().optional(), lastCheckpointElapsedMs: exactInteger.optional() })),
    bestRaces: z.array(z.object({ definitionId: z.string(), bestElapsedMs: exactInteger, wins: z.number().int().nonnegative(), finishes: z.number().int().positive() })).optional(),
    unlockedLocations: z.array(z.object({ unlockId: z.string(), locationId: z.string().nullable() })),
    chapters: z.array(z.object({ id: z.string(), currentBeatId: z.string().nullable(), completedAt: z.string().datetime().nullable(), markers: z.array(z.string()), beats: z.array(z.object({ id: z.string(), status: z.enum(['locked', 'available', 'active', 'completed', 'recoverable']) })).optional() })),
  }),
});
export type PlayerBootstrap = z.infer<typeof bootstrapSchema>;

const id = z.string().uuid();
const contentId = z.string().min(1).max(100);
const millisecond = z.number().int().min(0).max(86_400_000);
const finish = z.enum(['body_color','primer','mismatched','bare_plastic','fake_carbon','damaged']).nullable();
export const playerCommandSchema = z.strictObject({
  key: z.string().uuid(),
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('part_purchase'), definitionId: contentId }),
    z.strictObject({ type: z.literal('market_purchase'), listingId: id, offerId: z.literal('jun_suki_offer').optional() }),
    z.strictObject({ type: z.literal('part_inspect'), partId: id }),
    z.strictObject({ type: z.literal('part_sell'), partId: id }),
    z.strictObject({ type: z.literal('vehicle_purchase'), definitionId: contentId }),
    z.strictObject({ type: z.literal('vehicle_sell'), vehicleId: id }),
    z.strictObject({ type: z.literal('vehicle_repair'), vehicleId: id, components: z.array(z.enum(['engine','transmission','suspension','brakes','tires','body','electrical','clutch','cooling'])).min(1).max(9).refine(values => new Set(values).size === values.length, 'Repair components must be unique.'), benefitId: z.literal('mang_boy_service').optional() }),
    z.strictObject({ type: z.literal('vehicle_tow'), vehicleId: id }),
    z.strictObject({ type: z.literal('fuel_purchase'), vehicleId: id, milliliters: z.number().int().min(1).max(45000) }),
    z.strictObject({ type: z.literal('part_install'), vehicleId: id, partId: id, finish: finish.optional() }),
    z.strictObject({ type: z.literal('part_remove'), vehicleId: id, partId: id }),
    z.strictObject({ type: z.literal('part_refinish'), partId: id, finish }),
    z.strictObject({ type: z.literal('vehicle_appearance'), vehicleId: id, paint: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), rideHeightM: z.number().min(-.15).max(.15).optional(), spoilerMode: z.enum(['none','stock']).optional() }),
    z.strictObject({ type: z.literal('vehicle_tune'), vehicleId: id, tune: tuneIdSchema }),
    z.strictObject({ type: z.literal('vehicle_select'), vehicleId: id }),
    z.strictObject({ type: z.literal('vehicle_checkpoint'), vehicleId: id, revision: exactInteger, conditionLoss: vehicleCondition, fuelConsumedMilliliters: z.number().int().min(0).max(45000), odometerDeltaMeters: z.number().int().min(0).max(100000) }),
    // Driving and roadside wheel work: validated against the saved tires so nothing heals or appears.
    z.strictObject({ type: z.literal('vehicle_tires'), vehicleId: id, revision: exactInteger, state: vehicleTireStateSchema }),
    z.strictObject({ type: z.literal('tire_service'), vehicleId: id, lineId: z.string().min(1).max(120) }),
    z.strictObject({ type: z.literal('job_start'), definitionId: contentId }),
    z.strictObject({ type: z.literal('job_begin'), runId: contentId }),
    z.strictObject({ type: z.literal('job_objective'), runId: contentId, objectiveId: contentId, elapsedMs: millisecond, cargoDamage: fraction }),
    z.strictObject({ type: z.literal('job_end'), runId: contentId, outcome: z.enum(['failed','abandoned']), reason: z.string().min(1).max(200) }),
    z.strictObject({ type: z.literal('race_start'), definitionId: contentId, attemptId: id, vehicleId: id }),
    z.strictObject({ type: z.literal('race_checkpoint'), attemptId: id, checkpointIndex: z.number().int().min(1).max(100), elapsedMs: millisecond }),
  z.strictObject({ type: z.literal('race_complete'), attemptId: id, elapsedMs: millisecond, finish: z.boolean(),
    /** Null means the player finished while the physical opponent was still on course. */
    opponentElapsedMs: millisecond.nullable().optional() }),
    z.strictObject({ type: z.literal('social_introduce'), dialogueId: contentId }),
    z.strictObject({ type: z.literal('social_choice'), dialogueId: contentId, nodeId: contentId, choiceId: contentId }),
    z.strictObject({ type: z.literal('starter_origin'), originId: z.enum(['family', 'marketplace', 'project']) }),
 z.strictObject({ type: z.literal('chapter_continue'), chapterId: z.literal('chapter_1'), beatId: contentId }),
    z.strictObject({ type: z.literal('refund'), transactionId: id }),
    z.strictObject({ type: z.literal('dev_grant') }),
  ]),
});
export type PlayerCommand = z.infer<typeof playerCommandSchema>;
export type PlayerAction = PlayerCommand['action'];
export type CommandReceipt = { resourceId: string | null; transactionId: string | null; sequence: string | null;
  amountCentavos: string; balanceCentavos: string; details: Record<string, string | number | boolean | null> };
export type TransactionHistory = { balanceCentavos: string; revision: string; nextCursor: string | null; transactions: {
  id: string; sequence: string; amountCentavos: string; balanceBeforeCentavos: string; balanceAfterCentavos: string;
  category: string; source: string; reference: string; description: string; timestamp: string; requestId: string;
}[] };
