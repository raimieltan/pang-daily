import { currentObjective, startBlocker, type JobObjective } from '../../game-core/jobs/jobs';
import type { JobSession, JobStep } from '../../game-core/jobs/JobSession';
import type { CommandOutcome, RuntimePort } from '../bridge';
import type { GameSystem } from '../engine/types';
import { areaContains, type Interactable } from '../interaction/Interaction';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import type { PlayerMode } from '../player/PlayerMode';
import type { JobMarkerPort } from './JobMarker';
import { jobResult, jobView, listing } from './jobViews';

export type JobPlayer = { readonly mode: PlayerMode; readonly position: { x: number; y: number; z: number } };
export type JobVehicle = { readonly speedKmh: number; readonly impactSerial: number; readonly impactStrength: number };
export type JobWorld = {
  player: JobPlayer;
  vehicle: JobVehicle;
  racing(): boolean;
  fuelLiters?(): number;
  /** Where jobs are offered: authored interactables with the `browse_jobs` action. */
  boards: readonly Interactable[];
  marker?: JobMarkerPort | null;
};

/** Stop areas outrank everything but race starts; getting in the car still wins on foot. */
const OBJECTIVE_PRIORITY = 15;
const SAVE_INTERVAL_SECONDS = 1;
const VIEW_INTERVAL_SECONDS = 0.5;

/**
 * Scene adapter for the job framework: opens boards from world interactions, offers the current
 * stop as an interaction, feeds time and impacts into the session, and publishes views. Every
 * accept, stop, failure and payout is decided by `JobSession`; commands from React are rechecked
 * against the player's actual position and state.
 */
export class JobSystem implements GameSystem {
  readonly name = 'jobs';
  private board: Interactable | null = null;
  private lastImpact: number;
  private saveElapsed = 0;
  private viewElapsed = 0;
  private lastView: string | null = null;
  private lastStep = '';
  private readonly release: (() => void)[] = [];

  constructor(private readonly bridge: RuntimePort, private readonly jobs: JobSession, private readonly world: JobWorld) {
    this.lastImpact = world.vehicle.impactSerial;
    this.release.push(bridge.handle('acceptJob', ({ jobId }) => this.accept(jobId)));
    this.release.push(bridge.handle('abandonJob', () => this.report(this.jobs.abandon())));
    this.release.push(bridge.handle('dismissJobBoard', () => this.closeBoard()));
    bridge.emit('jobBoard', null);
    this.publish(true);
  }

  connect(interactions: Pick<InteractionSystem, 'handle'>): void {
    this.release.push(interactions.handle('browse_jobs', board => this.openBoard(board)));
    this.release.push(interactions.handle('job_objective', stop => this.reachStop(stop.target ?? '')));
  }

  /** The current stop, once the job is active. */
  readonly interactions = (): Interactable[] => {
    const run = this.jobs.current, job = run && this.jobs.definition(run.jobId);
    const objective = run?.status === 'active' && job ? currentObjective(run, job) : null;
    if (!run || !objective) return [];
    return [{ id: `job:${run.runId}:${objective.id}`, action: 'job_objective', label: objective.prompt, target: objective.id,
      priority: OBJECTIVE_PRIORITY, modes: [objective.mode], area: { kind: 'circle', ...objective.area } }];
  };

  update(dt: number): void {
    if (this.board && this.boardRejection(this.board)) this.closeBoard();
    const run = this.jobs.current;
    if (run?.status === 'accepted') {
      if (!('rejected' in this.jobs.begin(this.context()))) this.publish(true);
    } else if (run?.status === 'active') {
      if (this.world.racing()) this.end(this.jobs.fail('You left the job for a race.'));
      else this.end(this.jobs.tick(dt));
    }
    const { impactSerial, impactStrength } = this.world.vehicle;
    if (impactSerial !== this.lastImpact) {
      this.lastImpact = impactSerial;
      const job = run && this.jobs.definition(run.jobId);
      if (job?.cargo && this.world.player.mode === 'driving') this.end(this.jobs.damageCargo(impactStrength * job.cargo.impactDamage));
    }
    this.saveElapsed += dt;
    if (this.saveElapsed >= SAVE_INTERVAL_SECONDS && this.jobs.current?.status === 'active') { this.saveElapsed = 0; this.jobs.flush(); }
    this.viewElapsed += dt;
    if (this.viewElapsed >= VIEW_INTERVAL_SECONDS) { this.viewElapsed = 0; this.publish(); }
  }

  dispose(): void {
    if (this.jobs.current) this.jobs.flush();
    this.release.forEach(off => off()); this.release.length = 0;
    this.world.marker?.dispose();
    this.bridge.emit('jobBoard', null);
  }

  private accept(jobId: string): CommandOutcome {
    if (!this.board) return { rejected: 'Check a job board first.' };
    const rejection = this.boardRejection(this.board);
    if (rejection) { this.closeBoard(); return { rejected: rejection }; }
    const job = this.jobs.definition(jobId);
    if (!job || !job.offeredAt.includes(this.board.id)) return { rejected: 'That job is not offered here.' };
    const run = this.jobs.accept(jobId);
    if ('rejected' in run) return run;
    this.closeBoard();
    this.jobs.begin(this.context());
    this.publish(true);
  }

  private openBoard(board: Interactable): CommandOutcome {
    const rejection = this.boardRejection(board);
    if (rejection) return { rejected: rejection };
    this.board = board;
    const listings = this.jobs.catalog.filter(job => job.offeredAt.includes(board.id))
      .map(job => listing(job, this.jobs.current, this.jobs.outcomes(job.id)));
    this.bridge.emit('jobBoard', { boardId: board.id, listings });
  }

  private closeBoard(): void {
    if (!this.board) return;
    this.board = null;
    this.bridge.emit('jobBoard', null);
  }

  private boardRejection(board: Interactable): string | null {
    const { player } = this.world;
    if (this.world.racing()) return 'Finish or cancel the race first.';
    if (player.mode !== 'walking') return 'Get out of the car to check the job board.';
    if (!this.world.boards.some(b => b.id === board.id) || !areaContains(board.area, player.position.x, player.position.z)) return 'Stand at the job board.';
    return null;
  }

  private reachStop(objectiveId: string): CommandOutcome {
    const run = this.jobs.current, job = run && this.jobs.definition(run.jobId);
    const objective = run && job ? currentObjective(run, job) : null;
    if (!objective) return { rejected: 'No job in progress.' };
    const rejection = this.stopRejection(objective);
    if (rejection) return { rejected: rejection };
    return this.report(this.jobs.completeObjective(objectiveId));
  }

  private stopRejection(objective: JobObjective): string | null {
    const { player, vehicle } = this.world;
    if (player.mode !== objective.mode) return objective.mode === 'driving' ? 'Bring your car to the stop.' : 'Get out of the car here.';
    if (!areaContains({ kind: 'circle', ...objective.area }, player.position.x, player.position.z)) return `Go to ${objective.locationName}.`;
    if (objective.mode === 'driving' && vehicle.speedKmh > objective.maxSpeedKmh) return 'Stop the car first.';
    return null;
  }

  private report(step: JobStep | { rejected: string }): CommandOutcome {
    if ('rejected' in step) return step;
    this.end(step);
  }

  private end(step: JobStep | null): void {
    if (!step) return;
    if (step.ended) {
      const job = this.jobs.definition(step.ended.jobId)!;
      this.bridge.emit('jobEnded', jobResult(step.ended, job));
    }
    // Timer ticks wait for the throttle; stops, damage and endings show at once.
    const key = `${step.run.runId}:${step.run.status}:${step.run.objectiveIndex}:${step.run.cargoDamage}`;
    if (key !== this.lastStep) { this.lastStep = key; this.publish(true); }
  }

  private context() {
    return { mode: this.world.player.mode, racing: this.world.racing(), fuelLiters: this.world.fuelLiters?.() };
  }

  /** Emits the view when it changed; `now` also skips the throttle (transitions). */
  private publish(now = false): void {
    if (now) this.viewElapsed = 0;
    const run = this.jobs.current, job = run && this.jobs.definition(run.jobId);
    const view = run && job ? jobView(run, job, this.hint(), this.world.player.position) : null;
    const objective = run?.status === 'active' && job ? currentObjective(run, job) : null;
    if (objective) this.world.marker?.show(objective.area.x, objective.area.z, objective.area.radius);
    else this.world.marker?.hide();
    const serialized = JSON.stringify(view);
    if (serialized === this.lastView) return;
    this.lastView = serialized;
    this.bridge.emit('jobState', view);
  }

  private hint(): string {
    const run = this.jobs.current, job = run && this.jobs.definition(run.jobId);
    if (!run || !job) return '';
    if (run.status === 'accepted') return startBlocker(job, this.context()) ?? 'Starting…';
    const objective = currentObjective(run, job);
    if (!objective) return '';
    const rejection = this.stopRejection(objective);
    if (!rejection) return `${objective.prompt}: press F`;
    return rejection === 'Stop the car first.' ? 'Stop here to ' + objective.prompt.toLowerCase() : `Head to ${objective.locationName}`;
  }
}
