import type { CrewDefinition, CrewStanding, SocialState } from './contract';

/** M3 tuning, not story canon. Friendship never requires crew membership. */
export const CREWS: readonly CrewDefinition[] = [{
 id: 'kyo_regulars', name: 'Kyo Regulars', homeLocationId: 'coffee_shop',
 subculture: 'Daily-driver grip and coffee tambay',
 description: 'Old daily drivers, shared road knowledge, and coffee after a clean run. A car-culture circle, not a combat gang; friends from other crews are welcome.',
 memberNpcIds: ['casey'], introductionContactId: 'casey',
 invitationOpportunityId: 'kyo_crew_invitation', membershipOpportunityIds: ['kyo_midnight_run'], rejoinPolicy: 'once',
 invitationCriteria: [
  { text: 'Become Casey’s trusted friend with 55 respect', condition: { npcId: 'casey', flag: 'trusted_friend', trustAtLeast: 50, respectAtLeast: 55 } },
  { text: 'Reach Regular reputation', condition: { reputationTier: 'Regular' } },
  { text: 'Keep Kyo crew standing at least zero', condition: { crewId: 'kyo_regulars', standingAtLeast: 0 } },
 ],
}];
export const initialCrew = (crewId: string): CrewStanding => ({ crewId, points: 0, introduced: false, invitation: 'none', membership: 'none', joins: 0 });
export function crewStatus(state: SocialState, id: string): 'undiscovered' | 'introduced' | 'invited' | 'member' | 'declined' | 'left' {
 const crew = state.crews[id];
 if (!crew?.introduced) return 'undiscovered';
 if (crew.membership === 'member') return 'member';
 if (crew.invitation === 'invited') return 'invited';
 if (crew.membership === 'left') return 'left';
 return crew.invitation === 'declined' ? 'declined' : 'introduced';
}
export function joinCrew(state: SocialState, crew: CrewStanding): void {
 const active = Object.values(state.crews).find(item => item.membership === 'member' && item.crewId !== crew.crewId);
 if (active) throw new Error(`Leave ${active.crewId} explicitly before joining another crew`);
 if (crew.invitation !== 'invited' || crew.membership === 'member' || crew.joins >= 2) throw new Error('Crew acceptance unavailable');
 crew.membership = 'member'; crew.invitation = 'accepted'; crew.joins++;
}
