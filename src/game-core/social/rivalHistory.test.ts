import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { SocialSession } from './SocialSession';
import { FIRST_RIVAL, rivalHistory, type RivalOutcome } from './rivalHistory';
import { payRacePrize } from './raceOutcomes';
import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { resolveConversation } from './conversation';
import { VehicleSession } from '../maintenance/VehicleSession';
import { LOCAL_ROUTE } from '@/game/races/localRoute';
import { PAHUWAY_DESCENT, RACE_CALENDAR } from '@/game/races/raceCalendar';
import { SOCIAL_RACE_CHECKPOINTS } from './raceOutcomes';

const start = (attemptId: string) => ({ type: 'race_attempt' as const, eventId: `start:${attemptId}`, sourceId: attemptId, attemptId, npcId: 'casey', raceId: 'barangay_sprint', vehicleId: FIRST_RIVAL.vehicleId, totalCheckpoints: 3 });
const result = (attemptId: string, outcome: RivalOutcome) => ({ type: 'race' as const, eventId: `end:${attemptId}`, sourceId: attemptId, attemptId, npcId: 'casey', raceId: 'barangay_sprint', vehicleId: FIRST_RIVAL.vehicleId,
 outcome, position: outcome === 'win' ? 1 : 2, racers: 2, timeMs: outcome === 'dnf' ? 0 : 120000,
 validation: outcome === 'dnf' ? { ...raceValidation('barangay_sprint'), completedCheckpoints: 1, finishValidated: false } : raceValidation('barangay_sprint') });
describe('persistent rival', () => {
 it('keeps one NPC and vehicle identity in both races; checkpoint requirements match actual routes', () => {
  expect(LOCAL_ROUTE.rival).toMatchObject({ npcId: FIRST_RIVAL.npcId, vehicleId: FIRST_RIVAL.vehicleId, build: FIRST_RIVAL.vehicleBuildId });
  expect(PAHUWAY_DESCENT.rival).toMatchObject({ npcId: FIRST_RIVAL.npcId, vehicleId: FIRST_RIVAL.vehicleId, build: FIRST_RIVAL.vehicleBuildId });
  for (const route of [LOCAL_ROUTE, ...RACE_CALENDAR]) expect(SOCIAL_RACE_CHECKPOINTS[route.id]).toBe(route.checkpoints.length);
 });
 it('deduplicates meeting/start/result events and keeps win/loss/DNF history after reload', () => {
  const social = new SocialSession(SOCIAL_CONTENT);
  social.applyEvent({ type: 'dialogue', eventId: 'intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  for (const outcome of ['win', 'loss', 'dnf'] as const) {
   social.applyEvent(start(outcome)); social.applyEvent(start(outcome));
   social.applyEvent(result(outcome, outcome)); social.applyEvent({ ...result(outcome, outcome), eventId: `retry:${outcome}` });
  }
  const restored = new SocialSession(SOCIAL_CONTENT, social.snapshot());
  expect(rivalHistory(restored.snapshot())).toMatchObject({ metAtHub: true, wins: 1, losses: 1, dnfs: 1, latestOutcome: 'dnf' });
  expect(rivalHistory(restored.snapshot()).attempts).toHaveLength(3);
  expect(restored.snapshot().npcs.casey.eventIds).toEqual(expect.arrayContaining(['met_casey_at_kyo', 'raced_casey', 'beat_casey', 'lost_to_casey', 'casey_shared_dnf']));
  expect(() => restored.applyEvent(result('win', 'loss'))).toThrow('different outcome');
 });
 it.each(['win', 'loss', 'dnf'] as const)('authors a distinct %s response and keeps a visible usable rematch', outcome => {
  const social = new SocialSession(SOCIAL_CONTENT); social.applyEvent(start(outcome)); social.applyEvent(result(outcome, outcome));
  const view = resolveConversation('casey_intro', social.snapshot());
  expect(view.node.id).toBe('casey_post_race');
  expect(view.node.text).toContain({ win: 'Ginlampuwasan', loss: 'First loss', dnf: 'Wala mo natapos' }[outcome]);
  expect(view.choices.map(choice => choice.id)).toContain('casey_rematch_info');
  expect(rivalHistory(social.snapshot()).rematch).toMatchObject({ eligible: true, raceId: 'barangay_sprint', label: expect.stringContaining('no cooldown') });
 });
 it('separates first loss and later loss, keeps friendship after beating Casey, and rewards trust independently', () => {
  const social = new SocialSession(SOCIAL_CONTENT);
  social.applyEvent({ type: 'dialogue', eventId: 'intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  social.applyEvent(start('loss1')); social.applyEvent(result('loss1', 'loss'));
  expect(resolveConversation('casey_intro', social.snapshot()).node.text).toContain('First loss');
  const before = social.snapshot().npcs.casey;
  social.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey');
  expect(social.snapshot().npcs.casey).toMatchObject({ trust: before.trust + 3, respect: before.respect, relationshipFlags: expect.arrayContaining(['rival', 'trusted_friend']) });
  social.applyEvent(start('loss2')); social.applyEvent(result('loss2', 'loss'));
  expect(resolveConversation('casey_intro', social.snapshot()).node.text).toContain('Ako anay subong');
  social.applyEvent(start('win')); social.applyEvent(result('win', 'win'));
  expect(social.relationships('casey').friend).toBe(true);
  expect(SOCIAL_CONTENT.npcs.find(npc => npc.id === 'casey')?.homeInteractionId).toBe('casey_corner');
 });
 it('recovers an interrupted active race as one DNF with no rewards', () => {
  const social = new SocialSession(SOCIAL_CONTENT); social.applyEvent(start('interrupted'));
  const restored = new SocialSession(SOCIAL_CONTENT, social.snapshot()); restored.recoverInterruptedRaces(); restored.recoverInterruptedRaces();
  expect(rivalHistory(restored.snapshot())).toMatchObject({ wins: 0, losses: 0, dnfs: 1 });
  expect(restored.snapshot().npcs.casey.respect).toBe(50);
  expect(restored.snapshot().reputation).toEqual({});
 });
 it.each(['missing', 'skipped', 'invalid', 'wrong_identity'] as const)('rejects %s finish evidence without recording a win or changing scores', kind => {
  const social = new SocialSession(SOCIAL_CONTENT); social.applyEvent(start(kind)); const before = social.snapshot();
  const input = result(kind, 'win');
  if (kind === 'missing') input.validation = undefined as never;
  if (kind === 'skipped') input.validation.completedCheckpoints = 2;
  if (kind === 'invalid') input.validation.invalidFinish = true;
  if (kind === 'wrong_identity') input.vehicleId = 'another_car' as never;
  expect(() => social.applyEvent(input)).toThrow(); expect(social.snapshot()).toEqual(before);
 });
 it('counts existing race prize receipts toward the shared route reward limit', () => {
  const wallet = new VehicleSession();
  for (let i = 0; i < 3; i++) wallet.earn(400, { kind: 'race_prize', source: 'race:barangay_sprint', relatedEntityId: `old-attempt-${i}`, description: 'Previous race prize' });
  const before = wallet.snapshot();
  expect(payRacePrize(wallet, result('new-rematch', 'win'), 400)).toBe(0);
  expect(wallet.snapshot()).toEqual(before);
 });
 it('limits respect, reputation, and money across reload while recording every genuine rematch', () => {
  let social = new SocialSession(SOCIAL_CONTENT); let wallet = new VehicleSession();
  for (let i = 0; i < 5; i++) {
   const input = result(`rematch${i}`, 'win'); social.applyEvent(start(input.attemptId)); social.applyEvent(input);
   payRacePrize(wallet, input, 400); payRacePrize(wallet, input, 400);
   social = new SocialSession(SOCIAL_CONTENT, social.snapshot()); wallet = new VehicleSession(wallet.snapshot());
  }
  expect(rivalHistory(social.snapshot()).wins).toBe(5);
  expect(social.snapshot().npcs.casey.respect).toBe(74);
  expect(social.snapshot().reputation.iloilo_scene.points).toBe(24);
  expect(wallet.snapshot().walletPhp).toBe(6200);
  expect(payRacePrize(wallet, result('dnf', 'dnf'), 400)).toBe(0);
  expect(payRacePrize(wallet, { ...result('shortcut', 'win'), validation: { ...raceValidation('barangay_sprint'), completedCheckpoints: 0 } }, 400)).toBe(0);
 });
});
