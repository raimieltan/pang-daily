import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { SocialSession } from './SocialSession';
import { CONVERSATIONS, evaluateDialogueCondition, resolveConversation, validateConversations } from './conversation';

describe('authored conversations', () => {
 it('allows repeatable navigation without consuming or persisting a choice', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent({ type: 'dialogue', eventId: 'intro:mang', sourceId: 'talyer_mang_boy', npcId: 'mang_boy', dialogueId: 'talyer_mang_boy' });
  session.chooseConversation('talyer_mang_boy', 'mang_first', 'promise_help');
  const before = session.snapshot();
  for (let repeat = 0; repeat < 3; repeat++) {
   expect(session.chooseConversation('talyer_mang_boy', 'mang_familiar', 'ask_favor').status).toBe('applied');
  }
  expect(session.snapshot()).toEqual(before);
 });

 it('prioritizes low trust over post-race familiarity', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  const state = session.snapshot();
  state.npcs.casey.introduced = true;
  state.npcs.casey.trust = 20;
  state.appliedEvents.push({ eventId: 'race:one', sourceId: 'one', sourceKey: 'race:one', fingerprint: 'one', type: 'race', targetId: 'casey', contextId: 'pahuway_descent', reason: 'Finished', effects: [] });
  expect(resolveConversation('casey_intro', state).node.id).toBe('casey_low_trust');
 });
 it('validates references and missing nodes', () => {
  expect(validateConversations(CONVERSATIONS, SOCIAL_CONTENT)).toEqual([]);
  expect(validateConversations([{ ...CONVERSATIONS[0], fallbackNodeId: 'missing' }], SOCIAL_CONTENT)).toContain('missing fallback node: missing');
  expect(validateConversations([{ ...CONVERSATIONS[0], nodes: [{ ...CONVERSATIONS[0].nodes[0], speakerId: 'missing' }] }], SOCIAL_CONTENT)).toContain('unknown speaker: missing');
  expect(validateConversations([{ ...CONVERSATIONS[0], branches: [{ nodeId: 'mang_first', when: { favorId: 'missing', favorStatus: 'failed' } }] }], SOCIAL_CONTENT)).toContain('unknown condition favor: missing');
  const first = CONVERSATIONS.find(c => c.id === 'talyer_mang_boy')!.nodes.find(n => n.id === 'mang_first')!;
  const invalidChoice = { ...first.choices[0], nextNodeId: 'missing', once: false };
  const invalid = [{ ...CONVERSATIONS[0], nodes: [{ ...first, choices: [invalidChoice] }] }];
  expect(validateConversations(invalid, SOCIAL_CONTENT)).toContain('missing next node: missing');
  expect(validateConversations(invalid, SOCIAL_CONTENT)).toContain('effect must be one-shot: promise_help');
 });

 it('evaluates authored all/any conditions against independent social records', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  const state = session.snapshot();
  state.npcs.casey.introduced = true;
  state.npcs.casey.trust = 20;
  state.npcs.casey.respect = 80;
  state.npcs.casey.relationshipFlags.push('rival');
  state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 55 };
  state.crews.kyo_regulars = { crewId: 'kyo_regulars', points: 12, membership: 'none', invitation: 'invited', introduced: true, joins: 0 };
  state.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'failed', runId: 'talyer_oil_errand#1' };
  state.unlocks.talyer_favor = { unlockId: 'talyer_favor', unlocked: true };
  expect(evaluateDialogueCondition({ all: [
   { npcId: 'casey', trustAtMost: 20, respectAtLeast: 80, flag: 'rival' },
   { reputationTier: 'Respected' },
   { crewId: 'kyo_regulars', standingAtLeast: 12, membership: 'invited' },
   { favorId: 'mang_boy_parts_help', favorStatus: 'failed' },
   { unlockId: 'talyer_favor', unlocked: true },
   { any: [{ raceId: 'pahuway_descent', raceResult: 'finished' }, { npcId: 'casey', introduced: true }] },
  ] }, state)).toBe(true);
  expect(evaluateDialogueCondition({ raceId: 'pahuway_descent', raceResult: 'finished' }, state)).toBe(false);
 });

 it('shows first meeting, familiar, low trust, post-race, and fallback branches', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  expect(resolveConversation('casey_intro', session.snapshot()).node.id).toBe('casey_first');
  session.applyEvent({ type: 'dialogue', eventId: 'intro:casey', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  expect(resolveConversation('casey_intro', session.snapshot()).node.id).toBe('casey_familiar');
  const low = session.snapshot(); low.npcs.casey.trust = 15;
  expect(resolveConversation('casey_intro', low).node.id).toBe('casey_low_trust');
  const raced = session.snapshot(); raced.appliedEvents.push({ eventId: 'race:one', sourceId: 'one', sourceKey: 'race:one', fingerprint: 'one', type: 'race', targetId: 'casey', contextId: 'pahuway_descent', reason: 'Finished', effects: [] });
  expect(resolveConversation('casey_intro', raced).node.id).toBe('casey_post_race');
  const noBranch = { ...CONVERSATIONS.find((entry) => entry.id === 'casey_intro')!, branches: [] };
  expect(resolveConversation('casey_intro', session.snapshot(), [noBranch]).node.id).toBe(noBranch.fallbackNodeId);
 });

 it('rejects stale choices and consumes one-shot effects across reload', () => {
  let saved: ReturnType<SocialSession['snapshot']> | undefined;
  const session = new SocialSession(SOCIAL_CONTENT, undefined, next => { saved = next; });
  session.applyEvent({ type: 'dialogue', eventId: 'intro:casey', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  expect(() => session.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey')).toThrow('unavailable dialogue choice');
  expect(session.snapshot().appliedEvents).toHaveLength(1);
  session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'race:casey-1', sourceId: 'casey-1', attemptId: 'casey-1', npcId: 'casey', raceId: 'pahuway_descent', position: 2, racers: 2, timeMs: 120000 });
  const result = session.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey');
  expect(result.status).toBe('applied');
  expect(session.snapshot().npcs.casey.relationshipFlags).toContain('trusted_friend');
  const restored = new SocialSession(SOCIAL_CONTENT, saved);
  expect(restored.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey').status).toBe('duplicate');
  expect(restored.snapshot().npcs.casey.trust).toBe(session.snapshot().npcs.casey.trust);
 });
});
