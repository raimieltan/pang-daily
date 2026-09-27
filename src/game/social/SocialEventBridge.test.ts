import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { describe, expect, it, vi } from 'vitest';
import { GameBridge } from '@/game/bridge/GameBridge';
import type { GameEventMap } from '@/game/bridge/GameEvents';
import { loadSocialSession, recordDialogueChoice, recordDialogueIntroduction } from './socialStorage';
import { SocialEventBridge } from './SocialEventBridge';

const memoryStorage = () => {
 const values = new Map<string, string>();
 return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('social event bridge', () => {
 it('follows validated job results, including failure and recovery', () => {
  const bridge = new GameBridge(), storage = memoryStorage(), errors = vi.fn();
  const social = new SocialEventBridge(bridge.ui.events, storage, errors);
  bridge.runtime.emit('jobState', { runId: 'talyer_oil_errand#1', jobId: 'talyer_oil_errand', status: 'accepted' } as GameEventMap['jobState']);
  bridge.runtime.emit('jobEnded', { runId: 'talyer_oil_errand#1', jobId: 'talyer_oil_errand', status: 'failed' } as GameEventMap['jobEnded']);
  bridge.runtime.emit('jobState', { runId: 'talyer_battery_drop#1', jobId: 'talyer_battery_drop', status: 'accepted' } as GameEventMap['jobState']);
  bridge.runtime.emit('jobEnded', { runId: 'talyer_battery_drop#1', jobId: 'talyer_battery_drop', status: 'completed' } as GameEventMap['jobEnded']);
  const state = loadSocialSession(storage).snapshot();
  expect(state.favors.mang_boy_parts_help.status).toBe('failed');
  expect(state.favors.mang_boy_recovery.status).toBe('completed');
 expect(state.npcs.mang_boy.trust).toBe(56);
  expect(errors).not.toHaveBeenCalled();
  social.dispose(); bridge.dispose();
 });

 it('uses race attempts and transaction IDs for duplicate delivery', () => {
  const bridge = new GameBridge(), storage = memoryStorage(), errors = vi.fn();
  const social = new SocialEventBridge(bridge.ui.events, storage, errors);
  const result = { validation: raceValidation('pahuway_descent'), raceId: 'pahuway_descent', attemptId: 'race-attempt-1', position: 1, racers: 2, timeMs: 120000 };
  bridge.runtime.emit('raceFinished', result);
  bridge.runtime.emit('raceFinished', result);
  bridge.runtime.emit('repairCompleted', { transactionId: 2, vehicleId: 'daily', components: ['engine'], costPhp: 200, walletPhp: 800 } as GameEventMap['repairCompleted']);
  bridge.runtime.emit('partInspected', { transactionId: 4, part: { id: 'owned-part-1' }, feePhp: 150 } as GameEventMap['partInspected']);
  bridge.runtime.emit('partPurchased', { transactionId: 3, listingId: 'listing-1', sellerId: 'jun_surplus', pricePhp: 300 } as GameEventMap['partPurchased']);
  const state = loadSocialSession(storage).snapshot();
  expect(state.npcs.casey.respect).toBe(58);
  expect(state.npcs.mang_boy.trust).toBe(53);
  expect(state.npcs.jun_surplus.trust).toBe(51);
  expect(state.reputation.iloilo_scene?.points).toBe(8);
  expect(state.appliedEvents).toHaveLength(4);
  expect(errors).not.toHaveBeenCalled();
  social.dispose(); bridge.dispose();
 });

 it('preserves dialogue changes written by the UI after bridge setup', () => {
  const bridge = new GameBridge(), storage = memoryStorage();
  const social = new SocialEventBridge(bridge.ui.events, storage);
  recordDialogueIntroduction('talyer_mang_boy', storage);
  recordDialogueChoice('talyer_mang_boy', 'promise_help', storage);
  bridge.runtime.emit('jobState', { runId: 'talyer_oil_errand#1', jobId: 'talyer_oil_errand', status: 'accepted' } as GameEventMap['jobState']);
  expect(loadSocialSession(storage).snapshot().npcs.mang_boy.relationshipFlags).toContain('promised_help');
  expect(loadSocialSession(storage).snapshot().favors.mang_boy_parts_help.status).toBe('accepted');
  social.dispose(); bridge.dispose();
 });

 it('reports one tier transition when separate race losses cross Regular', () => {
  const bridge = new GameBridge(), storage = memoryStorage(), updates = vi.fn(), errors = vi.fn();
  const social = new SocialEventBridge(bridge.ui.events, storage, errors, updates);
  for (let n = 1; n <= 3; n++) bridge.runtime.emit('raceFinished', { validation: raceValidation('kyo_block_lap'), raceId: 'kyo_block_lap', attemptId: `kyo-loss-${n}`, position: 2, racers: 2, timeMs: 120000 });
  bridge.runtime.emit('raceFinished', { validation: raceValidation('kyo_block_lap'), raceId: 'kyo_block_lap', attemptId: 'kyo-loss-3', position: 2, racers: 2, timeMs: 120000 });
  expect(updates).toHaveBeenCalledTimes(3);
  expect(updates.mock.calls.filter(([, transition]) => transition)).toHaveLength(1);
  expect(updates.mock.calls[2][1]).toMatchObject({ from: 'Unknown', to: 'Regular', points: 15 });
  expect(loadSocialSession(storage).snapshot().npcs.casey.respect).toBe(50);
  expect(errors).not.toHaveBeenCalled();
  social.dispose(); bridge.dispose();
 });
});
