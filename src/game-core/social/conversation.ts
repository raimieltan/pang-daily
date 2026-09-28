import { crewStatus } from './crews';
import { FIRST_RIVAL, rivalHistory, type RivalOutcome } from './rivalHistory';
import type { SocialContent, SocialState } from './contract';
import { getReputationProgress, REPUTATION_CONFIG, type ReputationTier } from './reputation';

export type DialogueCondition =
 | { all: readonly DialogueCondition[] }
 | { any: readonly DialogueCondition[] }
 | { npcId: string; introduced?: boolean; trustAtLeast?: number; trustAtMost?: number; respectAtLeast?: number; respectAtMost?: number; flag?: string; notFlag?: string }
 | { reputationTier: ReputationTier }
 | { crewId: string; standingAtLeast?: number; membership?: 'none' | 'invited' | 'member' | 'left'; status?: ReturnType<typeof crewStatus>; joins?: number }
 | { favorId: string; favorStatus: 'none' | 'offered' | 'accepted' | 'completed' | 'failed' | 'abandoned' }
 | { rivalId: string; hasOutcome: 'any' | RivalOutcome }
 | { raceId: string; raceResult: 'finished' | 'won' }
 | { unlockId: string; unlocked: boolean };

export type DialogueEffect =
 | { kind: 'standing'; npcId: string; trust: number; respect: number; unlockId: string; introduceNpcIds: readonly string[] }
 | { kind: 'socialChoice'; choiceId: 'promise_help' | 'apologize' | 'congratulate_casey' | 'insult_casey' | 'introduce_mang_boy' }
 | { kind: 'favorOffer'; favorId: string }
 | { kind: 'crewInvitation'; crewId: string }
 | { kind: 'crewAcceptance'; crewId: string }
 | { kind: 'crewDecline' | 'crewLeave'; crewId: string }
 | { kind: 'unlock'; unlockId: string };
export type DialogueChoice = { id: string; text: string; when?: DialogueCondition; effect?: DialogueEffect; nextNodeId?: string; once?: boolean };
export type DialogueNode = { id: string; speakerId: string; text: string; reactions?: Record<RivalOutcome | 'firstLoss', string>; choices: readonly DialogueChoice[] };
export type ConversationDefinition = { id: string; npcId: string; branches: readonly { nodeId: string; when: DialogueCondition }[]; fallbackNodeId: string; nodes: readonly DialogueNode[] };
export type ConversationView = { dialogueId: string; node: DialogueNode; choices: readonly DialogueChoice[] };

/** Stable authored nodes. Every graph has an unconditional fallback and an exit-capable node. */
export const CONVERSATIONS: readonly ConversationDefinition[] = [
 { id: 'talyer_mang_boy', npcId: 'mang_boy', fallbackNodeId: 'mang_familiar', branches: [
  { nodeId: 'mang_setback', when: { all: [{ npcId: 'mang_boy', flag: 'brake_setback' }, { npcId: 'kyo_barista', notFlag: 'daily_recovered' }] } },
  { nodeId: 'mang_referred', when: { all: [{ npcId: 'mang_boy', introduced: false }, { npcId: 'kyo_barista', flag: 'introduced_mang_boy' }] } },
  { nodeId: 'mang_first', when: { npcId: 'mang_boy', introduced: false } },
  { nodeId: 'mang_repaired', when: { favorId: 'mang_boy_recovery', favorStatus: 'completed' } },
  { nodeId: 'mang_low_trust', when: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'failed' }, { favorId: 'mang_boy_parts_help', favorStatus: 'abandoned' }, { npcId: 'mang_boy', trustAtMost: 35 }] } },
  { nodeId: 'mang_helped', when: { favorId: 'mang_boy_parts_help', favorStatus: 'completed' } },
 ], nodes: [
  { id: 'mang_setback', speakerId: 'mang_boy', text: 'The old brake system gave out under load. The bill is real; buying wheels will not fix it. You can earn more on the oil errand, or spend only on the brakes and keep the rest for your build.', choices: [{ id: 'recovery_work', text: 'Work first. Keep my cash reserve; spend more time.', nextNodeId: 'mang_favor' }, { id: 'recovery_budget', text: 'Repair only the brakes. Delay the other work.', nextNodeId: 'mang_budget' }] },
  { id: 'mang_budget', speakerId: 'mang_boy', text: 'At the repair panel, select only Brakes. That clears the urgent problem; engine, tires and suspension still keep their existing wear. Repairing more costs more. The oil errand is always there if you are short.', choices: [] },
  { id: 'mang_first', speakerId: 'mang_boy', text: 'Bag-o ka diri? Your old brake system pulls under load. Repair the brakes before buying wheels; the talyer panel has the quote. Pick up oil & coolant for me to earn ₱300. You can walk it if the tank is empty.', choices: [
   { id: 'promise_help', text: 'Sige, Tito Jun. Ako na bahala sa oil run.', when: { favorId: 'mang_boy_parts_help', favorStatus: 'none' }, effect: { kind: 'socialChoice', choiceId: 'promise_help' }, once: true, nextNodeId: 'mang_familiar' },
  ] },
  { id: 'mang_referred', speakerId: 'mang_boy', text: 'Kyo sent you? Your brakes need work. Check the repair quote at the bay. My oil & coolant errand pays ₱300, even on foot.', choices: [
   { id: 'promise_help_referred', text: 'Sige, Tito Jun. Ako na bahala sa oil run.', when: { favorId: 'mang_boy_parts_help', favorStatus: 'none' }, effect: { kind: 'socialChoice', choiceId: 'promise_help' }, once: true, nextNodeId: 'mang_familiar' },
  ] },
  { id: 'mang_low_trust', speakerId: 'mang_boy', text: 'Ginpaabot ta ka. Indi lang ni parts; salig man ni.', choices: [
   { id: 'apologize', text: 'Pasensya gid. Bawi ako sa trabaho.', when: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'failed' }, { favorId: 'mang_boy_parts_help', favorStatus: 'abandoned' }] }, effect: { kind: 'socialChoice', choiceId: 'apologize' }, once: true },
   { id: 'offer_recovery', text: 'May lain pa ko nga mabuligan?', when: { any: [{ favorId: 'mang_boy_parts_help', favorStatus: 'failed' }, { favorId: 'mang_boy_parts_help', favorStatus: 'abandoned' }] }, effect: { kind: 'favorOffer', favorId: 'mang_boy_recovery' }, once: true },
  ] },
  { id: 'mang_helped', speakerId: 'mang_boy', text: 'Salamat gid sa oil run. Stop by KYO Coffee east of here; Sean, Michael and Casey hang out there. The oil errand stays on the board if you need more cash.', choices: [] },
  { id: 'mang_repaired', speakerId: 'mang_boy', text: 'Nakita ko nga nagbawi ka. Sige, balik ta sa pag-ayo sang daily mo.', choices: [] },
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
  { id: 'casey_first', speakerId: 'casey', text: 'Sean says you helped the talyer. One easy run? Barangay sprint on the north street. No entry fee. First to the end; finish even if I get ahead.', choices: [] },
  { id: 'casey_familiar', speakerId: 'casey', text: 'Ara ka naman. Kumusta ang andar sang daily?', choices: [{ id: 'crew_info_familiar', text: 'Tell me about Kyo Regulars.', nextNodeId: 'kyo_crew' }] },
  { id: 'casey_low_trust', speakerId: 'casey', text: 'Kung mag-istorya ta, tarong lang. Wala ko gana sa hambog.', choices: [{ id: 'crew_info_low', text: 'Talk about my crew status.', nextNodeId: 'kyo_crew' }] },
  { id: 'casey_post_race', speakerId: 'casey', text: 'Maayo nga run. May masunod pa gid na sa dalan.', reactions: {
   win: 'Maayo nga run. Ginlampuwasan mo ko! Kitaay ta gihapon sa Kyo; indi pa tapos ang aton istorya.',
   loss: 'Ako anay subong. Indi kabalaka, may next run pa. Kitaay ta sa north street.',
   firstLoss: 'First loss lang na, pre. Sige, try lang liwat. Walay entry fee; pwede kita mag-rematch sa north street bisan subong.',
   dnf: 'Wala mo natapos? Okay lang. I-check anay ang daily. Ari lang ko sa Kyo; balikan ta ang north street kung ready ka.',
  }, choices: [
   { id: 'congratulate_casey', text: 'Maayo ka magdala, Casey.', when: { all: [{ rivalId: 'casey', hasOutcome: 'any' }, { npcId: 'casey', notFlag: 'trusted_friend' }, { npcId: 'casey', notFlag: 'hostile' }] }, effect: { kind: 'socialChoice', choiceId: 'congratulate_casey' }, once: true },
   { id: 'insult_casey', text: 'Tsamba lang to. Sunod, wala ka na.', when: { all: [{ rivalId: 'casey', hasOutcome: 'any' }, { npcId: 'casey', notFlag: 'trusted_friend' }, { npcId: 'casey', notFlag: 'hostile' }] }, effect: { kind: 'socialChoice', choiceId: 'insult_casey' }, once: true },
   { id: 'crew_info', text: 'Tell me about Kyo Regulars.', nextNodeId: 'kyo_crew' },
   { id: 'casey_rematch_info', text: 'Diin kita mag-rematch?', nextNodeId: 'casey_rematch' },
  ] },
  { id: 'kyo_crew', speakerId: 'casey', text: 'Kyo Regulars: old daily drivers, grip runs kag kape. Friends from any crew are welcome. Members can run the Midnight Run from the Kyo exit. Declining changes no friendships. After leaving, you can ask to rejoin once; a second leave is final for now.', choices: [
   { id: 'crew_invite', text: 'Can I join Kyo Regulars?', when: { crewId: 'kyo_regulars', status: 'introduced' }, effect: { kind: 'crewInvitation', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_accept', text: 'Sige, join ako sa Kyo Regulars.', when: { all: [{ crewId: 'kyo_regulars', status: 'invited', joins: 0 }, { npcId: 'casey', trustAtLeast: 50, respectAtLeast: 55, flag: 'trusted_friend' }, { reputationTier: 'Regular' }] }, effect: { kind: 'crewAcceptance', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_decline', text: 'Pass anay. Friends gihapon.', when: { crewId: 'kyo_regulars', status: 'invited', joins: 0 }, effect: { kind: 'crewDecline', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_reconsider', text: 'I changed my mind. Can I join?', when: { crewId: 'kyo_regulars', status: 'declined', joins: 0 }, effect: { kind: 'crewInvitation', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_leave', text: 'I want to leave Kyo Regulars.', when: { crewId: 'kyo_regulars', status: 'member', joins: 1 }, effect: { kind: 'crewLeave', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_rejoin_invite', text: 'Can I rejoin? I understand this is my one return.', when: { crewId: 'kyo_regulars', status: 'left', joins: 1 }, effect: { kind: 'crewInvitation', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_rejoin', text: 'Yes, rejoin Kyo Regulars.', when: { crewId: 'kyo_regulars', status: 'invited', joins: 1 }, effect: { kind: 'crewAcceptance', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_rejoin_decline', text: 'I will stay independent.', when: { crewId: 'kyo_regulars', status: 'invited', joins: 1 }, effect: { kind: 'crewDecline', crewId: 'kyo_regulars' }, once: true },
   { id: 'crew_leave_again', text: 'Leave again. I understand I cannot rejoin again for now.', when: { crewId: 'kyo_regulars', status: 'member', joins: 2 }, effect: { kind: 'crewLeave', crewId: 'kyo_regulars' }, once: true },
  ] },
  { id: 'casey_rematch', speakerId: 'casey', text: 'Sa north street ang Barangay sprint. Balik sa daily mo, drive sa start line kag pili-a Race Casey. Wala entry fee; same Casey, same puti nga Kidlat.', choices: [{ id: 'casey_back_to_tambay', text: 'Sige. Istorya anay kita.', nextNodeId: 'casey_post_race' }] },
 ] },
 { id: 'kyo_order', npcId: 'kyo_barista', fallbackNodeId: 'kyo_familiar', branches: [{ nodeId: 'kyo_regular', when: { unlockId: 'chapter_1_recognition', unlocked: true } }, { nodeId: 'kyo_recognition', when: { npcId: 'kyo_barista', flag: 'daily_recovered' } }, { nodeId: 'kyo_scene', when: { all: [{ npcId: 'kyo_barista', introduced: true }, { unlockId: 'met_kyo_regulars', unlocked: false }] } }, { nodeId: 'kyo_first', when: { npcId: 'kyo_barista', introduced: false } }, { nodeId: 'kyo_referred', when: { npcId: 'kyo_barista', flag: 'introduced_mang_boy' } }], nodes: [
  { id: 'kyo_scene', speakerId: 'sean', text: 'Uy, the old daily! I’m Sean. This is Michael; he spots every bad part. Casey is outside. Park beside us.', choices: [{ id: 'hear_michael', text: 'Michael, what should I fix first?', nextNodeId: 'kyo_advice' }, { id: 'talk_builds', text: 'Sean, tell me about your builds.', effect: { kind: 'standing', npcId: 'sean', trust: 3, respect: 0, unlockId: 'met_kyo_regulars', introduceNpcIds: ['sean', 'michael'] }, once: true, nextNodeId: 'kyo_invitation' }] },
  { id: 'kyo_advice', speakerId: 'michael', text: 'Brakes before wheels. The old system can still fail under load after a quick service. Keep money for it. Caring for the daily earns more respect than loud parts.', choices: [{ id: 'listen_michael', text: 'I’ll put the brakes before the build.', effect: { kind: 'standing', npcId: 'michael', trust: 0, respect: 4, unlockId: 'met_kyo_regulars', introduceNpcIds: ['sean', 'michael'] }, once: true, nextNodeId: 'kyo_invitation' }] },
  { id: 'kyo_invitation', speakerId: 'sean', text: 'You’re welcome here. Talk to Casey outside about the north-street run.', choices: [] },
  { id: 'kyo_recognition', speakerId: 'sean', text: 'Uy, you got the daily running again. Michael noticed the brakes. Nobody had to invite you tonight. We saved you a parking spot.', choices: [{ id: 'take_parking', text: 'Park with the regulars.', effect: { kind: 'unlock', unlockId: 'chapter_1_recognition' }, once: true, nextNodeId: 'kyo_regular' }] },
  { id: 'kyo_regular', speakerId: 'kyo_barista', text: 'Same coffee? Your spot is beside Sean. You’re a regular now. More roads and builds can wait; tonight, just tambay.', choices: [] },
  { id: 'kyo_first', speakerId: 'kyo_barista', text: 'Kape anay? Park ka lang, boss. Diri lang ang mga regular.', choices: [{ id: 'meet_kyo', text: 'Salamat. Ano pangalan mo?', nextNodeId: 'kyo_familiar' }] },
  { id: 'kyo_familiar', speakerId: 'kyo_barista', text: 'Balik ka gali. Same nga kape? Kumusta ang daily mo?', choices: [{ id: 'meet_regulars', text: 'Who’s parked outside?', when: { unlockId: 'met_kyo_regulars', unlocked: false }, nextNodeId: 'kyo_scene' }, { id: 'introduce_mang_boy', text: 'May kilala ka nga mekaniko?', effect: { kind: 'socialChoice', choiceId: 'introduce_mang_boy' }, once: true }] },
  { id: 'kyo_referred', speakerId: 'kyo_barista', text: 'Nakita mo na si Tito Jun sa talyer? Maayo na siya magtan-aw sang old daily.', choices: [] },
 ] },
 { id: 'seller_jun_surplus', npcId: 'jun_surplus', fallbackNodeId: 'jun_familiar', branches: [{ nodeId: 'jun_first', when: { npcId: 'jun_surplus', introduced: false } }, { nodeId: 'jun_offer', when: { all: [{ npcId: 'jun_surplus', trustAtLeast: 52 }, { reputationTier: 'Regular' }] } }], nodes: [
  { id: 'jun_first', speakerId: 'jun_surplus', text: 'May piyesa ako diri. Tan-awa anay antes ka magbayad.', choices: [] },
  { id: 'jun_familiar', speakerId: 'jun_surplus', text: 'Salamat, boss. Message lang kung may kinahanglan ka.', choices: [] },
  { id: 'jun_offer', speakerId: 'jun_surplus', text: 'Suki ka na diri. May bawas sa piyesa kung may makita ka nga bagay sa daily mo.', choices: [] },
 ] },
 { id: 'sean_tambay', npcId: 'sean', fallbackNodeId: 'sean_familiar', branches: [], nodes: [{ id: 'sean_familiar', speakerId: 'sean', text: 'Ara ka naman! Park beside us. There is always another parts lead.', choices: [] }] },
 { id: 'michael_tambay', npcId: 'michael', fallbackNodeId: 'michael_familiar', branches: [], nodes: [{ id: 'michael_familiar', speakerId: 'michael', text: 'Brakes first. Wheels later. Let the car tell you what it needs.', choices: [] }] },
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
 if ('crewId' in condition) { const crew = state.crews[condition.crewId]; return (condition.standingAtLeast === undefined || (crew?.points ?? 0) >= condition.standingAtLeast) && (condition.membership === undefined || (condition.membership === 'invited' ? crew?.invitation === 'invited' : (crew?.membership ?? 'none') === condition.membership)) && (condition.status === undefined || crewStatus(state, condition.crewId) === condition.status) && (condition.joins === undefined || (crew?.joins ?? 0) === condition.joins); }
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
   if (effect?.kind === 'socialChoice' && (effect.choiceId === 'introduce_mang_boy' ? definition.npcId !== 'kyo_barista' : (effect.choiceId === 'promise_help' || effect.choiceId === 'apologize') ? definition.npcId !== 'mang_boy' : definition.npcId !== 'casey')) errors.push(`invalid social choice target: ${effect.choiceId}`);
    if (effect?.kind === 'standing' && (!content.npcs.some(npc => npc.id === effect.npcId) || !content.unlocks.some(unlock => unlock.id === effect.unlockId) || effect.introduceNpcIds.some(id => !content.npcs.some(npc => npc.id === id)) || !Number.isSafeInteger(effect.trust) || Math.abs(effect.trust) > 100 || !Number.isSafeInteger(effect.respect) || Math.abs(effect.respect) > 100)) errors.push(`invalid standing effect: ${choice.id}`);
    if (effect?.kind === 'favorOffer' && !content.favors.some((item) => item.id === effect.favorId && item.npcId === definition.npcId)) errors.push(`unknown effect favor: ${effect.favorId}`);
    if ((effect?.kind === 'crewInvitation' || effect?.kind === 'crewAcceptance' || effect?.kind === 'crewDecline' || effect?.kind === 'crewLeave') && !content.crews.some((item) => item.id === effect.crewId)) errors.push(`unknown effect crew: ${effect.crewId}`);
    if (effect?.kind === 'unlock' && !content.unlocks.some((item) => item.id === effect.unlockId)) errors.push(`unknown effect unlock: ${effect.unlockId}`);
   }
  }
 }
 return errors;
}
