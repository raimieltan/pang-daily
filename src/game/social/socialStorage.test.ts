import { describe, expect, it } from 'vitest';
import { loadSocialSession, recordDialogueChoice, recordDialogueIntroduction, SOCIAL_SESSION_KEY } from './socialStorage';

const memoryStorage = () => {
 const values = new Map<string, string>();
 return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('social persistence', () => {
 it('saves introduction and consumed ID in one snapshot', () => {
  const storage = memoryStorage();
  expect(recordDialogueIntroduction('casey_intro', storage)).toBe(true);
  expect(recordDialogueIntroduction('casey_intro', storage)).toBe(true);
  expect(loadSocialSession(storage).snapshot().npcs.casey.introduced).toBe(true);
  expect(loadSocialSession(storage).snapshot().appliedEvents).toHaveLength(1);
  expect(storage.values.has(SOCIAL_SESSION_KEY)).toBe(true);
 });

 it('uses an authored dialogue choice once', () => {
  const storage = memoryStorage();
  recordDialogueIntroduction('talyer_mang_boy', storage);
  expect(recordDialogueChoice('talyer_mang_boy', 'promise_help', storage)).toBe(true);
  recordDialogueChoice('talyer_mang_boy', 'promise_help', storage);
  expect(loadSocialSession(storage).snapshot().npcs.mang_boy.trust).toBe(52);
  expect(loadSocialSession(storage).snapshot().favors.mang_boy_parts_help.status).toBe('offered');
 });

 it('does not write for unrelated dialogue and rejects broken saves', () => {
  const storage = memoryStorage();
  expect(recordDialogueIntroduction('debug_sprint_start', storage)).toBe(false);
  expect(storage.values.size).toBe(0);
  storage.values.set(SOCIAL_SESSION_KEY, JSON.stringify({ version: 2, npcs: { ghost: {} }, reputation: {}, crews: {}, unlocks: {}, favors: {}, appliedEvents: [] }));
  expect(() => loadSocialSession(storage)).toThrow('unknown NPC');
 });
});
