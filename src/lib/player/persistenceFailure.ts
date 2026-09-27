import { PlayerApiError } from './playerApiError';

export type PersistenceFailure = { kind: 'temporary' | 'authentication' | 'rejection' | 'incompatible';
  message: string; retry: boolean; requestId?: string };

export function persistenceFailure(error: unknown): PersistenceFailure {
  const message = error instanceof Error ? error.message : 'Progress could not be saved.';
  if (error instanceof PlayerApiError) {
    if (error.status === 401) return { kind: 'authentication', message: 'Your session expired. Sign in again to reload your saved progress.', retry: false, requestId: error.requestId };
    if (['SAVE_VERSION_INCOMPATIBLE', 'PLAYER_STATE_INVALID', 'PLAYER_STATE_INCOMPLETE', 'BOOTSTRAP_INCOMPATIBLE'].includes(error.code))
      return { kind: 'incompatible', message: 'This save cannot be loaded safely. Update the game or contact support; your progress has not been reset.', retry: false, requestId: error.requestId };
    if (error.status === 0 || error.status === 503 || error.status === 429 || error.status >= 500)
      return { kind: 'temporary', message, retry: true, requestId: error.requestId };
    return { kind: 'rejection', message, retry: false, requestId: error.requestId };
  }
  if (message.includes('older save')) return { kind: 'temporary', message, retry: true };
  return { kind: 'incompatible', message, retry: false };
}
