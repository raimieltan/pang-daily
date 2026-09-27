import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT } from './catalog';
import { SocialSession } from './SocialSession';
import { REPUTATION_CONFIG, getReputationProgress, meetsReputationTier } from './reputation';
import { RACE_CALENDAR } from '@/game/races/raceCalendar';
import { HUB_JOBS } from '@/game/jobs/hubJobs';

const race = (attemptId: string, position = 2) => ({ type: 'race' as const, eventId: `race:${attemptId}`, sourceId: attemptId, attemptId, raceId: 'kyo_block_lap', position, racers: 2, timeMs: 120000 });
const favor = (phase: 'accepted' | 'completed' | 'failed', runId = 'talyer_oil_errand#1') => ({ type: 'favor' as const, eventId: `favor:${runId}:${phase}`, sourceId: runId, npcId: 'mang_boy', favorId: 'mang_boy_parts_help', jobId: 'talyer_oil_errand', runId, phase, jobStatus: phase });

describe('scene recognition ladder', () => {
 it('derives every tier at, below, and above its configured threshold', () => {
  const tiers = REPUTATION_CONFIG.tiers;
  for (let index = 1; index < tiers.length; index++) {
   const threshold = tiers[index].minimum;
   expect(getReputationProgress(threshold - 1).tier).toBe(tiers[index - 1].name);
   expect(getReputationProgress(threshold).tier).toBe(tiers[index].name);
   expect(getReputationProgress(threshold + 1).tier).toBe(tiers[index].name);
   expect(meetsReputationTier(threshold - 1, tiers[index].name)).toBe(false);
   expect(meetsReputationTier(threshold, tiers[index].name)).toBe(true);
  }
  expect(getReputationProgress(0).tier).toBe('Unknown');
  expect(getReputationProgress(REPUTATION_CONFIG.cap + 999).points).toBe(REPUTATION_CONFIG.cap);
  expect(getReputationProgress(-99).points).toBe(0);
  expect(getReputationProgress(Number.NaN).points).toBe(0);
  expect(Object.keys(REPUTATION_CONFIG.races).sort()).toEqual(RACE_CALENDAR.map((route) => route.id).sort());
  for (const jobId of Object.keys(REPUTATION_CONFIG.jobs)) expect(HUB_JOBS.some((job) => job.id === jobId)).toBe(true);
 });

 it('clamps applied rewards and penalties, while Feared leaves NPC hostility unchanged', () => {
  const upper = new SocialSession(SOCIAL_CONTENT).snapshot();
  upper.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: REPUTATION_CONFIG.cap - 1 };
  const session = new SocialSession(SOCIAL_CONTENT, upper);
  const award = session.applyEvent(race('cap-race', 1));
  expect(session.snapshot().reputation.iloilo_scene.points).toBe(REPUTATION_CONFIG.cap);
  expect(award.record?.reputation?.pointsDelta).toBe(1);
  expect(getReputationProgress(120).tier).toBe('Feared');
  expect(session.relationships('casey').hostile).toBe(false);

  const lower = new SocialSession(SOCIAL_CONTENT).snapshot();
  lower.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 1 };
  const second = new SocialSession(SOCIAL_CONTENT, lower);
  second.applyEvent(favor('accepted'));
  expect(second.applyEvent(favor('failed')).record?.reputation?.pointsDelta).toBe(-1);
  expect(getReputationProgress(second.snapshot()).points).toBe(0);
 });

 it('lets an early race loss and available errand reach Regular', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  expect(getReputationProgress(session.snapshot()).tier).toBe('Unknown');
  session.applyEvent(race('kyo-first-loss'));
  expect(getReputationProgress(session.snapshot()).points).toBe(5);
  session.applyEvent(favor('accepted'));
  session.applyEvent(favor('completed'));
  expect(getReputationProgress(session.snapshot()).tier).toBe('Regular');
  expect(getReputationProgress(session.snapshot()).points).toBe(13);
 });

 it('caps route rewards across reload and ignores duplicate results', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  for (let n = 1; n <= 3; n++) session.applyEvent(race(`kyo-attempt-${n}`));
  const saved = session.snapshot();
  expect(saved.reputation.iloilo_scene.points).toBe(15);
  expect(saved.reputationRewards['race:kyo_block_lap'].count).toBe(3);
  const restored = new SocialSession(SOCIAL_CONTENT, saved);
  expect(restored.applyEvent(race('kyo-attempt-1')).status).toBe('duplicate');
  restored.applyEvent(race('kyo-attempt-4'));
  expect(getReputationProgress(restored.snapshot()).points).toBe(15);
  expect(restored.snapshot().reputationRewards['race:kyo_block_lap'].count).toBe(3);
 });

 it('rejects unknown or over-limit reward counters in a saved profile', () => {
  const saved = new SocialSession(SOCIAL_CONTENT).snapshot();
  saved.reputationRewards['race:missing_route'] = { sourceKey: 'race:missing_route', count: 1 };
  expect(() => new SocialSession(SOCIAL_CONTENT, saved)).toThrow('invalid reputation source');
  delete saved.reputationRewards['race:missing_route'];
  saved.reputationRewards['race:kyo_block_lap'] = { sourceKey: 'race:kyo_block_lap', count: REPUTATION_CONFIG.races.kyo_block_lap.limit + 1 };
  expect(() => new SocialSession(SOCIAL_CONTENT, saved)).toThrow('invalid reputation reward count');
 });

 it('keeps reputation separate from trust and can demote on a broken favor', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  session.applyEvent(race('kyo-loss'));
  for (let n = 1; n <= 2; n++) session.applyEvent({ type: 'job', eventId: `job:kyo_ice_run#${n}`, sourceId: `kyo_ice_run#${n}`, jobId: 'kyo_ice_run', runId: `kyo_ice_run#${n}`, outcome: 'completed' });
  const before = session.snapshot().npcs.casey;
  session.applyEvent(favor('accepted'));
  const result = session.applyEvent(favor('failed'));
  expect(getReputationProgress(session.snapshot()).tier).toBe('Unknown');
  expect(result.tierChange).toMatchObject({ from: 'Regular', to: 'Unknown' });
  expect(session.snapshot().npcs.casey).toEqual(before);
  expect(session.relationships('casey').hostile).toBe(false);
 });
});
