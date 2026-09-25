import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { JobBoardView, JobResult, JobView } from '@/game/jobs/jobViews';
type State = { board: JobBoardView | null; job: JobView | null; result: JobResult | null; error: string | null };
const initial: State = { board: null, job: null, result: null, error: null };
export const useJobStore = create<State>(() => initial);
const JOB_COMMANDS = new Set(['acceptJob', 'abandonJob', 'dismissJobBoard']);
/** Read-only job snapshots; accepting, stops, failure and payment are decided game-side. */
export function bindJobStore(events: GameEventSource) {
  const set = useJobStore.setState;
  const release = [
    events.on('jobBoard', board => set({ board, error: null })),
    events.on('jobState', job => set(job ? { job, result: null } : { job })),
    events.on('jobEnded', result => set({ result })),
    events.on('commandRejected', ({ command, reason }) => { if (JOB_COMMANDS.has(command)) set({ error: reason }); }),
    events.on('sceneLoading', () => set(initial)),
  ];
  return () => { release.forEach(off => off()); set(initial); };
}
