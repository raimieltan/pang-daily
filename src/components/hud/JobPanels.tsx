'use client';

import { useEffect } from 'react';
import { useJobStore } from '@/state/jobStore';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const RESULT_DISMISS_MS = 6000;

/** Listings from the board the player is standing at. Accepting is validated game-side. */
export function JobBoardPanel() {
  const board = useJobStore(s => s.board);
  const error = useJobStore(s => s.error);
  const busy = useJobStore(s => s.job !== null);
  const commands = useGameUiStore(s => s.commands);
  if (!board) return null;
  return <section aria-label="Job board" onKeyDown={event => event.stopPropagation()}
    className="pointer-events-auto absolute right-3 top-24 z-40 max-h-[72dvh] w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-amber-100/25 bg-neutral-950/95 p-5 text-sm shadow-2xl sm:right-8">
    <header className="flex items-center justify-between"><h2 className="text-xl">Odd jobs</h2><button className="tape-button" onClick={() => commands?.dismissJobBoard()}>Close</button></header>
    {board.listings.length === 0 && <p className="mt-3 text-white/60">Nothing pinned up right now.</p>}
    {board.listings.map(job => <article key={job.id} className="mt-4 border-t border-white/20 pt-3">
      <p className="text-[10px] tracking-widest text-white/50">{job.type.toUpperCase()}{job.completedCount > 0 && ` · DONE ×${job.completedCount}`}</p>
      <h3 className="text-lg">{job.title} <span className="text-emerald-200">{pesos(job.payoutPhp)}</span></h3>
      <p className="mt-1 text-white/70">{job.description}</p>
      <p className="mt-2 text-white/60">{job.stops.join(' → ')}{job.timeLimitSeconds && ` · ${clock(job.timeLimitSeconds)} limit`}{job.cargo && ` · Fragile: ${job.cargo}`}</p>
      {job.status === 'available'
        ? <button className="tape-button mt-3" disabled={!commands || busy} onClick={() => commands?.acceptJob(job.id)}>{busy ? 'Finish your current job first' : 'Take the job'}</button>
        : <p role="status" className="mt-3 text-amber-200">In progress</p>}
    </article>)}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
  </section>;
}

/** Objective checklist, timer and cargo state for the job in progress, then its outcome. */
export function JobTracker() {
  const job = useJobStore(s => s.job);
  const result = useJobStore(s => s.result);
  const commands = useGameUiStore(s => s.commands);
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => useJobStore.setState({ result: null }), RESULT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [result]);

  if (!job) return result ? <p role="status" data-testid="job-result" className={`max-w-md self-center bg-black/65 px-4 py-2 text-sm ${result.status === 'completed' ? 'text-emerald-200' : 'text-amber-200'}`}>
    {result.status === 'completed' ? `${result.title} done · +${pesos(result.payoutPhp)} in ${clock(result.elapsedSeconds)}`
      : `${result.title} ${result.status === 'failed' ? 'failed' : 'abandoned'}${result.reason && result.status === 'failed' ? ` · ${result.reason}` : ''} · No pay`}
  </p> : null;

  const remaining = job.timeLimitSeconds === null ? null : Math.max(0, job.timeLimitSeconds - job.elapsedSeconds);
  return <section aria-label="Current job" data-testid="job-tracker" className="pointer-events-auto max-w-md self-start bg-black/65 px-3 py-2 text-xs">
    <div className="flex items-center justify-between gap-6 text-[10px] tracking-widest">
      <span className="text-white/50">JOB · {job.title.toUpperCase()} · {pesos(job.payoutPhp)}</span>
      {remaining !== null && <span data-testid="job-timer" className={job.status === 'active' && remaining <= 30 ? 'text-red-300' : ''}>{clock(remaining)}</span>}
    </div>
    <ol className="mt-2 space-y-1">
      {job.objectives.map(o => <li key={o.id} className={o.state === 'done' ? 'text-white/40 line-through' : o.state === 'current' ? 'text-amber-100' : 'text-white/60'}>
        {o.state === 'done' ? '✓' : o.state === 'current' ? '▸' : '·'} {o.label}{o.state === 'current' && job.distanceM !== null && job.status === 'active' && ` · ${job.distanceM} m`}
      </li>)}
    </ol>
    <p className="mt-2 text-amber-200" data-testid="job-hint">{job.hint}</p>
    {job.cargo && <p className={`mt-1 ${job.cargo.damagePct > 0 ? 'text-amber-200' : 'text-white/60'}`}>
      {job.cargo.label}: {job.cargo.loaded ? `${job.cargo.damagePct}% damaged (fails over ${job.cargo.maxDamagePct}%)` : 'not loaded'}
    </p>}
    <button className="tape-button mt-2" onClick={() => commands?.abandonJob()}>Abandon job</button>
  </section>;
}
