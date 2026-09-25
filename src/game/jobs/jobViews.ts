import { bonusEarned, currentObjective, type JobDefinition, type JobRun, type JobType } from '../../game-core/jobs/jobs';
import type { JobEnded, JobOutcomes } from '../../game-core/jobs/JobSession';

/** What React sees of jobs: derived, display-ready snapshots. Every rule stays game-side. */
export type JobListing = {
  id: string; type: JobType; title: string; description: string; payoutPhp: number;
  timeLimitSeconds: number | null; cargo: { label: string; kind: CargoKind } | null; stops: string[];
  /** "₱100 tip under 2:00 with a smooth ride". */
  bonus: { label: string; php: number; withinSeconds: number | null } | null;
  status: 'available' | 'accepted' | 'active';
  completedCount: number;
};
type CargoKind = 'goods' | 'passenger';
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
  cargo: { label: string; kind: CargoKind; loaded: boolean; damagePct: number; maxDamagePct: number } | null;
  /** `onTrack` while the run still meets the bonus conditions. */
  bonus: { label: string; php: number; onTrack: boolean } | null;
};
export type JobResult = { runId: string; jobId: string; title: string; status: JobEnded['status']; payoutPhp: number; bonusPhp: number; reason: string | null; elapsedSeconds: number };

export function listing(job: JobDefinition, current: JobRun | null, outcomes: JobOutcomes): JobListing {
  const mine = current?.jobId === job.id ? current.status : null;
  return { id: job.id, type: job.type, title: job.title, description: job.description, payoutPhp: job.payoutPhp,
    timeLimitSeconds: job.timeLimitSeconds ?? null, cargo: job.cargo ? { label: job.cargo.label, kind: job.cargo.kind } : null,
    bonus: job.bonus ? { label: job.bonus.label, php: job.bonus.php, withinSeconds: job.bonus.withinSeconds ?? null } : null,
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
    cargo: job.cargo ? { label: job.cargo.label, kind: job.cargo.kind, loaded: run.cargoLoaded, damagePct: Math.round(run.cargoDamage * 100), maxDamagePct: Math.round(job.cargo.maxDamage * 100) } : null,
    bonus: job.bonus ? { label: job.bonus.label, php: job.bonus.php, onTrack: bonusEarned(run, job) } : null,
  };
}

export function jobResult(ended: JobEnded, job: JobDefinition): JobResult {
  return { runId: ended.runId, jobId: ended.jobId, title: job.title, status: ended.status, payoutPhp: ended.payoutPhp, bonusPhp: ended.bonusPhp,
    reason: ended.status === 'completed' ? null : ended.reason ?? null, elapsedSeconds: Math.floor(ended.elapsedSeconds) };
}
