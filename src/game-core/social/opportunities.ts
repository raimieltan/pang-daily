import { CREWS } from './crews';
import type { OpportunityRule } from './eligibility';

export const SOCIAL_OPPORTUNITIES: readonly OpportunityRule[] = [
 { id: 'casey_wall_invitation', name: 'Casey’s invitation: The wall', lossBehavior: 'retain', benefit: { kind: 'race', raceId: 'the_wall' }, requirements: [
  { text: 'Meet Casey at Kyo', condition: { eventId: 'met_casey_at_kyo', npcId: 'casey' } },
  { text: 'Reach Regular reputation', condition: { reputationTier: 'Regular' } },
 ] },
 { id: 'jun_suki_offer', name: 'Jun’s suki part offer · 10% off', lossBehavior: 'suspend', benefit: { kind: 'seller', sellerId: 'jun_surplus', discountPercent: 10 }, requirements: [
  { text: 'Earn Jun’s trust: 52', condition: { npcId: 'jun_surplus', trustAtLeast: 52 } },
  { text: 'Reach Regular reputation', condition: { reputationTier: 'Regular' } },
 ] },
 { id: 'mang_boy_service', name: 'Mang Boy’s repair benefit · 10% off', lossBehavior: 'suspend', benefit: { kind: 'repair', discountPercent: 10 }, requirements: [
  { text: 'Earn Mang Boy’s trust: 58', condition: { npcId: 'mang_boy', trustAtLeast: 58 } },
  { text: 'Help Mang Boy or make amends', condition: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'completed' }, { favorId: 'mang_boy_recovery', favorStatus: 'completed' }] } },
 ] },
 ...CREWS.map(crew => ({ id: crew.invitationOpportunityId, name: `${crew.name} crew invitation`, lossBehavior: 'suspend' as const, benefit: { kind: 'crew' as const, crewId: crew.id }, requirements: crew.invitationCriteria })),
 { id: 'kyo_midnight_run', name: 'Kyo Regulars Midnight Run', lossBehavior: 'suspend', benefit: { kind: 'race', raceId: 'midnight_run' }, requirements: [
  { text: 'Join Kyo Regulars', condition: { crewId: 'kyo_regulars', membership: 'member' } },
 ] },
];
export const opportunity = (id: string): OpportunityRule => {
 const rule = SOCIAL_OPPORTUNITIES.find(item => item.id === id);
 if (!rule) throw new Error(`Unknown social opportunity: ${id}`);
 return rule;
};
