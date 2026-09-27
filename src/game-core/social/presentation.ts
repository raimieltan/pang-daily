import { SOCIAL_CONTENT } from './catalog';
import type { SocialContent, SocialState } from './contract';
import { crewStatus } from './crews';
import { evaluateEligibility } from './eligibility';
import { SOCIAL_OPPORTUNITIES } from './opportunities';
import { getReputationProgress } from './reputation';

/** Authored public copy. Never project raw flags, fingerprints or marketplace data. */
const LOCATIONS: Record<string, string> = { coffee_shop: 'Kyo coffee shop', talyer: 'Mang Boy’s talyer', marketplace: 'Phone · Baligya' };
const FAVORS: Record<string, string> = { mang_boy_parts_help: 'Oil errand for Mang Boy', mang_boy_recovery: 'Battery delivery to make amends' };
const EVENTS: Record<string, string> = { raced_casey: 'Shared a race with Casey', beat_casey: 'Won a race against Casey', lost_to_casey: 'Finished behind Casey', casey_shared_dnf: 'A shared race ended without a finish', met_at_talyer: 'Met at the talyer', met_casey_at_kyo: 'Met Casey at Kyo', helped_mang_boy: 'Completed Mang Boy’s errand', broke_mang_boy_commitment: 'An errand commitment fell through', made_amends_mang_boy: 'Made amends with a follow-up delivery' };
const OPPORTUNITY_COPY: Record<string, { npcId: string; hint: string; location: string }> = {
 casey_wall_invitation: { npcId: 'casey', hint: 'A future race invitation', location: 'Talk to Casey at Kyo' },
 jun_suki_offer: { npcId: 'jun_surplus', hint: 'A regular-customer opportunity', location: 'Check Jun’s listings in Baligya; purchases build trust' },
 mang_boy_service: { npcId: 'mang_boy', hint: 'A mechanic relationship benefit', location: 'Talk to Mang Boy at the talyer; take his errand from the job board' },
 kyo_crew_invitation: { npcId: 'casey', hint: 'Joining the Kyo circle', location: 'Talk to Casey about Kyo Regulars' },
 kyo_midnight_run: { npcId: 'casey', hint: 'A members’ run', location: 'Talk to Casey about membership, then visit Kyo exit' },
};
export function socialView(state: SocialState, content: SocialContent = SOCIAL_CONTENT) {
 const contacts = content.npcs.filter(npc => state.npcs[npc.id]?.introduced).map(npc => {
  const standing = state.npcs[npc.id];
  const unfriendly = standing.trust < 45 || standing.relationshipFlags.includes('hostile');
  const trust = unfriendly ? 'Unfriendly · trust needs rebuilding' : standing.trust >= 60 || standing.relationshipFlags.includes('trusted_friend') ? 'Trusts you' : 'Getting to know you';
  const respect = standing.respect >= 55 ? 'Respects your driving and contributions' : standing.respect < 40 ? 'Respect needs rebuilding' : 'Respect is still growing';
  const history = state.appliedEvents.filter(event => event.targetId === npc.id).map(event => event.reason);
  const lastEvent = history.at(-1) ?? EVENTS[standing.eventIds.at(-1) ?? ''] ?? 'You have been introduced; no shared events yet.';
  const favors = Object.values(state.favors).filter(favor => favor.npcId === npc.id && favor.status !== 'completed' && !content.favors.some(definition => definition.recoveryFor === favor.favorId && state.favors[definition.id]?.status === 'completed')).map(favor => ({ id: favor.favorId, name: FAVORS[favor.favorId] ?? 'A shared favor', status: favor.status, nextStep: favor.status === 'failed' || favor.status === 'abandoned' ? 'Talk at the talyer about making amends.' : favor.status === 'accepted' ? 'Finish the accepted job; follow its tracker.' : 'Take the errand from the talyer job board.' }));
  return { id: npc.id, name: npc.name, roles: npc.roles.map(role => role.replaceAll('_', ' ')), summary: `${trust}. ${respect}.`, trust: standing.trust, respect: standing.respect, location: LOCATIONS[npc.homeLocationId] ?? 'Ask them where to meet', lastEvent, history: history.slice(-8).reverse(), favors };
 });
 const crews = content.crews.filter(crew => state.crews[crew.id]?.introduced).map(crew => ({ id: crew.id, name: crew.name, description: crew.description, standing: state.crews[crew.id].points, status: crewStatus(state, crew.id), membership: state.crews[crew.id].membership, invitation: state.crews[crew.id].invitation, location: LOCATIONS[crew.homeLocationId] ?? 'Ask your contact' }));
 const opportunities = SOCIAL_OPPORTUNITIES.flatMap(rule => {
  const copy = OPPORTUNITY_COPY[rule.id];
  if (!copy || !state.npcs[copy.npcId]?.introduced) return [];
  if (rule.benefit.kind === 'crew' && !state.crews[rule.benefit.crewId]?.introduced) return [];
  if (rule.id === 'kyo_midnight_run' && !state.crews.kyo_regulars?.introduced) return [];
  const access = evaluateEligibility(rule, state);
  return [{ id: rule.id, name: access.discovered ? rule.name : copy.hint, available: access.eligible, discovered: access.discovered, requirements: access.unmetRequirements, nextStep: copy.location }];
 });
 return { contacts, crews, opportunities, reputation: getReputationProgress(state) };
}
export type SocialView = ReturnType<typeof socialView>;
export type SocialNotice = { id: string; lines: string[] };
const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;
/** One bounded batch per observed action; reload establishes a baseline, never replays history. */
export function socialChanges(before: SocialState, after: SocialState): SocialNotice[] {
 const seen = new Set(before.appliedEvents.map(event => event.eventId));
 const groups = new Map<string, Set<string>>();
 const add = (id: string, line: string) => { if (!groups.has(id)) groups.set(id, new Set()); groups.get(id)!.add(line); };
 for (const event of after.appliedEvents.filter(event => !seen.has(event.eventId))) {
  const id = event.type === 'conversation' ? event.eventId : event.sourceId;
  for (const effect of event.effects) {
   const npc = SOCIAL_CONTENT.npcs.find(npc => npc.id === effect.npcId);
   if (!npc || !after.npcs[npc.id]?.introduced) continue;
   const changes = [effect.trustDelta ? `trust ${signed(effect.trustDelta)}` : '', effect.respectDelta ? `respect ${signed(effect.respectDelta)}` : ''].filter(Boolean);
   add(id, `${npc.name}: ${changes.length ? changes.join(', ') + ' — ' : ''}${event.reason}`);
  }
  if (event.reputation?.pointsDelta) add(id, `Iloilo car scene: ${signed(event.reputation.pointsDelta)} recognition — ${event.reason}${event.reputation.fromTier !== event.reputation.toTier ? ` · now ${event.reputation.toTier}` : ''}`);
 }
 for (const crew of SOCIAL_CONTENT.crews) {
  const old = before.crews[crew.id], next = after.crews[crew.id];
  if (next?.introduced && (old?.points ?? 0) !== next.points) {
   const event = after.appliedEvents.filter(event => !seen.has(event.eventId)).at(-1);
   add(event?.sourceId ?? `crew:${crew.id}`, `${crew.name}: standing ${signed(next.points - (old?.points ?? 0))} — ${event?.reason ?? 'Crew standing changed'}`);
  }
 }
 const visible = new Set(socialView(after).opportunities.map(item => item.id));
 const discoveries = SOCIAL_OPPORTUNITIES.filter(rule => visible.has(rule.id) && after.unlocks[rule.id]?.unlocked && !before.unlocks[rule.id]?.unlocked);
 const last = [...groups.keys()].at(-1) ?? 'opportunities';
 for (const rule of discoveries) add(last, `Discovered: ${rule.name}`);
 return [...groups].map(([id, lines]) => ({ id, lines: [...lines] }));
}
