import { bootstrapSchema, type Credentials, type PlayerBootstrap, type PlayerAction, type CommandReceipt, type TransactionHistory } from '@pang-daily/contracts';
import { SocialSession } from '@/game-core/social/SocialSession';
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import { PlayerApiError } from './playerApiError';
export { PlayerApiError } from './playerApiError';

async function request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal,
    headers: { 'X-Pang-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).catch(error => {
      if (signal?.aborted) throw error;
      throw new PlayerApiError(0, 'NETWORK_UNAVAILABLE', 'Your save is unavailable while offline or disconnected. Reconnect and retry.');
    });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string; message?: string; requestId?: string };
    throw new PlayerApiError(response.status, error.code ?? 'API_UNAVAILABLE', error.message ?? 'Unable to reach your save. Please retry.', error.requestId);
  }
  return response.status === 204 ? null : response.json();
}
export const playerApi = {
  command: (action: PlayerAction, key: string): Promise<CommandReceipt> => request('/player/commands', 'POST', { key, action }),
  transactions: (cursor?: string): Promise<TransactionHistory> => request(`/player/transactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  marketplace: (): Promise<import('@/game-core/marketplace/listings').ListingView[]> => request('/player/marketplace'),
  register: (credentials: Credentials) => request('/auth/register', 'POST', credentials),
  login: (credentials: Credentials) => request('/auth/login', 'POST', credentials),
  logout: () => request('/auth/logout', 'POST'),
  async bootstrap(signal?: AbortSignal): Promise<PlayerBootstrap> {
    const parsed = bootstrapSchema.safeParse(await request('/player/bootstrap', 'GET', undefined, signal));
    if (!parsed.success) throw new PlayerApiError(409, 'BOOTSTRAP_INCOMPATIBLE', 'A compatible game version is needed to load this save.');
    const dto = parsed.data;
    new SocialSession(SOCIAL_CONTENT, dto.social.state);
    return dto;
  },
};
