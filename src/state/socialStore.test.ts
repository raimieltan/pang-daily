import { raceValidation } from '../../tests/fixtures/raceValidation';
import { afterEach, describe, expect, it } from 'vitest';
import { GameBridge } from '@/game/bridge/GameBridge';
import { SocialEventBridge } from '@/game/social/SocialEventBridge';
import { bindSocialStore, useSocialStore } from './socialStore';

const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
afterEach(() => values.clear());

describe('recognition UI projection', () => {
 it('shows saved progress and one notification for a real tier transition', () => {
  const bridge = new GameBridge();
  const unbind = bindSocialStore(bridge.ui.events, storage);
  const social = new SocialEventBridge(bridge.ui.events, storage, error => { throw error; }, (progress, transition) => {
   bridge.runtime.emit('socialReputationUpdated', progress);
   if (transition) bridge.runtime.emit('socialTierChanged', transition);
  });
  expect(useSocialStore.getState().progress.tier).toBe('Unknown');
  for (let n = 1; n <= 3; n++) bridge.runtime.emit('raceFinished', { validation: raceValidation('kyo_block_lap'), raceId: 'kyo_block_lap', attemptId: `loss-${n}`, position: 2, racers: 2, timeMs: 120000 });
  expect(useSocialStore.getState().progress).toMatchObject({ tier: 'Regular', points: 15, nextTier: 'Known' });
  expect(useSocialStore.getState().tierNotice).toMatchObject({ from: 'Unknown', to: 'Regular' });
  bridge.runtime.emit('raceFinished', { validation: raceValidation('kyo_block_lap'), raceId: 'kyo_block_lap', attemptId: 'loss-3', position: 2, racers: 2, timeMs: 120000 });
  expect(useSocialStore.getState().progress.points).toBe(15);
  social.dispose(); unbind(); bridge.dispose();
 });
});
