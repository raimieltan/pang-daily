import { FIRST_RIVAL, rivalHistory, type RivalOutcome } from './rivalHistory';
import type { SocialContent, SocialState } from './contract';
import { getReputationProgress, REPUTATION_CONFIG, type ReputationTier } from './reputation';

export type DialogueCondition =
 | { all: readonly DialogueCondition[] }
 | { any: readonly DialogueCondition[] }
 | { npcId: string; introduced?: boolean; trustAtLeast?: number; trustAtMost?: number; respectAtLeast?: number; respectAtMost?: number; flag?: string; notFlag?: string }
 | { reputationTier: ReputationTier }
 | { crewId: string; standingAtLeast?: number; membership?: 'none' | 'invited' | 'member' }
 | { favorId: string; favorStatus: 'none' | 'offered' | 'accepted' | 'completed' | 'failed' | 'abandoned' }
 | { rivalId: string; hasOutcome: 'any' | RivalOutcome }
 | { raceId: string; raceResult: 'finished' | 'won' }
 | { unlockId: string; unlocked: boolean };

export type DialogueEffect =
 | { kind: 'socialChoice'; choiceId: 'promise_help' | 'apologize' | 'congratulate_casey' | 'insult_casey' }
 | { kind: 'favorOffer'; favorId: string }
 | { kind: 'crewInvitation'; crewId: string }
 | { kind: 'crewAcceptance'; crewId: string }
 | { kind: 'unlock'; unlockId: string };
export type DialogueChoice = { id: string; text: string; when?: DialogueCondition; effect?: DialogueEffect; nextNodeId?: string; once?: boolean };
export type DialogueNode = { id: string; speakerId: string; text: string; reactions?: Record<RivalOutcome | 'firstLoss', string>; choices: readonly DialogueChoice[] };
export type ConversationDefinition = { id: string; npcId: string; branches: readonly { nodeId: string; when: DialogueCondition }[]; fallbackNodeId: string; nodes: readonly DialogueNode[] };
export type ConversationView = { dialogueId: string; node: DialogueNode; choices: readonly DialogueChoice[] };

/** Stable authored nodes. Every graph has an unconditional fallback and an exit-capable node. */
export const CONVERSATIONS: readonly ConversationDefinition[] = [
 { id: 'talyer_mang_boy', npcId: 'mang_boy', fallbackNodeId: 'mang_familiar', branches: [
  { nodeId: 'mang_first', when: { npcId: 'mang_boy', introduced: false } },
  { nodeId: 'mang_low_trust', when: { npcId: 'mang_boy', trustAtMost: 35 } },
 ], nodes: [
  { id: 'mang_first', speakerId: 'mang_boy', text: 'Bag-o ka diri? Sige, tan-awon ta ang daily mo. May gamay nga bulig ko unta.', choices: [
   { id: 'promise_help', text: 'Sige, Mang Boy. Ako na bahala sa oil run.', when: { favorId: 'mang_boy_parts_help', favorStatus: 'none' }, effect: { kind: 'socialChoice', choiceId: 'promise_help' }, once: true, nextNodeId: 'mang_familiar' },
  ] },
  { id: 'mang_low_trust', speakerId: 'mang_boy', text: 'Ginpaabot ta ka. Indi lang ni parts; salig man ni.', choices: [
   { id: 'apologize', text: 'Pasensya gid. Bawi ako sa trabaho.', when: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'failed' }, { favorId: 'mang_boy_parts_help', favorStatus: 'abandoned' }] }, effect: { kind: 'socialChoice', choiceId: 'apologize' }, once: true },
   { id: 'offer_recovery', text: 'May lain pa ko nga mabuligan?', when: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'failed' }, { favorId: 'mang_boy_parts_help', favorStatus: 'abandoned' }] }, effect: { kind: 'favorOffer', favorId: 'mang_boy_recovery' }, once: true },
  ] },
  { id: 'mang_familiar', speakerId: 'mang_boy', text: 'Kumusta ang daily? Ari lang ko kung may kinahanglan ka.', choices: [
   { id: 'ask_favor', text: 'May maubra ko para sa talyer?', when: { favorId: 'mang_boy_parts_help', favorStatus: 'offered' }, nextNodeId: 'mang_favor' },
   { id: 'unlock_favor', text: 'Balikan ko ang oil errand.', when: { npcId: 'mang_boy', introduced: true }, effect: { kind: 'unlock', unlockId: 'talyer_favor' }, once: true },
  ] },
  { id: 'mang_favor', speakerId: 'mang_boy', text: 'Sa board ang detalye. Dal-a ang 20W-50 diri, ha.', choices: [] },
 ] },
 { id: 'casey_intro', npcId: 'casey', fallbackNodeId: 'casey_familiar', branches: [
  { nodeId: 'casey_low_trust', when: { npcId: 'casey', trustAtMost: 25 } },
  { nodeId: 'casey_post_race', when: { rivalId: 'casey', hasOutcome: 'any' } },
  { nodeId: 'casey_first', when: { npcId: 'casey', introduced: false } },
  { nodeId: 'casey_post_race', when: { raceId: 'pahuway_descent', raceResult: 'finished' } },
 ], nodes: [
  { id: 'casey_first', speakerId: 'casey', text: 'Ikaw ang may daily? Kitaay ta sa Pahuway. Dahan-dahan sa liko, ha.', choices: [] },
  { id: 'casey_familiar', speakerId: 'casey', text: 'Ara ka naman. Kumusta ang andar sang daily?', choices: [] },
  { id: 'casey_low_trust', speakerId: 'casey', text: 'Kung mag-istorya ta, tarong lang. Wala ko gana sa hambog.', choices: [] },
  { id: 'casey_post_race', speakerId: 'casey', text: 'Maayo nga run. May masunod pa gid na sa dalan.', reactions: {
   win: 'Maayo nga run. Ginlampuwasan mo ko! Kitaay ta gihapon sa Kyo; indi pa tapos ang aton istorya.',
   loss: 'Ako anay subong. Indi kabalaka, may next run pa. Kitaay ta sa north street.',
   firstLoss: 'First loss lang na, pre. Sige, try lang liwat. Walay entry fee; pwede kita mag-rematch sa north street bisan subong.',
   dnf: 'Wala mo natapos? Okay lang. I-check anay ang daily. Ari lang ko sa Kyo; balikan ta ang north street kung ready ka.',
  }, choices: [
   { id: 'congratulate_casey', text: 'Maayo ka magdala, Casey.', when: { all: [{ rivalId: 'casey', hasOutcome: 'any' }, { npcId: 'casey', notFlag: 'trusted_friend' }, { npcId: 'casey', notFlag: 'hostile' }] }, effect: { kind: 'socialChoice', choiceId: 'congratulate_casey' }, once: true },
   { id: 'insult_casey', text: 'Tsamba lang to. Sunod, wala ka na.', when: { all: [{ rivalId: 'casey', hasOutcome: 'any' }, { npcId: 'casey', notFlag: 'trusted_friend' }, { npcId: 'casey', notFlag: 'hostile' }] }, effect: { kind: 'socialChoice', choiceId: 'insult_casey' }, once: true },
   { id: 'crew_accept', text: 'Sige, join ako sa Kyo Regulars.', when: { all: [{ crewId: 'kyo_regulars', membership: 'invited' }, { unlockId: 'kyo_crew_invitation', unlocked: true }, { npcId: 'casey', trustAtLeast: 50, respectAtLeast: 55, flag: 'trusted_friend' }, { reputationTier: 'Regular' }] }, effect: { kind: 'crewAcceptance', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_invite', text: 'Tambay ako sa Kyo kasama ninyo?', when: { all: [{ npcId: 'casey', flag: 'trusted_friend', respectAtLeast: 55 }, { reputationTier: 'Regular' }] }, effect: { kind: 'crewInvitation', crewId: 'kyo_regulars' }, once: true },
   { id: 'casey_rematch_info', text: 'Diin kita mag-rematch?', nextNodeId: 'casey_rematch' },
  ] },
  { id: 'casey_rematch', speakerId: 'casey', text: 'Sa north street ang Barangay sprint. Balik sa daily mo, drive sa start line kag pili-a Race Casey. Wala entry fee; same Casey, same puti nga Kidlat.', choices: [{ id: 'casey_back_to_tambay', text: 'Sige. Istorya anay kita.', nextNodeId: 'casey_post_race' }] },
 ] },
 { id: 'kyo_order', npcId: 'kyo_barista', fallbackNodeId: 'kyo_familiar', branches: [{ nodeId: 'kyo_first', when: { npcId: 'kyo_barista', introduced: false } }], nodes: [
  { id: 'kyo_first', speakerId: 'kyo_barista', text: 'Kape anay? Park ka lang, boss. Diri lang ang mga regular.', choices: [] },
  { id: 'kyo_familiar', speakerId: 'kyo_barista', text: 'Balik ka gali. Same nga kape?', choices: [] },
 ] },
 { id: 'seller_jun_surplus', npcId: 'jun_surplus', fallbackNodeId: 'jun_familiar', branches: [{ nodeId: 'jun_first', when: { npcId: 'jun_surplus', introduced: false } }], nodes: [
  { id: 'jun_first', speakerId: 'jun_surplus', text: 'May piyesa ako diri. Tan-awa anay antes ka magbayad.', choices: [] },
  { id: 'jun_familiar', speakerId: 'jun_surplus', text: 'Salamat, boss. Message lang kung may kinahanglan ka.', choices: [] },
 ] },
];

export function evaluateDialogueCondition(condition: DialogueCondition, state: SocialState): boolean {
 if ('all' in condition) return condition.all.every((item) => evaluateDialogueCondition(item, state));
 if ('any' in condition) return condition.any.some((item) => evaluateDialogueCondition(item, state));
 if ('npcId' in condition) {
  const npc = state.npcs[condition.npcId];
  return !!npc && (condition.introduced === undefined || npc.introduced === condition.introduced)
   && (condition.trustAtLeast === undefined || npc.trust >= condition.trustAtLeast)
   && (condition.trustAtMost === undefined || npc.trust <= condition.trustAtMost)
   && (condition.respectAtLeast === undefined || npc.respect >= condition.respectAtLeast)
   && (condition.respectAtMost === undefined || npc.respect <= condition.respectAtMost)
   && (!condition.flag || npc.relationshipFlags.includes(condition.flag))
   && (!condition.notFlag || !npc.relationshipFlags.includes(condition.notFlag));
 }
 if ('reputationTier' in condition) return getReputationProgress(state).points >= REPUTATION_CONFIG.tiers.find((item) => item.name === condition.reputationTier)!.minimum;
 if ('crewId' in condition) { const crew = state.crews[condition.crewId]; return (condition.standingAtLeast === undefined || (crew?.points ?? 0) >= condition.standingAtLeast) && (condition.membership === undefined || (crew?.membership ?? 'none') === condition.membership); }
 if ('favorId' in condition) return (state.favors[condition.favorId]?.status ?? 'none') === condition.favorStatus;
 if ('rivalId' in condition) { const history = rivalHistory(state); return condition.rivalId === FIRST_RIVAL.npcId && (condition.hasOutcome === 'any' ? history.latestOutcome !== null : history.latestOutcome === condition.hasOutcome); }
 if ('raceId' in condition) return state.appliedEvents.some((event) => event.type === 'race' && event.contextId === condition.raceId && (!raceDnf(event.fingerprint)) && (condition.raceResult === 'finished' || racePosition(event.fingerprint) === 1));
 return (state.unlocks[condition.unlockId]?.unlocked ?? false) === condition.unlocked;
}

export function dialogueNodeText(node: DialogueNode, state: SocialState): string {
 if (!node.reactions) return node.text;
 const history = rivalHistory(state);
 const latest = history.latestOutcome;
 return latest ? node.reactions[latest === 'loss' && history.losses === 1 ? 'firstLoss' : latest] : node.text;
}

export function resolveConversation(dialogueId: string, state: SocialState, definitions: readonly ConversationDefinition[] = CONVERSATIONS): ConversationView {
 const definition = definitions.find((item) => item.id === dialogueId);
 if (!definition) throw new Error(`unknown conversation: ${dialogueId}`);
 const nodeId = definition.branches.find((branch) => evaluateDialogueCondition(branch.when, state))?.nodeId ?? definition.fallbackNodeId;
 const node = definition.nodes.find((item) => item.id === nodeId);
 if (!node) throw new Error(`missing dialogue node: ${nodeId}`);
 return { dialogueId, node: { ...node, text: dialogueNodeText(node, state) }, choices: node.choices.filter((choice) => (!choice.when || evaluateDialogueCondition(choice.when, state)) && (!choice.once || !state.appliedEvents.some((event) => event.eventId === `conversation:${dialogueId}:${choice.id}`))) };
}

function raceDnf(fingerprint: string): boolean { try { return JSON.parse(fingerprint).outcome === 'dnf'; } catch { return false; } }

function racePosition(fingerprint: string): number | null { try { const parsed = JSON.parse(fingerprint) as { position?: number }; return parsed.position ?? null; } catch { return null; } }

export function validateConversations(definitions: readonly ConversationDefinition[], content: SocialContent): string[] {
 const errors: string[] = [];
 const ids = new Set<string>();
 const checkCondition = (condition: DialogueCondition): void => {
  if ('all' in condition) { if (!condition.all.length) errors.push('empty all condition'); condition.all.forEach(checkCondition); return; }
  if ('any' in condition) { if (!condition.any.length) errors.push('empty any condition'); condition.any.forEach(checkCondition); return; }
  if ('npcId' in condition) { if (!content.npcs.some((item) => item.id === condition.npcId)) errors.push(`unknown condition NPC: ${condition.npcId}`); for (const flag of [condition.flag, condition.notFlag]) if (flag && !content.relationshipFlags.some((item) => item.id === flag && item.npcId === condition.npcId)) errors.push(`unknown condition flag: ${flag}`); return; }
  if ('reputationTier' in condition) { if (!REPUTATION_CONFIG.tiers.some((item) => item.name === condition.reputationTier)) errors.push(`unknown reputation tier: ${condition.reputationTier}`); return; }
  if ('crewId' in condition) { if (!content.crews.some((item) => item.id === condition.crewId)) errors.push(`unknown condition crew: ${condition.crewId}`); return; }
  if ('favorId' in condition) { if (!content.favors.some((item) => item.id === condition.favorId)) errors.push(`unknown condition favor: ${condition.favorId}`); return; }
  if ('rivalId' in condition) { if (condition.rivalId !== FIRST_RIVAL.npcId) errors.push(`unknown rival: ${condition.rivalId}`); return; }
  if ('raceId' in condition) { if (!(condition.raceId in REPUTATION_CONFIG.races)) errors.push(`unknown condition race: ${condition.raceId}`); return; }
  if ('unlockId' in condition && !content.unlocks.some((item) => item.id === condition.unlockId)) errors.push(`unknown condition unlock: ${condition.unlockId}`);
 };
 for (const definition of definitions) {
  if (ids.has(definition.id)) errors.push(`duplicate conversation: ${definition.id}`); ids.add(definition.id);
  if (!content.npcs.some((npc) => npc.id === definition.npcId && npc.dialogueEntryId === definition.id)) errors.push(`unknown conversation NPC: ${definition.npcId}`);
  const nodes = new Set<string>(); const choices = new Set<string>();
  for (const node of definition.nodes) { if (nodes.has(node.id)) errors.push(`duplicate dialogue node: ${node.id}`); nodes.add(node.id); }
  if (!nodes.has(definition.fallbackNodeId)) errors.push(`missing fallback node: ${definition.fallbackNodeId}`);
  for (const branch of definition.branches) { if (!nodes.has(branch.nodeId)) errors.push(`missing branch node: ${branch.nodeId}`); checkCondition(branch.when); }
  for (const node of definition.nodes) {
   if (!content.npcs.some((npc) => npc.id === node.speakerId)) errors.push(`unknown speaker: ${node.speakerId}`);
   if (!node.text.trim()) errors.push(`empty dialogue node: ${node.id}`);
   for (const choice of node.choices) {
    if (!choice.id.trim() || !choice.text.trim()) errors.push(`empty dialogue choice: ${choice.id}`);
    if (choices.has(choice.id)) errors.push(`duplicate dialogue choice: ${choice.id}`); choices.add(choice.id);
    if (choice.nextNodeId && !nodes.has(choice.nextNodeId)) errors.push(`missing next node: ${choice.nextNodeId}`);
    if (choice.when) checkCondition(choice.when);
    const effect = choice.effect;
    if (effect && !choice.once) errors.push(`effect must be one-shot: ${choice.id}`);
    if (effect?.kind === 'socialChoice' && ((effect.choiceId === 'promise_help' || effect.choiceId === 'apologize') ? definition.npcId !== 'mang_boy' : definition.npcId !== 'casey')) errors.push(`invalid social choice target: ${effect.choiceId}`);
    if (effect?.kind === 'favorOffer' && !content.favors.some((item) => item.id === effect.favorId && item.npcId === definition.npcId)) errors.push(`unknown effect favor: ${effect.favorId}`);
    if ((effect?.kind === 'crewInvitation' || effect?.kind === 'crewAcceptance') && !content.crews.some((item) => item.id === effect.crewId)) errors.push(`unknown effect crew: ${effect.crewId}`);
    if (effect?.kind === 'unlock' && !content.unlocks.some((item) => item.id === effect.unlockId)) errors.push(`unknown effect unlock: ${effect.unlockId}`);
   }
  }
 }
 return errors;
}
