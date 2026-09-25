import type { JobDefinition } from '../../game-core/jobs/jobs';
import { JobSession } from '../../game-core/jobs/JobSession';
import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
export const JOB_SESSION_KEY = 'pang-daily.job-session.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
/** Same tab-scoped storage as the vehicle session; the wallet stays in `VehicleSession`. */
export function loadJobSession(wallet: VehicleSession, catalog: readonly JobDefinition[], storage?: StoragePort): JobSession {
  let saved: unknown;
  try { saved = JSON.parse(storage?.getItem(JOB_SESSION_KEY) ?? 'null'); } catch { /* Start with no job if storage is corrupt/unavailable. */ }
  return new JobSession(wallet, catalog, saved, save => storage?.setItem(JOB_SESSION_KEY, JSON.stringify(save)));
}
