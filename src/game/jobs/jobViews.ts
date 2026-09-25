import { currentObjective, type JobDefinition, type JobRun, type JobType } from '../../game-core/jobs/jobs';
import type { JobEnded, JobOutcomes } from '../../game-core/jobs/JobSession';

/** What React sees of jobs: derived, display-ready snapshots. Every rule stays game-side. */
export type JobListing = {
  id: string; type: JobType; title: string; description: string; payoutPhp: number;
  timeLimitSeconds: number | null; cargo: string | null; stops: string[];
  status: 'available' | 'accepted' | 'active';
  completedCount: number;
};
export type JobBoardView = { boardId: string; listings: JobListing[] };
export type JobObjectiveView = { id: string; label: string; locationName: string; state: 'done' | 'current' | 'pending' };
export type JobView = {
  runId: string; jobId: string; type: JobType; title: string; status: 'accepted' | 'active'; payoutPhp: number;
  objectives: JobObjectiveView[];
  /** The one thing to do next: "Get in your car to start.", "Stop at Suki 24 and press F". */
  hint: string;
  elapsedSeconds: number; timeLimitSeconds: number | null;
  /** Straight-line metres to the current stop, rounded to 10 m. */
  distanceM: number | null;
  cargo: { label: string; loaded: boolean; damagePct: number; maxDamagePct: number } | null;
};
export type JobResult = { runId: string; jobId: string; title: string; status: JobEnded['status']; payoutPhp: number; reason: string | null; elapsedSeconds: number };

export function listing(job: JobDefinition, current: JobRun | null, outcomes: JobOutcomes): JobListing {
  const mine = current?.jobId === job.id ? current.status : null;
  return { id: job.id, type: job.type, title: job.title, description: job.description, payoutPhp: job.payoutPhp,
    timeLimitSeconds: job.timeLimitSeconds ?? null, cargo: job.cargo?.label ?? null,
    stops: job.objectives.map(o => o.locationName),
    status: mine === 'accepted' || mine === 'active' ? mine : 'available', completedCount: outcomes.completed };
}

export function jobView(run: JobRun, job: JobDefinition, hint: string, position: { x: number; z: number } | null): JobView {
  const objective = currentObjective(run, job);
  const distance = objective && position ? Math.hypot(objective.area.x - position.x, objective.area.z - position.z) : null;
  return {
    runId: run.runId, jobId: job.id, type: job.type, title: job.title, status: run.status === 'active' ? 'active' : 'accepted',
    payoutPhp: job.payoutPhp,
    objectives: job.objectives.map((o, i) => ({ id: o.id, label: o.label, locationName: o.locationName,
      state: i < run.objectiveIndex ? 'done' : i === run.objectiveIndex ? 'current' : 'pending' })),
    hint, elapsedSeconds: Math.floor(run.elapsedSeconds), timeLimitSeconds: job.timeLimitSeconds ?? null,
    distanceM: distance === null ? null : Math.round(distance / 10) * 10,
    cargo: job.cargo ? { label: job.cargo.label, loaded: run.cargoLoaded, damagePct: Math.round(run.cargoDamage * 100), maxDamagePct: Math.round(job.cargo.maxDamage * 100) } : null,
  };
}

export function jobResult(ended: JobEnded, job: JobDefinition): JobResult {
  return { runId: ended.runId, jobId: ended.jobId, title: job.title, status: ended.status, payoutPhp: ended.payoutPhp,
    reason: ended.status === 'completed' ? null : ended.reason ?? null, elapsedSeconds: Math.floor(ended.elapsedSeconds) };
}
