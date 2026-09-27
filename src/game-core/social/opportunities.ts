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
 { id: 'kyo_crew_invitation', name: 'Kyo Regulars crew invitation', lossBehavior: 'suspend', benefit: { kind: 'crew', crewId: 'kyo_regulars' }, requirements: [
  { text: 'Become Casey’s trusted friend with 55 respect', condition: { npcId: 'casey', flag: 'trusted_friend', trustAtLeast: 50, respectAtLeast: 55 } },
  { text: 'Reach Regular reputation', condition: { reputationTier: 'Regular' } },
  { text: 'Keep Kyo crew standing at least zero', condition: { crewId: 'kyo_regulars', standingAtLeast: 0 } },
 ] },
];
export const opportunity = (id: string): OpportunityRule => {
 const rule = SOCIAL_OPPORTUNITIES.find(item => item.id === id);
 if (!rule) throw new Error(`Unknown social opportunity: ${id}`);
 return rule;
};
