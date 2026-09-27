import { playerApi } from './playerApi';
export { PlayerApiError } from './playerApi';
import { runtimeBootstrap } from './runtimeBootstrap';
import { ServerPersistence } from './ServerPersistence';
import type { PlayerBootstrap } from '@pang-daily/contracts';
import type { PersistenceFactory } from '@/game-core/persistence/PersistenceFactory';
import { hydratePlayerMeta, usePlayerMetaStore } from '@/state/playerMetaStore';
import { retireLegacy, browserLegacyStores } from './legacyTransition';
import { useLegacyTransitionStore } from '@/state/legacyTransitionStore';
import { usePersistenceStore } from '@/state/persistenceStore';

let sessionGeneration = 0;

function mapPlayer(dto: PlayerBootstrap) {
  return { playerId: dto.profile.id, displayName: dto.profile.displayName, revision: dto.revision, runtime: runtimeBootstrap(dto),
    races: dto.progression.recentRaces.map(race => ({ attemptId: race.attemptId, raceId: race.definitionId, vehicleId: race.vehicleId, outcome: race.outcome, elapsedMs: race.elapsedMs })),
    bestRaces: (dto.progression.bestRaces ?? []).map(race => ({ raceId: race.definitionId, elapsedMs: race.bestElapsedMs, wins: race.wins, finishes: race.finishes })),
    unlocks: dto.progression.unlockedLocations.map(unlock => ({ id: unlock.unlockId, locationId: unlock.locationId })) };
}
export const playerService = {
  async bootstrap(signal?: AbortSignal) {
    const generation = sessionGeneration;
    const player = mapPlayer(await playerApi.bootstrap(signal));
    if (generation !== sessionGeneration) throw new Error('This session has ended. Sign in again.');
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!hydratePlayerMeta(player)) throw new Error('The server returned an older save. Please retry.');
    useLegacyTransitionStore.setState({ result: retireLegacy(browserLegacyStores()), dismissed: false });
    return { bootstrap: player.runtime, name: player.displayName };
  },
  retryLegacyCleanup() {
    if (!usePlayerMetaStore.getState().player) return;
    useLegacyTransitionStore.setState({ result: retireLegacy(browserLegacyStores()), dismissed: false });
  },
  login: playerApi.login,
  register: playerApi.register,
  async logout() {
    await playerApi.logout();
    sessionGeneration++;
    usePlayerMetaStore.setState({ player: null });
    useLegacyTransitionStore.setState({ result: null, dismissed: false });
    usePersistenceStore.setState({ error: null, saving: false });
  },
  persistence: ((sessions) => {
    const generation = sessionGeneration;
    const assertSession = () => {
      if (generation !== sessionGeneration) throw new Error('This session has ended. Sign in again.');
    };
    return new ServerPersistence({
      async command(action, key) { assertSession(); return playerApi.command(action, key); },
      async bootstrap() { assertSession(); return playerApi.bootstrap(); },
      async marketplace() { assertSession(); return playerApi.marketplace(); },
    }, dto => {
      assertSession();
      const player = mapPlayer(dto);
      // Reject stale reads before they can overwrite runtime sessions.
      if (!hydratePlayerMeta(player)) throw new Error('The server returned an older save. Please retry.');
      return player.runtime;
    }, sessions.initial, sessions.wallet, sessions.inventory, sessions.jobs,
    message => { if (generation === sessionGeneration) sessions.report(message); }, sessions.refresh, saving => {
      if (generation === sessionGeneration) usePersistenceStore.setState({ saving });
    });
  }) satisfies PersistenceFactory,
};
