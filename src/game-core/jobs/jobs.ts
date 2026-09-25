import { z } from 'zod';
import { moneySchema } from '../economy/economy';

/**
 * Data-driven money jobs (M2). Definitions are plain data; runs move through pure transitions so
 * every rule (order, time, cargo) is checked here, never in the UI or a scene adapter.
 *
 *   available → accepted → active → completed | failed
 *                   └─────────┴──→ abandoned
 *
 * `accepted` means taken but not started: the timer only runs once the start requirements hold
 * (e.g. back in the car). New job types (errand, hatid) reuse the same objective list: a hatid
 * passenger is cargo of kind `passenger`, aboard between the `load` and `unload` stops.
 */
export const JOB_STATUSES = ['available', 'accepted', 'active', 'completed', 'failed', 'abandoned'] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export type JobType = 'delivery' | 'errand' | 'passenger' | (string & {});
const playerModeSchema = z.enum(['driving', 'walking']);

const objectiveSchema = z.object({
  id: z.string().min(1),
  /** Checklist line: "Pick up the order at Suki 24". */
  label: z.string().min(1),
  /** Interaction prompt at the spot: "Load ice & milk". */
  prompt: z.string().min(1),
  locationName: z.string().min(1),
  area: z.object({ x: z.number(), z: z.number(), radius: z.number().positive() }),
  mode: playerModeSchema.default('driving'),
  /** In the car, it has to be (nearly) stopped. */
  maxSpeedKmh: z.number().nonnegative().default(3),
  cargo: z.enum(['load', 'unload']).optional(),
});

export const jobDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1) as z.ZodType<JobType>,
  title: z.string().min(1),
  description: z.string().min(1),
  payoutPhp: moneySchema.refine(v => v > 0),
  /** Interaction ids (job boards, NPCs) that list this job. */
  offeredAt: z.array(z.string().min(1)).min(1),
  requirements: z.object({ mode: playerModeSchema.optional(), minFuelLiters: z.number().positive().optional() }).default({}),
  objectives: z.array(objectiveSchema).min(1),
  /** Failure: the run is lost once this many seconds pass while active. */
  timeLimitSeconds: z.number().positive().optional(),
  /** Failure: cargo damage above `maxDamage`; each impact adds strength × `impactDamage`. A passenger's damage is their patience. */
  cargo: z.object({ label: z.string().min(1), kind: z.enum(['goods', 'passenger']).default('goods'),
    maxDamage: z.number().gt(0).max(1), impactDamage: z.number().positive() }).optional(),
  /** Driving-quality bonus added to the payout when the run finishes within `withinSeconds` and/or at most `maxDamage`. */
  bonus: z.object({ label: z.string().min(1), php: moneySchema.refine(v => v > 0),
    withinSeconds: z.number().positive().optional(), maxDamage: z.number().min(0).max(1).optional() }).optional(),
}).superRefine((job, ctx) => {
  const ids = job.objectives.map(o => o.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Objective ids must be unique.' });
  const load = job.objectives.findIndex(o => o.cargo === 'load'), unload = job.objectives.findIndex(o => o.cargo === 'unload');
  if ((load >= 0 || unload >= 0) && !job.cargo) ctx.addIssue({ code: 'custom', message: 'Cargo objectives need a cargo definition.' });
  if (job.cargo && !(load >= 0 && unload > load)) ctx.addIssue({ code: 'custom', message: 'Cargo must be loaded before it is unloaded.' });
  if (job.bonus && job.bonus.withinSeconds === undefined && job.bonus.maxDamage === undefined)
    ctx.addIssue({ code: 'custom', message: 'A bonus needs a time or damage condition.' });
  if (job.bonus?.maxDamage !== undefined && !job.cargo) ctx.addIssue({ code: 'custom', message: 'A damage bonus needs cargo.' });
});
export type JobDefinition = z.infer<typeof jobDefinitionSchema>;
export type JobObjective = JobDefinition['objectives'][number];

export function defineJob(job: z.input<typeof jobDefinitionSchema>): JobDefinition {
  return jobDefinitionSchema.parse(job);
}

export const jobRunSchema = z.object({
  runId: z.string().min(1), jobId: z.string().min(1), status: z.enum(JOB_STATUSES),
  objectiveIndex: z.number().int().nonnegative(), elapsedSeconds: z.number().nonnegative(),
  cargoLoaded: z.boolean(), cargoDamage: z.number().min(0).max(1),
  reason: z.string().optional(), transactionId: z.number().int().positive().optional(),
});
export type JobRun = z.infer<typeof jobRunSchema>;
export type Rejection = { rejected: string };

/** What the game reports about the player when checking start requirements. */
export type JobContext = { mode: 'driving' | 'walking'; racing: boolean; fuelLiters?: number };

export function startBlocker(job: JobDefinition, ctx: JobContext): string | null {
  if (ctx.racing) return 'Finish or cancel the race first.';
  const { mode, minFuelLiters } = job.requirements;
  if (mode === 'driving' && ctx.mode !== 'driving') return 'Get in your car to start.';
  if (mode === 'walking' && ctx.mode !== 'walking') return 'Get out of the car to start.';
  if (minFuelLiters && (ctx.fuelLiters ?? 0) < minFuelLiters) return `Needs at least ${minFuelLiters} L of fuel.`;
  return null;
}

export function acceptJob(job: JobDefinition, runId: string): JobRun {
  return { runId, jobId: job.id, status: 'accepted', objectiveIndex: 0, elapsedSeconds: 0, cargoLoaded: false, cargoDamage: 0 };
}

export function beginJob(run: JobRun, job: JobDefinition, ctx: JobContext): JobRun | Rejection {
  if (run.status !== 'accepted') return { rejected: 'This job has already started.' };
  const blocker = startBlocker(job, ctx);
  return blocker ? { rejected: blocker } : { ...run, status: 'active' };
}

export function advanceTime(run: JobRun, job: JobDefinition, dt: number): JobRun {
  if (run.status !== 'active' || !Number.isFinite(dt) || dt <= 0) return run;
  const elapsedSeconds = run.elapsedSeconds + dt;
  if (job.timeLimitSeconds !== undefined && elapsedSeconds > job.timeLimitSeconds)
    return { ...run, elapsedSeconds: job.timeLimitSeconds, status: 'failed', reason: 'Out of time.' };
  return { ...run, elapsedSeconds };
}

export function damageCargo(run: JobRun, job: JobDefinition, amount: number): JobRun {
  if (run.status !== 'active' || !run.cargoLoaded || !job.cargo || !Number.isFinite(amount) || amount <= 0) return run;
  const cargoDamage = Math.min(1, run.cargoDamage + amount);
  return cargoDamage > job.cargo.maxDamage
    ? { ...run, cargoDamage, status: 'failed', reason: job.cargo.kind === 'passenger' ? `${job.cargo.label} got out. Too rough a ride.` : `${job.cargo.label} got damaged.` }
    : { ...run, cargoDamage };
}

export function currentObjective(run: JobRun, job: JobDefinition): JobObjective | null {
  return run.status === 'accepted' || run.status === 'active' ? job.objectives[run.objectiveIndex] ?? null : null;
}

/** Objectives complete strictly in order; finishing the last one yields `completed` (payment is the session's job). */
export function completeObjective(run: JobRun, job: JobDefinition, objectiveId: string): JobRun | Rejection {
  if (run.status !== 'active') return { rejected: run.status === 'accepted' ? 'Start the job first.' : 'This job is over.' };
  const objective = job.objectives[run.objectiveIndex];
  if (!objective) return { rejected: 'This job is over.' };
  if (objective.id !== objectiveId) {
    const target = job.objectives.find(o => o.id === objectiveId);
    return { rejected: target ? `${objective.label} first.` : 'Unknown objective.' };
  }
  if (objective.cargo === 'unload' && !run.cargoLoaded)
    return { rejected: job.cargo?.kind === 'passenger' ? 'No passenger aboard.' : 'Nothing to drop off.' };
  const next = { ...run, objectiveIndex: run.objectiveIndex + 1,
    cargoLoaded: objective.cargo === 'load' ? true : objective.cargo === 'unload' ? false : run.cargoLoaded };
  return next.objectiveIndex >= job.objectives.length ? { ...next, status: 'completed' } : next;
}

/** Whether the run, as it stands, meets the bonus conditions. */
export function bonusEarned(run: JobRun, job: JobDefinition): boolean {
  const { bonus } = job;
  if (!bonus) return false;
  return (bonus.withinSeconds === undefined || run.elapsedSeconds <= bonus.withinSeconds)
    && (bonus.maxDamage === undefined || run.cargoDamage <= bonus.maxDamage);
}

/** What a completed run pays: the base payout plus the bonus when earned. */
export function jobPayout(run: JobRun, job: JobDefinition): number {
  return bonusEarned(run, job) ? job.payoutPhp + job.bonus!.php : job.payoutPhp;
}

export function abandonJob(run: JobRun): JobRun | Rejection {
  if (run.status !== 'accepted' && run.status !== 'active') return { rejected: 'No job in progress.' };
  return { ...run, status: 'abandoned', reason: 'Abandoned.' };
}

export function failJob(run: JobRun, reason: string): JobRun {
  return run.status === 'accepted' || run.status === 'active' ? { ...run, status: 'failed', reason } : run;
}
