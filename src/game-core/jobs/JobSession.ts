import { z } from 'zod';
import type { VehicleSession } from '../maintenance/VehicleSession';
import {
  abandonJob, acceptJob, advanceTime, beginJob, completeObjective, damageCargo, failJob, jobPayout, jobRunSchema,
  type JobContext, type JobDefinition, type JobRun, type Rejection,
} from './jobs';

const outcomesSchema = z.object({ completed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), abandoned: z.number().int().nonnegative() });
const jobSaveSchema = z.object({ version: z.literal(1), serial: z.number().int().nonnegative(),
  current: jobRunSchema.nullable(), history: z.record(z.string(), outcomesSchema) });
export type JobSave = z.infer<typeof jobSaveSchema>;
export type JobOutcomes = z.infer<typeof outcomesSchema>;
/** A run that just ended. Only `completed` carries a payout (`bonusPhp` of it from the job's bonus). */
export type JobEnded = JobRun & { status: 'completed' | 'failed' | 'abandoned'; payoutPhp: number; bonusPhp: number };
export type JobStep = { run: JobRun; ended: JobEnded | null };
type Wallet = Pick<VehicleSession, 'earn' | 'snapshot'>;

/**
 * Job authority: at most one run at a time, outlives scenes, persists the run in progress and
 * per-job outcome counts. Money moves only through the PAN-11 wallet (`VehicleSession.earn`),
 * once per run: the payout's ledger entry carries the run id, so a save that lost the job's
 * completion (storage failure mid-way) is settled on load instead of paid twice.
 */
export class JobSession {
  private state: JobSave;
  private readonly listeners = new Set<() => void>();
  private readonly byId: ReadonlyMap<string, JobDefinition>;

  constructor(private readonly wallet: Wallet, readonly catalog: readonly JobDefinition[],
    saved?: unknown, private readonly persist?: (save: JobSave) => void) {
    this.byId = new Map(catalog.map(job => [job.id, job]));
    const parsed = jobSaveSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, serial: 0, current: null, history: {} };
    const run = this.state.current;
    if (run && (!this.byId.has(run.jobId) || (run.status !== 'accepted' && run.status !== 'active'))) this.state.current = null;
    else if (run && wallet.snapshot().transactions.some(tx => tx.kind === 'job_payout' && tx.relatedEntityId === run.runId)) {
      this.state.current = null; this.count(run.jobId, 'completed');
    }
  }

  definition(jobId: string): JobDefinition | undefined { return this.byId.get(jobId); }
  get current(): JobRun | null { return this.state.current && { ...this.state.current }; }
  outcomes(jobId: string): JobOutcomes { return { ...(this.state.history[jobId] ?? { completed: 0, failed: 0, abandoned: 0 }) }; }
  snapshot(): JobSave { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  accept(jobId: string): JobRun | Rejection {
    const job = this.byId.get(jobId);
    if (!job) return { rejected: 'Unknown job.' };
    if (this.state.current) return { rejected: 'Finish or abandon your current job first.' };
    this.state.current = acceptJob(job, `${job.id}#${++this.state.serial}`);
    this.changed(); return { ...this.state.current };
  }
  begin(ctx: JobContext): JobRun | Rejection {
    const [run, job] = this.active();
    if (!run || !job) return { rejected: 'No job accepted.' };
    return this.apply(beginJob(run, job, ctx));
  }
  /** Timer ticks are kept in memory; `flush` saves the elapsed time (the scene calls it ~1 Hz). */
  tick(dt: number): JobStep | null {
    const [run, job] = this.active();
    if (!run || !job) return null;
    const next = advanceTime(run, job, dt);
    if (next.status === 'active') { this.state.current = next; return { run: { ...next }, ended: null }; }
    return this.settle(next);
  }
  damageCargo(amount: number): JobStep | null {
    const [run, job] = this.active();
    if (!run || !job) return null;
    const next = damageCargo(run, job, amount);
    return next === run ? null : this.settle(next);
  }
  completeObjective(objectiveId: string): JobStep | Rejection {
    const [run, job] = this.active();
    if (!run || !job) return { rejected: 'No job in progress.' };
    const next = completeObjective(run, job, objectiveId);
    if ('rejected' in next) return next;
    if (next.status !== 'completed') return this.settle(next);
    // Pay before recording completion: a refused payment leaves the run open at its last step.
    const payment = this.wallet.earn(jobPayout(next, job), { kind: 'job_payout', description: `Job: ${job.title}`, source: `job:${job.type}`, relatedEntityId: run.runId });
    if ('rejected' in payment) return { rejected: payment.rejected };
    return this.settle({ ...next, transactionId: payment.id });
  }
  abandon(): JobStep | Rejection {
    const run = this.state.current;
    if (!run) return { rejected: 'No job in progress.' };
    const next = abandonJob(run);
    return 'rejected' in next ? next : this.settle(next);
  }
  fail(reason: string): JobStep | null {
    const run = this.state.current;
    return run ? this.settle(failJob(run, reason)) : null;
  }
  flush() { this.changed(); }

  private active(): [JobRun | null, JobDefinition | undefined] {
    const run = this.state.current;
    return [run, run ? this.byId.get(run.jobId) : undefined];
  }
  private apply(next: JobRun | Rejection): JobRun | Rejection {
    if ('rejected' in next) return next;
    this.state.current = next; this.changed(); return { ...next };
  }
  private settle(next: JobRun): JobStep {
    if (next.status === 'accepted' || next.status === 'active') {
      this.state.current = next; this.changed(); return { run: { ...next }, ended: null };
    }
    const status = next.status as JobEnded['status'];
    this.state.current = null; this.count(next.jobId, status); this.changed();
    const job = this.byId.get(next.jobId)!;
    const payoutPhp = status === 'completed' ? jobPayout(next, job) : 0;
    const ended = { ...next, status, payoutPhp, bonusPhp: payoutPhp && payoutPhp - job.payoutPhp };
    return { run: { ...ended }, ended };
  }
  private count(jobId: string, status: keyof JobOutcomes) {
    this.state.history[jobId] = this.outcomes(jobId);
    this.state.history[jobId][status]++;
  }
  private changed() {
    try { this.persist?.(this.snapshot()); } catch { /* Keep the in-memory run if storage fails, as VehicleSession does. */ }
    this.listeners.forEach(listener => listener());
  }
}
