import { NPC_CAR_BUILDS } from '../exterior/npcBuilds';
import type { SocialContent } from './contract';
import { DIALOGUE_ENTRIES } from './dialogue';
import { SOCIAL_OPPORTUNITIES } from './opportunities';
import { CREWS } from './crews';
import { SELLERS } from '../marketplace/sellers';

/** Authored identities and stable references from the hub, dialogue, and race content. */
export const SOCIAL_CONTENT: SocialContent = {
 npcs: [
  { id: 'mang_boy', name: 'Mang Boy', roles: ['mechanic', 'mentor'], homeInteractionId: 'talyer_bay_1', homeLocationId: 'talyer', dialogueEntryId: 'talyer_mang_boy' },
  { id: 'casey', name: 'Casey', roles: ['rival'], homeInteractionId: 'casey_corner', homeLocationId: 'coffee_shop', dialogueEntryId: 'casey_intro', crewId: 'kyo_regulars', vehicleBuildId: 'casey_kidlat_rs' },
  { id: 'kyo_barista', name: 'Kyo Barista', roles: ['friend', 'seller'], homeInteractionId: 'kyo_counter', homeLocationId: 'coffee_shop', dialogueEntryId: 'kyo_order' },
  { id: 'jun_surplus', name: 'Jun Surplus Parts', roles: ['seller'], homeInteractionId: 'marketplace:seller:jun_surplus', homeLocationId: 'marketplace', dialogueEntryId: 'seller_jun_surplus' },
 ],
 crews: CREWS,
 scenes: [{ id: 'iloilo_scene', name: 'Iloilo car scene' }],
 events: [
  ...['raced_casey', 'beat_casey', 'lost_to_casey', 'casey_shared_dnf'].map(id => ({ id, npcIds: ['casey'], sceneId: 'iloilo_scene' })),
  { id: 'met_at_talyer', npcIds: ['mang_boy'], sceneId: 'iloilo_scene' },
  { id: 'met_kyo_barista', npcIds: ['kyo_barista'], sceneId: 'iloilo_scene' },
  { id: 'met_casey_at_kyo', npcIds: ['casey'], sceneId: 'iloilo_scene' },
  { id: 'helped_mang_boy', npcIds: ['mang_boy'], sceneId: 'iloilo_scene' },
  { id: 'broke_mang_boy_commitment', npcIds: ['mang_boy'], sceneId: 'iloilo_scene' },
  { id: 'made_amends_mang_boy', npcIds: ['mang_boy'], sceneId: 'iloilo_scene' },
 ],
 favors: [
  { id: 'mang_boy_parts_help', npcId: 'mang_boy', jobId: 'talyer_oil_errand' },
  { id: 'mang_boy_recovery', npcId: 'mang_boy', jobId: 'talyer_battery_drop', recoveryFor: 'mang_boy_parts_help' },
 ],
 relationshipFlags: [
  { id: 'rival', npcId: 'casey' },
  { id: 'trusted_friend', npcId: 'casey', establishes: 'friend' },
  { id: 'hostile', npcId: 'casey', establishes: 'hostile' },
  { id: 'mentorship_offered', npcId: 'mang_boy', establishes: 'mentor' },
  { id: 'promised_help', npcId: 'mang_boy' },
  { id: 'apology_offered', npcId: 'mang_boy' },
  { id: 'introduced_mang_boy', npcId: 'kyo_barista', establishes: 'friend' },
 ],
 unlocks: [{ id: 'talyer_favor', sourceEventId: 'met_at_talyer' }, ...SOCIAL_OPPORTUNITIES.map(rule => ({ id: rule.id, sourceEventId: rule.benefit.kind === 'race' || rule.benefit.kind === 'crew' ? 'met_casey_at_kyo' : 'met_at_talyer' }))],
 references: {
  interactionIds: ['talyer_bay_1', 'casey_corner', 'kyo_counter', 'marketplace:seller:jun_surplus'],
  locationIds: ['talyer', 'coffee_shop', 'marketplace'],
  dialogueIds: Object.keys(DIALOGUE_ENTRIES),
  vehicleBuildIds: Object.keys(NPC_CAR_BUILDS),
  jobIds: ['talyer_oil_errand', 'talyer_battery_drop'],
  sellerIds: SELLERS.map((seller) => seller.id),
 },
};

/** Checks every content table before a session can be created. */
export function validateSocialContent(content: SocialContent): string[] {
 const errors: string[] = [];
 const ids = <T extends { readonly id: string }>(kind: string, items: readonly T[]) => {
  const seen = new Set<string>();
  for (const item of items) {
   if (!item.id.trim() || seen.has(item.id)) errors.push(`duplicate or empty ${kind} ID: ${item.id}`);
   seen.add(item.id);
  }
  return seen;
 };
 const npcs = ids('NPC', content.npcs);
 const crews = ids('crew', content.crews);
 const scenes = ids('scene', content.scenes);
 const events = ids('event', content.events);
 ids('favor', content.favors);
 ids('relationship flag', content.relationshipFlags);
 ids('unlock', content.unlocks);
 const refs = content.references;
 const check = (kind: string, id: string, choices: readonly string[] | Set<string>) => {
  if (!(choices instanceof Set ? choices.has(id) : choices.includes(id))) errors.push(`unknown ${kind} reference: ${id}`);
 };
 for (const npc of content.npcs) {
  check('interaction', npc.homeInteractionId, refs.interactionIds);
  check('location', npc.homeLocationId, refs.locationIds);
  check('dialogue', npc.dialogueEntryId, refs.dialogueIds);
  if (npc.crewId) check('crew', npc.crewId, crews);
  if (npc.vehicleBuildId) check('vehicle build', npc.vehicleBuildId, refs.vehicleBuildIds);
  const validRoles = ['friend', 'rival', 'mechanic', 'seller', 'mentor', 'hostile_contact'];
  if (!npc.roles.length || new Set(npc.roles).size !== npc.roles.length || npc.roles.some((role) => !validRoles.includes(role))) errors.push(`invalid roles for NPC: ${npc.id}`);
 }
 for (const crew of content.crews) {
  check('location', crew.homeLocationId, refs.locationIds);
  check('NPC', crew.introductionContactId, npcs);
  for (const member of crew.memberNpcIds) check('NPC', member, npcs);
  if (!crew.name.trim() || !crew.description.trim() || !crew.subculture.trim() || !crew.memberNpcIds.includes(crew.introductionContactId) || crew.rejoinPolicy !== 'once') errors.push(`invalid crew definition: ${crew.id}`);
  for (const id of crew.membershipOpportunityIds) if (!SOCIAL_OPPORTUNITIES.some(item => item.id === id && item.lossBehavior === 'suspend')) errors.push(`invalid crew member opportunity: ${id}`);
  const rule = SOCIAL_OPPORTUNITIES.find(item => item.id === crew.invitationOpportunityId);
  if (!rule || rule.benefit.kind !== 'crew' || rule.benefit.crewId !== crew.id || JSON.stringify(rule.requirements) !== JSON.stringify(crew.invitationCriteria)) errors.push(`invalid crew invitation: ${crew.id}`);
 }
 for (const event of content.events) {
  check('scene', event.sceneId, scenes);
  for (const npcId of event.npcIds) check('NPC', npcId, npcs);
  if (event.crewId) check('crew', event.crewId, crews);
 }
 for (const favor of content.favors) {
  check('NPC', favor.npcId, npcs);
  check('job', favor.jobId, refs.jobIds);
  if (favor.recoveryFor && !content.favors.some((candidate) => candidate.id === favor.recoveryFor)) errors.push(`unknown favor reference: ${favor.recoveryFor}`);
 }
 for (const flag of content.relationshipFlags) check('NPC', flag.npcId, npcs);
 for (const unlock of content.unlocks) check('event', unlock.sourceEventId, events);
 return errors;
}
