import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { SocialSession } from './SocialSession';

const dialogue = (eventId = 'dialogue:boy:1') => ({ type: 'dialogue' as const, eventId, sourceId: 'talyer_mang_boy', npcId: 'mang_boy', dialogueId: 'talyer_mang_boy' });
const favor = (phase: 'accepted' | 'completed' | 'failed' | 'abandoned', runId = 'talyer_oil_errand#1') => ({ type: 'favor' as const, eventId: `favor:${runId}:${phase}`, sourceId: runId, npcId: 'mang_boy', favorId: 'mang_boy_parts_help', jobId: 'talyer_oil_errand', runId, phase, jobStatus: phase });

describe('deterministic social events', () => {
 it('consumes an event and its effects together, including after reload', () => {
  let saved: unknown;
  const session = new SocialSession(SOCIAL_CONTENT, undefined, next => { saved = next; });
  expect(session.applyEvent(dialogue()).status).toBe('applied');
  expect(session.applyEvent(dialogue()).status).toBe('duplicate');
  const restored = new SocialSession(SOCIAL_CONTENT, saved);
  expect(restored.applyEvent(dialogue()).status).toBe('duplicate');
  expect(restored.snapshot().npcs.mang_boy.introduced).toBe(true);
  expect(restored.snapshot().appliedEvents).toHaveLength(1);
 });

 it('rejects invalid outcomes and does not consume a failed command', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  const before = session.snapshot();
  expect(() => session.applyEvent({ ...favor('completed'), jobStatus: 'failed' })).toThrow();
  expect(() => session.applyEvent({ ...dialogue(), npcId: 'ghost' })).toThrow();
  expect(session.snapshot()).toEqual(before);
 });

 it('rejects conflicting redelivery of a consumed source', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  const won = { validation: raceValidation('pahuway_descent'), type: 'race' as const, eventId: 'race:one', sourceId: 'attempt:one', attemptId: 'attempt:one', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 };
  session.applyEvent(won);
  const before = session.snapshot();
  expect(() => session.applyEvent({ ...won, eventId: 'race:altered', position: 2 })).toThrow('different outcome');
  expect(session.snapshot()).toEqual(before);
 });

 it('does not farm greetings or proximity', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent(dialogue());
  expect(session.applyEvent(dialogue('dialogue:boy:2')).status).toBe('duplicate');
  expect(session.snapshot().npcs.mang_boy.trust).toBe(50);
  expect(session.snapshot().appliedEvents).toHaveLength(1);
 });

 it('tracks favor failure and repairs trust through an authored follow-up job', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent(dialogue());
  session.applyEvent(favor('accepted'));
  session.applyEvent(favor('failed'));
  expect(session.snapshot().npcs.mang_boy.trust).toBeLessThan(50);
  expect(session.snapshot().favors.mang_boy_parts_help.status).toBe('failed');
  session.applyEvent({ type: 'favor', eventId: 'recovery:accepted', sourceId: 'talyer_battery_drop#1', npcId: 'mang_boy', favorId: 'mang_boy_recovery', jobId: 'talyer_battery_drop', runId: 'talyer_battery_drop#1', phase: 'accepted', jobStatus: 'accepted' });
  session.applyEvent({ type: 'favor', eventId: 'recovery:completed', sourceId: 'talyer_battery_drop#1', npcId: 'mang_boy', favorId: 'mang_boy_recovery', jobId: 'talyer_battery_drop', runId: 'talyer_battery_drop#1', phase: 'completed', jobStatus: 'completed' });
  expect(session.snapshot().npcs.mang_boy.trust).toBeGreaterThan(30);
  expect(session.snapshot().favors.mang_boy_recovery.status).toBe('completed');
  expect(session.relationships('mang_boy').mentor).toBe(true);
 });

 it('completes the original favor once after its accepted job result', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent(favor('accepted'));
  expect(session.applyEvent(favor('completed')).status).toBe('applied');
  expect(session.applyEvent(favor('completed')).status).toBe('duplicate');
  expect(session.snapshot().npcs.mang_boy).toMatchObject({ trust: 58, respect: 55, favorIds: [], eventIds: ['helped_mang_boy'] });
  expect(session.snapshot().favors.mang_boy_parts_help.status).toBe('completed');
 });

 it('distinguishes race attempts, caps rewards, and changes only the rival', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  for (let n = 1; n <= 5; n++) session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: `race:${n}`, sourceId: `attempt:${n}`, attemptId: `attempt:${n}`, npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 });
  expect(session.snapshot().npcs.casey.respect).toBe(74);
  expect(session.snapshot().npcs.mang_boy.respect).toBe(50);
  expect(session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'race:1', sourceId: 'attempt:1', attemptId: 'attempt:1', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 }).status).toBe('duplicate');
  const restored = new SocialSession(SOCIAL_CONTENT, session.snapshot());
  expect(restored.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'race:1', sourceId: 'attempt:1', attemptId: 'attempt:1', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 }).status).toBe('duplicate');
  expect(restored.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'race:6', sourceId: 'attempt:6', attemptId: 'attempt:6', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 }).status).toBe('applied');
  expect(restored.snapshot().npcs.casey.respect).toBe(74);
 });

 it('sets friendship or hostility only through authored post-race choices', () => {
  const friend = new SocialSession(SOCIAL_CONTENT);
  friend.applyEvent({ type: 'dialogue', eventId: 'casey-intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  expect(() => friend.applyEvent({ type: 'dialogue', eventId: 'early-choice', sourceId: 'casey_intro:congratulate_casey', npcId: 'casey', dialogueId: 'casey_intro', choiceId: 'congratulate_casey' })).toThrow('valid race');
  friend.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'casey-race-1', sourceId: 'casey-attempt-1', attemptId: 'casey-attempt-1', npcId: 'casey', raceId: 'pahuway_descent', position: 2, racers: 2, timeMs: 130000 });
  expect(friend.relationships('casey')).toEqual({ friend: false, hostile: false, mentor: false });
  friend.applyEvent({ type: 'dialogue', eventId: 'good-run', sourceId: 'casey_intro:congratulate_casey', npcId: 'casey', dialogueId: 'casey_intro', choiceId: 'congratulate_casey' });
  expect(friend.relationships('casey')).toEqual({ friend: true, hostile: false, mentor: false });
  expect(() => friend.applyEvent({ type: 'dialogue', eventId: 'insult-after-friend', sourceId: 'casey_intro:insult_casey', npcId: 'casey', dialogueId: 'casey_intro', choiceId: 'insult_casey' })).toThrow('already settled');

  const hostile = new SocialSession(SOCIAL_CONTENT);
  hostile.applyEvent({ type: 'dialogue', eventId: 'hostile-intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  hostile.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'hostile-race', sourceId: 'hostile-attempt', attemptId: 'hostile-attempt', npcId: 'casey', raceId: 'pahuway_descent', position: 2, racers: 2, timeMs: 130000 });
  hostile.applyEvent({ type: 'dialogue', eventId: 'insult', sourceId: 'casey_intro:insult_casey', npcId: 'casey', dialogueId: 'casey_intro', choiceId: 'insult_casey' });
  expect(hostile.relationships('casey')).toEqual({ friend: false, hostile: true, mentor: false });
 });

 it('clamps scores and rolls back when persistence fails', () => {
  const seed = new SocialSession(SOCIAL_CONTENT).snapshot();
  seed.npcs.casey.respect = 99;
  seed.npcs.mang_boy.trust = 99;
  const session = new SocialSession(SOCIAL_CONTENT, seed);
  const race = session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'upper-bound-race', sourceId: 'upper-bound-attempt', attemptId: 'upper-bound-attempt', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 120000 });
  expect(session.snapshot().npcs.casey.respect).toBe(100);
  expect(race.record?.effects[0].respectDelta).toBe(1);
  for (let n = 1; n <= 20; n++) session.applyEvent({ type: 'service', eventId: `repair:${n}`, sourceId: `repair:${n}`, npcId: 'mang_boy', serviceId: 'repair', outcome: 'completed', transactionId: n, vehicleId: 'daily', components: ['engine'], costPhp: 100 });
  expect(session.snapshot().npcs.mang_boy.trust).toBe(100);
  const failing = new SocialSession(SOCIAL_CONTENT, session.snapshot(), () => { throw new Error('storage full'); });
  const before = failing.snapshot();
  expect(() => failing.applyEvent(dialogue())).toThrow('storage full');
  expect(failing.snapshot()).toEqual(before);
 });

 it('rejects impossible race results and preserves the lower bound', () => {
  const seed = new SocialSession(SOCIAL_CONTENT).snapshot();
  seed.npcs.mang_boy.trust = 1;
  const session = new SocialSession(SOCIAL_CONTENT, seed);
  expect(() => session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'invalid-race', sourceId: 'invalid-attempt', attemptId: 'invalid-attempt', npcId: 'casey', raceId: 'pahuway_descent', position: 3, racers: 2, timeMs: 1000 })).toThrow('Invalid race result');
  expect(session.snapshot().appliedEvents).toHaveLength(0);
  session.applyEvent(favor('accepted'));
  const outcome = session.applyEvent(favor('failed'));
  expect(session.snapshot().npcs.mang_boy.trust).toBe(0);
  expect(outcome.record?.effects[0].trustDelta).toBe(-1);
 });
});
