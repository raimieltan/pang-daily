import { describe, expect, it } from 'vitest';
import { PlayerApiError } from './playerApi';
import { persistenceFailure } from './persistenceFailure';

describe('persistence failure guidance', () => {
  it('allows same-key retry for network and transient API failures', () => {
    expect(persistenceFailure(new PlayerApiError(0, 'NETWORK_UNAVAILABLE', 'offline')).retry).toBe(true);
    expect(persistenceFailure(new PlayerApiError(503, 'API_UNAVAILABLE', 'down')).retry).toBe(true);
    expect(persistenceFailure(new Error('The server returned an older save. Please retry.')).retry).toBe(true);
  });
  it('separates auth, domain rejection and incompatible save without unsafe retry', () => {
    expect(persistenceFailure(new PlayerApiError(401, 'AUTH_REQUIRED', 'expired')).kind).toBe('authentication');
    expect(persistenceFailure(new PlayerApiError(409, 'INSUFFICIENT_FUNDS', 'insufficient')).retry).toBe(false);
    expect(persistenceFailure(new PlayerApiError(409, 'SAVE_VERSION_INCOMPATIBLE', 'old')).kind).toBe('incompatible');
  });
});
