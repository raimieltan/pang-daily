import { describe, expect, it } from 'vitest';
import type { CrewStanding } from './contract';
import { SOCIAL_CONTENT } from './catalog';
import { createSocialState, restoreSocialState, SocialSession } from './SocialSession';
import { crewStatus, initialCrew, joinCrew } from './crews';
import { evaluateEligibility } from './eligibility';
import { opportunity } from './opportunities';
import { resolveConversation } from './conversation';
import { VehicleSession } from '../maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '../vehicles';

function qualified() {
 const state = createSocialState(SOCIAL_CONTENT);
 state.npcs.casey.introduced = true;
 state.npcs.casey.trust = 50; state.npcs.casey.respect = 55;
 state.npcs.casey.relationshipFlags.push('trusted_friend');
 state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 12 };
 return state;
}
const choose = (session: SocialSession, id: string) => session.chooseConversation('casey_intro', 'kyo_crew', id);
const access = (session: SocialSession) => evaluateEligibility(opportunity('kyo_midnight_run'), session.snapshot());

describe('Kyo crew lifecycle', () => {
 it('introduces through the existing contact, independently of scores', () => {
  const session = new SocialSession(SOCIAL_CONTENT);
  expect(crewStatus(session.snapshot(), 'kyo_regulars')).toBe('undiscovered');
  session.applyEvent({ type: 'dialogue', eventId: 'meet', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  expect(crewStatus(session.snapshot(), 'kyo_regulars')).toBe('introduced');
  expect(session.snapshot().crews.kyo_regulars.points).toBe(0);
  expect(resolveConversation('casey_intro', session.snapshot()).choices.map(item => item.id)).toContain('crew_info_familiar');
 });
 it.each(['trust', 'respect', 'reputation', 'friendship', 'standing'])('rejects invitation below %s requirements without mutation', requirement => {
  const state = qualified();
  if (requirement === 'trust') state.npcs.casey.trust = 49;
  if (requirement === 'respect') state.npcs.casey.respect = 54;
  if (requirement === 'reputation') state.reputation.iloilo_scene.points = 11;
  if (requirement === 'friendship') state.npcs.casey.relationshipFlags = [];
  if (requirement === 'standing') state.crews.kyo_regulars = { ...initialCrew('kyo_regulars'), introduced: true, points: -1 };
  const session = new SocialSession(SOCIAL_CONTENT, state), before = session.snapshot();
  expect(() => choose(session, 'crew_invite')).toThrow('unavailable');
  expect(session.snapshot()).toEqual(before);
 });
 it('accepts at requirements, persists invitation/member, and cannot repeat any join benefit', () => {
  let saved = '';
  const session = new SocialSession(SOCIAL_CONTENT, qualified(), state => { saved = JSON.stringify(state); });
  choose(session, 'crew_invite');
  expect(crewStatus(session.snapshot(), 'kyo_regulars')).toBe('invited');
  const reload = new SocialSession(SOCIAL_CONTENT, JSON.parse(saved), state => { saved = JSON.stringify(state); });
  expect(access(reload).eligible).toBe(false);
  choose(reload, 'crew_accept');
  expect(access(reload)).toMatchObject({ eligible: true, discovered: true });
  const member = new SocialSession(SOCIAL_CONTENT, JSON.parse(saved));
  expect(crewStatus(member.snapshot(), 'kyo_regulars')).toBe('member');
  const before = member.snapshot();
  expect(choose(member, 'crew_accept').status).toBe('duplicate');
  expect(member.snapshot()).toEqual(before);
  expect(member.snapshot().crews.kyo_regulars.joins).toBe(1);
 });
 it('declines without damaging friends, standing, or ordinary repairs and can reconsider', () => {
  const session = new SocialSession(SOCIAL_CONTENT, qualified());
  choose(session, 'crew_invite');
  const before = session.snapshot();
  choose(session, 'crew_decline');
  expect(crewStatus(session.snapshot(), 'kyo_regulars')).toBe('declined');
  expect(session.snapshot().npcs).toEqual(before.npcs);
  expect(session.relationships('casey').friend).toBe(true);
  expect(session.snapshot().crews.kyo_regulars.points).toBe(0);
  expect(access(session).eligible).toBe(false);
  const wallet = new VehicleSession();
  wallet.useSocialAccess(id => evaluateEligibility(opportunity(id), session.snapshot()));
  const quote = wallet.quote(car);
  expect(wallet.repair(car, quote, ['brakes'])).not.toHaveProperty('rejected');
  const reload = new SocialSession(SOCIAL_CONTENT, JSON.parse(JSON.stringify(session.snapshot())));
  expect(() => choose(reload, 'crew_accept')).toThrow('unavailable');
  choose(reload, 'crew_reconsider'); choose(reload, 'crew_accept');
  expect(access(reload).eligible).toBe(true);
 });
 it('leaves with history intact, rechecks requirements, permits one explicit rejoin, then closes rejoin', () => {
  const session = new SocialSession(SOCIAL_CONTENT, qualified());
  choose(session, 'crew_invite'); choose(session, 'crew_accept');
  const member = session.snapshot();
  choose(session, 'crew_leave');
  expect(crewStatus(session.snapshot(), 'kyo_regulars')).toBe('left');
  expect(session.snapshot().appliedEvents.slice(0, -1)).toEqual(member.appliedEvents);
  expect(session.snapshot().npcs).toEqual(member.npcs);
  expect(access(session)).toMatchObject({ eligible: false, discovered: true });
  const poor = session.snapshot(); poor.npcs.casey.trust = 49;
  expect(() => choose(new SocialSession(SOCIAL_CONTENT, poor), 'crew_rejoin_invite')).toThrow('unavailable');
  const reload = new SocialSession(SOCIAL_CONTENT, JSON.parse(JSON.stringify(session.snapshot())));
  choose(reload, 'crew_rejoin_invite'); choose(reload, 'crew_rejoin');
  expect(reload.snapshot().crews.kyo_regulars.joins).toBe(2);
  expect(choose(reload, 'crew_rejoin').status).toBe('duplicate');
  choose(reload, 'crew_leave_again');
  expect(access(reload).eligible).toBe(false);
  expect(() => choose(reload, 'crew_invite')).not.toThrow(); // consumed original is a harmless duplicate
  expect(crewStatus(reload.snapshot(), 'kyo_regulars')).toBe('left');
  expect(choose(reload, 'crew_rejoin_invite').status).toBe('duplicate');
  expect(() => joinCrew(reload.snapshot(), reload.snapshot().crews.kyo_regulars)).toThrow('unavailable');
 });
 it('requires explicit departure before future crew membership and rejects multi-member saves', () => {
  const session = new SocialSession(SOCIAL_CONTENT, qualified());
  choose(session, 'crew_invite'); choose(session, 'crew_accept');
  const state = session.snapshot();
  const other: CrewStanding = { ...initialCrew('future_crew'), introduced: true, invitation: 'invited' as const };
  state.crews.future_crew = other;
  const before = JSON.stringify(state);
  expect(() => joinCrew(state, other)).toThrow('explicitly');
  expect(JSON.stringify(state)).toBe(before);
  const content = { ...SOCIAL_CONTENT, crews: [...SOCIAL_CONTENT.crews, { ...SOCIAL_CONTENT.crews[0], id: 'future_crew' }] };
  other.membership = 'member'; other.invitation = 'accepted'; other.joins = 1;
  expect(() => restoreSocialState(state, content)).toThrow('Only one active');
 });
 it.each(['none', 'invited', 'member'])('migrates legacy %s membership without deleting event history', membership => {
  const old = { ...qualified(), version: 3, crews: { kyo_regulars: { crewId: 'kyo_regulars', points: 7, membership } } };
  const migrated = new SocialSession(SOCIAL_CONTENT, old).snapshot();
  expect(migrated.version).toBe(4);
  expect(migrated.crews.kyo_regulars).toMatchObject({ points: 7, introduced: true, invitation: membership === 'member' ? 'accepted' : membership === 'invited' ? 'invited' : 'none', membership: membership === 'member' ? 'member' : 'none' });
  expect(migrated.appliedEvents).toEqual(old.appliedEvents);
 });
 it('commits membership and its ledger atomically when storage fails', () => {
  const session = new SocialSession(SOCIAL_CONTENT, qualified()); choose(session, 'crew_invite');
  const blocked = new SocialSession(SOCIAL_CONTENT, session.snapshot(), () => { throw new Error('disk full'); });
  const before = blocked.snapshot();
  expect(() => choose(blocked, 'crew_accept')).toThrow('disk full');
  expect(blocked.snapshot()).toEqual(before);
 });
});
