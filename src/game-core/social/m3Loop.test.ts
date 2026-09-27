import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { resolveConversation } from './conversation';
import { SocialSession } from './SocialSession';
import { FIRST_RIVAL } from './rivalHistory';
import { raceValidation } from '../../../tests/fixtures/raceValidation';

describe('first playable social loop', () => {
 it('lets the Kyo friend introduce Mang Boy once and remembers it across reload', () => {
  let saved: ReturnType<SocialSession['snapshot']> | undefined;
  const session = new SocialSession(SOCIAL_CONTENT, undefined, next => { saved = next; });
  expect(SOCIAL_CONTENT.npcs.find(npc => npc.id === 'kyo_barista')?.roles).toContain('friend');
  session.applyEvent({ type: 'dialogue', eventId: 'intro:kyo', sourceId: 'kyo_order', npcId: 'kyo_barista', dialogueId: 'kyo_order' });
  expect(resolveConversation('kyo_order', session.snapshot()).node.id).toBe('kyo_familiar');
  expect(session.chooseConversation('kyo_order', 'kyo_familiar', 'introduce_mang_boy').status).toBe('applied');
  const restored = new SocialSession(SOCIAL_CONTENT, saved);
  expect(restored.snapshot().npcs.kyo_barista.relationshipFlags).toContain('introduced_mang_boy');
  expect(restored.chooseConversation('kyo_order', 'kyo_familiar', 'introduce_mang_boy').status).toBe('duplicate');
  expect(resolveConversation('talyer_mang_boy', restored.snapshot()).node.id).toBe('mang_referred');
 });

 it('responds to a real seller benefit after Jun earns trust', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent({ type: 'dialogue', eventId: 'intro:jun', sourceId: 'seller_jun_surplus', npcId: 'jun_surplus', dialogueId: 'seller_jun_surplus' });
  const state = session.snapshot();
  state.npcs.jun_surplus.trust = 52;
  state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 12 };
  expect(resolveConversation('seller_jun_surplus', state).node.id).toBe('jun_offer');
 });

 it('has distinct mechanic greetings for completed help and repair of a broken promise', () => {
  const base = new SocialSession(SOCIAL_CONTENT).snapshot();
  base.npcs.mang_boy.introduced = true;
  base.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'completed', runId: null };
  expect(resolveConversation('talyer_mang_boy', base).node.id).toBe('mang_helped');
  base.favors.mang_boy_parts_help.status = 'failed';
  base.favors.mang_boy_recovery = { favorId: 'mang_boy_recovery', npcId: 'mang_boy', status: 'completed', runId: null };
  expect(resolveConversation('talyer_mang_boy', base).node.id).toBe('mang_repaired');
 });

 it('restores the same relationship when an NPC display name changes', () => {
  const state = new SocialSession(SOCIAL_CONTENT).snapshot();
  state.npcs.kyo_barista.introduced = true;
  state.npcs.kyo_barista.relationshipFlags.push('introduced_mang_boy');
  const renamed = { ...SOCIAL_CONTENT, npcs: SOCIAL_CONTENT.npcs.map(npc => npc.id === 'kyo_barista' ? { ...npc, name: 'Kyo' } : npc) };
  expect(new SocialSession(renamed, state).snapshot().npcs.kyo_barista).toEqual(state.npcs.kyo_barista);
 });

 it('offers a recovery job after abandoning the promised oil favor', () => {
  const state = new SocialSession(SOCIAL_CONTENT).snapshot();
  state.npcs.mang_boy.introduced = true;
  state.npcs.mang_boy.trust = 40;
  state.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'abandoned', runId: 'talyer_oil_errand#1' };
  const session = new SocialSession(SOCIAL_CONTENT, state);
  expect(resolveConversation('talyer_mang_boy', session.snapshot()).node.id).toBe('mang_low_trust');
  expect(session.chooseConversation('talyer_mang_boy', 'mang_low_trust', 'offer_recovery').status).toBe('applied');
  expect(session.snapshot().favors.mang_boy_recovery.status).toBe('offered');
 });

 it('earns recognition and a crew invitation after three valid losses without upgrades', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent({ type: 'dialogue', eventId: 'intro:casey', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  for (let attempt = 1; attempt <= 3; attempt++) {
   const attemptId = `loss-${attempt}`;
   session.applyEvent({ type: 'race_attempt', eventId: `start:${attemptId}`, sourceId: attemptId, attemptId, npcId: 'casey', raceId: 'barangay_sprint', vehicleId: FIRST_RIVAL.vehicleId, totalCheckpoints: 3 });
   session.applyEvent({ type: 'race', eventId: `end:${attemptId}`, sourceId: attemptId, attemptId, npcId: 'casey', raceId: 'barangay_sprint', vehicleId: FIRST_RIVAL.vehicleId, outcome: 'loss', position: 2, racers: 2, timeMs: 120000, validation: raceValidation('barangay_sprint') });
   if (attempt === 1) session.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey');
  }
  expect(session.snapshot().npcs.casey.respect).toBe(56);
  expect(session.snapshot().reputation.iloilo_scene.points).toBe(15);
  expect(session.discoverOpportunities().map(item => item.id)).toContain('kyo_crew_invitation');
  expect(session.chooseConversation('casey_intro', 'kyo_crew', 'crew_invite').status).toBe('applied');
  expect(session.chooseConversation('casey_intro', 'kyo_crew', 'crew_accept').status).toBe('applied');
  expect(session.snapshot().crews.kyo_regulars.membership).toBe('member');
 });
});
