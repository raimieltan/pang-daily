import { initialCrew, joinCrew } from './crews';
import { FIRST_RIVAL, rivalHistory } from './rivalHistory';
import { SOCIAL_RACE_CHECKPOINTS, validateRaceOutcome } from './raceOutcomes';
import { evaluateEligibility } from './eligibility';
import { SOCIAL_OPPORTUNITIES, opportunity } from './opportunities';
import { validateSocialContent } from './catalog';
import { STANDING_DEFAULT, STANDING_MAX, STANDING_MIN, type AppliedSocialEvent, type NpcSocialState, type SocialContent, type SocialEventEffect, type SocialState } from './contract';
import { SOCIAL_MARKETPLACE_SELLERS, SOCIAL_RACE_RIVALS, SOCIAL_REPEAT_LIMITS, SOCIAL_RULES, type SocialEventInput } from './rules';
import { SERVICE_COMPONENTS } from '../maintenance/condition';
import { clampReputation, configuredReputationAward, getReputationProgress, REPUTATION_CONFIG, type ReputationTier } from './reputation';
import { CONVERSATIONS, evaluateDialogueCondition, validateConversations } from './conversation';

type ApplyResult = { status: 'applied' | 'duplicate' | 'ignored'; record?: AppliedSocialEvent; tierChange?: { sceneId: string; from: ReputationTier; to: ReputationTier; points: number } };
type Reward = { readonly trust: number; readonly respect: number; readonly reason: string; readonly flag?: string };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const initialNpc = (): NpcSocialState => ({ introduced: false, trust: STANDING_DEFAULT, respect: STANDING_DEFAULT, relationshipFlags: [], favorIds: [], eventIds: [] });
const requireId = (value: string, label: string) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid ${label}`); };
const requireInteger = (value: number, label: string) => { if (!Number.isSafeInteger(value)) throw new Error(`invalid ${label}`); };
const clamp = (value: number) => Math.max(STANDING_MIN, Math.min(STANDING_MAX, value));
const addUnique = (items: string[], id: string) => { if (!items.includes(id)) items.push(id); };

export function createSocialState(content?: SocialContent): SocialState {
 return { version: 4, npcs: Object.fromEntries((content?.npcs ?? []).map((npc) => [npc.id, initialNpc()])), favors: {}, appliedEvents: [], reputation: {}, reputationRewards: {}, crews: {}, unlocks: {} };
}

/** The sole gameplay mutation path: authored rules select all effects, then one snapshot is persisted and committed. */
export class SocialSession {
 private state: SocialState;

 constructor(readonly content: SocialContent, saved?: unknown, private readonly persist?: (next: SocialState) => void) {
  const errors = validateSocialContent(content);
  errors.push(...validateConversations(CONVERSATIONS, content));
  if (errors.length) throw new Error(`invalid social content: ${errors.join('; ')}`);
  this.state = saved == null ? createSocialState(content) : restoreSocialState(saved, content);
 }

 discoverOpportunities(): { id: string; name: string }[] {
  const next = copy(this.state);
  const discovered = SOCIAL_OPPORTUNITIES.filter(rule => !next.unlocks[rule.id]?.unlocked && evaluateEligibility(rule, next).eligible);
  if (!discovered.length) return [];
  for (const rule of discovered) next.unlocks[rule.id] = { unlockId: rule.id, unlocked: true };
  this.persist?.(copy(next)); this.state = next;
  return discovered.map(({ id, name }) => ({ id, name }));
 }

 recoverInterruptedRaces(): void {
  for (const attempt of rivalHistory(this.state).attempts.filter(item => item.outcome === 'started')) {
   this.applyEvent({ type: 'race', eventId: `race:${attempt.attemptId}:interrupted`, sourceId: attempt.attemptId, attemptId: attempt.attemptId, npcId: attempt.npcId, raceId: attempt.raceId, vehicleId: attempt.vehicleId, outcome: 'dnf', position: 2, racers: 2, timeMs: 0,
    validation: { completedCheckpoints: 0, totalCheckpoints: SOCIAL_RACE_CHECKPOINTS[attempt.raceId], finishValidated: false, invalidFinish: false } });
  }
 }

 snapshot(): SocialState { return copy(this.state); }

 relationships(npcId: string): { friend: boolean; hostile: boolean; mentor: boolean } {
  this.requireNpc(npcId);
  const flags = this.state.npcs[npcId].relationshipFlags;
  const has = (kind: 'friend' | 'hostile' | 'mentor') => this.content.relationshipFlags.some((flag) => flag.npcId === npcId && flag.establishes === kind && flags.includes(flag.id));
  return { friend: has('friend'), hostile: has('hostile'), mentor: has('mentor') };
 }

 /** Resolves an authored choice against fresh state and commits its effect and consumption together. */
 chooseConversation(dialogueId: string, nodeId: string, choiceId: string): ApplyResult {
  const definition = CONVERSATIONS.find((item) => item.id === dialogueId);
  const node = definition?.nodes.find((item) => item.id === nodeId);
  const choice = node?.choices.find((item) => item.id === choiceId);
  if (!definition || !node || !choice) throw new Error(`unknown dialogue choice: ${dialogueId}:${nodeId}:${choiceId}`);
  const eventId = `conversation:${dialogueId}:${choiceId}`;
  const prior = this.state.appliedEvents.find((item) => item.eventId === eventId);
  if (prior && (choice.effect || choice.once)) return { status: 'duplicate', record: copy(prior) };
  if (choice.when && !evaluateDialogueCondition(choice.when, this.state)) throw new Error('unavailable dialogue choice');
  if (choice.once && this.state.appliedEvents.some((item) => item.eventId === eventId)) throw new Error('unavailable dialogue choice');
  const next = copy(this.state);
  const definitionNpcId = definition.npcId;
  const npc = next.npcs[definition.npcId];
  if (!npc?.introduced) throw new Error('unavailable dialogue choice');
  if (!choice.effect && !choice.once) {
   return { status: 'applied', record: { eventId, sourceId: dialogueId, sourceKey: eventId, fingerprint: JSON.stringify({ dialogueId, nodeId, choiceId }), type: 'conversation', targetId: definition.npcId, contextId: nodeId, reason: 'Conversation continued', effects: [] } };
  }
  let reward: Reward = { trust: 0, respect: 0, reason: 'Conversation continued' };
  const flagsAdded: string[] = [];
  const effect = choice.effect;
  if (effect?.kind === 'socialChoice') {
   reward = SOCIAL_RULES.dialogue[effect.choiceId];
   if (effect.choiceId === 'promise_help') {
    if (next.favors.mang_boy_parts_help) throw new Error('unavailable dialogue choice');
    next.favors.mang_boy_parts_help = { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'offered', runId: null };
    addUnique(npc.favorIds, 'mang_boy_parts_help');
   } else if (effect.choiceId === 'apologize') {
    if (!['failed', 'abandoned'].includes(next.favors.mang_boy_parts_help?.status ?? '')) throw new Error('unavailable dialogue choice');
   } else if (effect.choiceId !== 'introduce_mang_boy' && (!next.appliedEvents.some((item) => item.type === 'race' && item.targetId === definition.npcId) || npc.relationshipFlags.includes('trusted_friend') || npc.relationshipFlags.includes('hostile'))) throw new Error('unavailable dialogue choice');
   if (reward.flag) { addUnique(npc.relationshipFlags, reward.flag); flagsAdded.push(reward.flag); }
  } else if (effect?.kind === 'favorOffer') {
   const favor = this.content.favors.find((item) => item.id === effect.favorId && item.npcId === definition.npcId);
   if (!favor || next.favors[favor.id] || (favor.recoveryFor && !['failed', 'abandoned'].includes(next.favors[favor.recoveryFor]?.status ?? ''))) throw new Error('unavailable dialogue choice');
   next.favors[favor.id] = { favorId: favor.id, npcId: favor.npcId, status: 'offered', runId: null };
   addUnique(npc.favorIds, favor.id);
   reward = { trust: 0, respect: 0, reason: 'Follow-up favor offered' };
  } else if (effect && ['crewInvitation', 'crewAcceptance', 'crewDecline', 'crewLeave'].includes(effect.kind) && 'crewId' in effect) {
   const definition = this.content.crews.find(item => item.id === effect.crewId);
   if (!definition || definition.introductionContactId !== definitionNpcId) throw new Error('unavailable crew contact');
   const crew = next.crews[effect.crewId] ??= initialCrew(effect.crewId);
   if (effect.kind === 'crewInvitation' || effect.kind === 'crewAcceptance') {
    const access = evaluateEligibility(opportunity(definition.invitationOpportunityId), next);
    if (!crew.introduced || !access.eligible) throw new Error(`Crew invitation unavailable: ${access.unmetRequirements.join('; ')}`);
    next.unlocks[definition.invitationOpportunityId] = { unlockId: definition.invitationOpportunityId, unlocked: true };
   }
   if (effect.kind === 'crewInvitation') {
    if (crew.membership === 'member' || crew.invitation === 'invited' || crew.joins >= 2) throw new Error('Crew invitation unavailable');
    crew.invitation = 'invited'; reward = { trust: 0, respect: 0, reason: `Invitation from ${definition.name}` };
   } else if (effect.kind === 'crewAcceptance') {
    joinCrew(next, crew);
    reward = { trust: 0, respect: 0, reason: `Joined ${definition.name}` };
    for (const id of definition.membershipOpportunityIds) {
     const rule = opportunity(id);
     if (evaluateEligibility(rule, next).eligible) next.unlocks[id] = { unlockId: id, unlocked: true };
    }
   } else if (effect.kind === 'crewDecline') {
    if (crew.invitation !== 'invited') throw new Error('Crew invitation unavailable');
    crew.invitation = 'declined'; reward = { trust: 0, respect: 0, reason: `Declined ${definition.name}` };
   } else {
    if (crew.membership !== 'member') throw new Error('Crew leave unavailable');
    crew.membership = 'left'; reward = { trust: 0, respect: 0, reason: `Left ${definition.name}` };
   }
  } else if (effect?.kind === 'standing') {
   const target = next.npcs[effect.npcId];
   if (!target || next.unlocks[effect.unlockId]?.unlocked) throw new Error('unavailable dialogue choice');
   for (const id of effect.introduceNpcIds) next.npcs[id].introduced = true;
   target.trust = clamp(target.trust + effect.trust); target.respect = clamp(target.respect + effect.respect);
   next.unlocks[effect.unlockId] = { unlockId: effect.unlockId, unlocked: true };
   reward = { trust: 0, respect: 0, reason: `Got to know ${effect.npcId} at KYO` };
  } else if (effect?.kind === 'unlock') {
   if (!this.content.unlocks.some((item) => item.id === effect.unlockId)) throw new Error('unavailable dialogue choice');
   next.unlocks[effect.unlockId] = { unlockId: effect.unlockId, unlocked: true };
   reward = { trust: 0, respect: 0, reason: 'Social opportunity unlocked' };
  }
  const trust = clamp(npc.trust + reward.trust), respect = clamp(npc.respect + reward.respect);
  const record: AppliedSocialEvent = { eventId, sourceId: dialogueId, sourceKey: eventId, fingerprint: JSON.stringify({ dialogueId, nodeId, choiceId }), type: 'conversation', targetId: definition.npcId, contextId: nodeId, reason: reward.reason, effects: [{ npcId: definition.npcId, trustDelta: trust - npc.trust, respectDelta: respect - npc.respect, flagsAdded, flagsRemoved: [] }] };
  if (effect?.kind === 'standing') record.effects.push({ npcId: effect.npcId, trustDelta: next.npcs[effect.npcId].trust - this.state.npcs[effect.npcId].trust, respectDelta: next.npcs[effect.npcId].respect - this.state.npcs[effect.npcId].respect, flagsAdded: [], flagsRemoved: [] });
  npc.trust = trust; npc.respect = respect;
  next.appliedEvents.push(record);
  this.persist?.(copy(next));
  this.state = next;
  return { status: 'applied', record: copy(record) };
 }

 applyEvent(event: SocialEventInput): ApplyResult {
  requireId(event.eventId, 'event ID'); requireId(event.sourceId, 'source ID');
  const npcId = 'npcId' in event ? event.npcId : undefined;
  if (npcId) this.requireNpc(npcId);
  const sourceKey = this.sourceKey(event);
  const fingerprint = JSON.stringify({ ...event, eventId: undefined });
  const priorId = this.state.appliedEvents.find((item) => item.eventId === event.eventId);
  if (priorId) {
   if (priorId.sourceKey !== sourceKey || priorId.fingerprint !== fingerprint) throw new Error(`event ID already used with different outcome: ${event.eventId}`);
   return { status: 'duplicate', record: copy(priorId) };
  }
  const priorSource = this.state.appliedEvents.find((item) => item.sourceKey === sourceKey);
  if (priorSource) {
   if (priorSource.fingerprint !== fingerprint) throw new Error(`source already used with different outcome: ${event.sourceId}`);
   return { status: 'duplicate', record: copy(priorSource) };
  }

  const next = copy(this.state);
  const npc = next.npcs[npcId ?? ''];
  let reward: Reward;
  let contextId: string;
  const added: string[] = [];
  const removed: string[] = [];

  switch (event.type) {
   case 'milestone': {
    if (event.npcId !== (event.milestoneId === 'brake_setback' ? 'mang_boy' : 'kyo_barista') || event.sourceId !== `chapter_1:${event.milestoneId}`) throw new Error('invalid campaign milestone');
    contextId = event.milestoneId;
    reward = { trust: event.milestoneId === 'saved_parking' ? 3 : 0, respect: 0, reason: event.milestoneId === 'saved_parking' ? 'A regular at KYO; parking spot saved' : event.milestoneId === 'brake_setback' ? 'The old brake system failed after the first run' : 'Repaired the daily after the setback', flag: event.milestoneId };
    break;
   }
   case 'dialogue': {
    const definition = this.content.npcs.find((entry) => entry.id === event.npcId)!;
    if (definition.dialogueEntryId !== event.dialogueId) throw new Error(`invalid dialogue for NPC: ${event.dialogueId}`);
    contextId = event.dialogueId;
    if (!event.choiceId) {
     if (npc.introduced) return { status: 'ignored' };
     npc.introduced = true;
     for (const crew of this.content.crews.filter(item => item.introductionContactId === event.npcId)) {
      const standing = next.crews[crew.id] ??= initialCrew(crew.id); standing.introduced = true;
     }
     const meeting = this.content.events.find((item) => item.npcIds.includes(event.npcId) && item.id.startsWith('met_'));
     if (meeting) addUnique(npc.eventIds, meeting.id);
     reward = SOCIAL_RULES.dialogue.introduction;
    } else {
     if (!npc.introduced) throw new Error('dialogue choice requires introduction');
     if (event.npcId === 'casey') {
      if (!next.appliedEvents.some((item) => item.type === 'race' && item.targetId === 'casey')) throw new Error('Casey choice requires a valid race');
      if (npc.relationshipFlags.includes('trusted_friend') || npc.relationshipFlags.includes('hostile')) throw new Error('Casey relationship already settled');
      if (event.choiceId === 'congratulate_casey') reward = SOCIAL_RULES.dialogue.congratulate_casey;
      else if (event.choiceId === 'insult_casey') reward = SOCIAL_RULES.dialogue.insult_casey;
      else throw new Error(`invalid dialogue choice: ${event.choiceId}`);
     } else if (event.npcId !== 'mang_boy') throw new Error(`invalid dialogue choice: ${event.choiceId}`);
     else if (event.choiceId === 'promise_help') {
      reward = SOCIAL_RULES.dialogue.promise_help;
      next.favors.mang_boy_parts_help ??= { favorId: 'mang_boy_parts_help', npcId: 'mang_boy', status: 'offered', runId: null };
      addUnique(npc.favorIds, 'mang_boy_parts_help');
     } else if (event.choiceId === 'apologize') {
      if (next.favors.mang_boy_parts_help?.status !== 'failed' && next.favors.mang_boy_parts_help?.status !== 'abandoned') throw new Error('no broken commitment to apologize for');
      reward = SOCIAL_RULES.dialogue.apologize;
     } else throw new Error(`invalid dialogue choice: ${event.choiceId}`);
     if (reward.flag) {
      if (npc.relationshipFlags.includes(reward.flag)) return { status: 'ignored' };
      addUnique(npc.relationshipFlags, reward.flag); added.push(reward.flag);
     }
    }
    break;
   }
   case 'favor': {
    const definition = this.content.favors.find((entry) => entry.id === event.favorId && entry.npcId === event.npcId);
    if (!definition || definition.jobId !== event.jobId) throw new Error(`invalid favor/job reference: ${event.favorId}`);
    contextId = event.favorId;
    const progress = next.favors[event.favorId];
    if (definition.recoveryFor && !['failed', 'abandoned'].includes(next.favors[definition.recoveryFor]?.status ?? '')) throw new Error('follow-up favor requires a broken commitment');
    if (event.phase === 'offered') {
     if (event.dialogueId !== this.content.npcs.find((entry) => entry.id === event.npcId)?.dialogueEntryId || event.runId || event.jobStatus) throw new Error('invalid favor offer context');
     if (progress) return { status: 'ignored' };
     next.favors[event.favorId] = { favorId: event.favorId, npcId: event.npcId, status: 'offered', runId: null };
     addUnique(npc.favorIds, event.favorId);
     reward = SOCIAL_RULES.favor.offered;
    } else {
     requireId(event.runId!, 'job run ID');
     if (!event.runId!.startsWith(`${event.jobId}#`) || event.sourceId !== event.runId) throw new Error('invalid job run source');
     if (event.jobStatus !== event.phase) throw new Error('job outcome does not match favor phase');
     if (progress?.status === 'completed') return { status: 'ignored' };
     if (event.phase === 'accepted') {
      if (progress?.status === 'accepted' && progress.runId === event.runId) return { status: 'ignored' };
      next.favors[event.favorId] = { favorId: event.favorId, npcId: event.npcId, status: 'accepted', runId: event.runId! };
      addUnique(npc.favorIds, event.favorId);
      reward = SOCIAL_RULES.favor.accepted;
     } else {
      if (!progress || progress.status !== 'accepted' || progress.runId !== event.runId) throw new Error('favor outcome has no accepted job run');
      next.favors[event.favorId] = { ...progress, status: event.phase };
      npc.favorIds = npc.favorIds.filter((id) => id !== event.favorId);
      if (event.phase === 'completed') {
       reward = definition.recoveryFor ? SOCIAL_RULES.favor.recovery : SOCIAL_RULES.favor.completed;
       addUnique(npc.eventIds, definition.recoveryFor ? 'made_amends_mang_boy' : 'helped_mang_boy');
      } else {
       reward = SOCIAL_RULES.favor[event.phase];
       addUnique(npc.eventIds, 'broke_mang_boy_commitment');
      }
     }
    }
    break;
   }
   case 'race_attempt': {
    if (event.npcId !== FIRST_RIVAL.npcId || event.vehicleId !== FIRST_RIVAL.vehicleId || !FIRST_RIVAL.raceIds.includes(event.raceId as 'barangay_sprint' | 'pahuway_descent') || event.totalCheckpoints !== SOCIAL_RACE_CHECKPOINTS[event.raceId] || event.sourceId !== event.attemptId) throw new Error('invalid rival race attempt');
    requireId(event.attemptId, 'race attempt ID');
    if (next.appliedEvents.some(item => item.type === 'race' && item.sourceId === event.attemptId)) throw new Error('race attempt already ended');
    contextId = event.raceId;
    if (!npc.relationshipFlags.includes('rival')) { addUnique(npc.relationshipFlags, 'rival'); added.push('rival'); }
    addUnique(npc.eventIds, 'raced_casey');
    reward = { trust: 0, respect: 0, reason: 'Met Casey at the race grid' };
    break;
   }
   case 'race': {
    if (!(event.raceId in REPUTATION_CONFIG.races) || (SOCIAL_RACE_RIVALS[event.raceId] ?? undefined) !== event.npcId || event.sourceId !== event.attemptId) throw new Error('invalid race rival or attempt source');
    const rejection = validateRaceOutcome(event);
    if (rejection) throw new Error(rejection);
    if (event.npcId && event.vehicleId && event.vehicleId !== FIRST_RIVAL.vehicleId) throw new Error('invalid rival vehicle identity');
    const started = next.appliedEvents.find(item => item.type === 'race_attempt' && item.sourceId === event.attemptId);
    if (started && (started.targetId !== event.npcId || started.contextId !== event.raceId)) throw new Error('race result differs from accepted attempt');
    contextId = event.raceId;
    const previous = next.appliedEvents.filter(item => item.type === 'race' && item.targetId === event.npcId && item.contextId === event.raceId && !isRecordedDnf(item.fingerprint)).length;
    reward = event.outcome === 'dnf' ? SOCIAL_RULES.race.dnf : !event.npcId ? { trust: 0, respect: 0, reason: 'Finished valid race' } : previous >= SOCIAL_REPEAT_LIMITS.racePerRoute ? { trust: 0, respect: 0, reason: 'Race reputation limit reached' } : event.position === 1 ? SOCIAL_RULES.race.win : SOCIAL_RULES.race.loss;
    if (npc) {
     if (!npc.relationshipFlags.includes('rival')) { addUnique(npc.relationshipFlags, 'rival'); added.push('rival'); }
     addUnique(npc.eventIds, 'raced_casey');
     addUnique(npc.eventIds, event.outcome === 'dnf' ? 'casey_shared_dnf' : event.position === 1 ? 'beat_casey' : 'lost_to_casey');
    }
    break;
   }
   case 'job': {
    if (!(event.jobId in REPUTATION_CONFIG.jobs) || event.sourceId !== event.runId || !event.runId.startsWith(`${event.jobId}#`) || event.outcome !== 'completed') throw new Error('invalid job result');
    contextId = event.jobId;
    reward = { trust: 0, respect: 0, reason: 'Completed a validated scene job' };
    break;
   }
   case 'service': {
    if (event.npcId !== 'mang_boy' || event.outcome !== 'completed' || event.sourceId !== `${event.serviceId}:${event.transactionId}`) throw new Error('invalid service outcome');
    requireInteger(event.transactionId, 'service transaction ID');
    if (event.transactionId <= 0) throw new Error('invalid service receipt');
    if (event.serviceId === 'repair') {
     requireInteger(event.costPhp, 'repair cost'); requireId(event.vehicleId, 'vehicle ID');
     if (event.costPhp < 0 || !Array.isArray(event.components) || !event.components.length || event.components.some((component) => !SERVICE_COMPONENTS.includes(component as typeof SERVICE_COMPONENTS[number]))) throw new Error('invalid repair receipt');
    } else {
     requireInteger(event.feePhp, 'inspection fee'); requireId(event.itemId, 'item ID');
     if (event.feePhp <= 0) throw new Error('invalid inspection receipt');
    }
    contextId = event.serviceId;
    const previous = next.appliedEvents.filter((item) => item.type === 'service' && item.contextId === event.serviceId && item.targetId === event.npcId && item.reason !== 'Service relationship limit reached').length;
    const limit = event.serviceId === 'repair' ? SOCIAL_REPEAT_LIMITS.repairPerNpc : SOCIAL_REPEAT_LIMITS.inspectionPerNpc;
    reward = previous >= limit ? { trust: 0, respect: 0, reason: 'Service relationship limit reached' } : SOCIAL_RULES.service[event.serviceId];
    break;
   }
   case 'marketplace': {
    if (SOCIAL_MARKETPLACE_SELLERS[event.sellerId] !== event.npcId || event.outcome !== 'purchased' || event.sourceId !== `marketplace:${event.transactionId}`) throw new Error('invalid Marketplace outcome');
    requireId(event.listingId, 'listing ID'); requireInteger(event.transactionId, 'transaction ID');
    if (event.transactionId <= 0) throw new Error('invalid transaction ID');
    contextId = event.sellerId;
    npc.introduced = true;
    const previous = next.appliedEvents.filter((item) => item.type === 'marketplace' && item.targetId === event.npcId && item.reason !== 'Marketplace relationship limit reached').length;
    reward = previous >= SOCIAL_REPEAT_LIMITS.marketplacePerSeller ? { trust: 0, respect: 0, reason: 'Marketplace relationship limit reached' } : SOCIAL_RULES.marketplace.purchased;
    break;
   }
   default: throw new Error('unknown social event type');
  }

  if (npc && reward.flag && !npc.relationshipFlags.includes(reward.flag)) {
   addUnique(npc.relationshipFlags, reward.flag);
   added.push(reward.flag);
  }

  const effects: SocialEventEffect[] = [];
  if (npc && npcId) {
   const oldTrust = this.state.npcs[npcId].trust;
   const oldRespect = this.state.npcs[npcId].respect;
   npc.trust = clamp(oldTrust + reward.trust);
   npc.respect = clamp(oldRespect + reward.respect);
   effects.push({ npcId, trustDelta: npc.trust - oldTrust, respectDelta: npc.respect - oldRespect, flagsAdded: added, flagsRemoved: removed });
  }

  const award = configuredReputationAward(event);
  let reputation: AppliedSocialEvent['reputation'];
  let tierChange: ApplyResult['tierChange'];
  let reason = reward.reason;
  if (award) {
   const before = getReputationProgress(next, award.sceneId);
   const source = next.reputationRewards[award.sourceKey];
   const atLimit = award.points > 0 && (source?.count ?? 0) >= award.limit;
   const points = clampReputation(before.points + (atLimit ? 0 : award.points));
   next.reputation[award.sceneId] = { sceneId: award.sceneId, points };
   if (award.points > 0 && !atLimit) next.reputationRewards[award.sourceKey] = { sourceKey: award.sourceKey, count: (source?.count ?? 0) + 1 };
   const after = getReputationProgress(next, award.sceneId);
   reputation = { sceneId: award.sceneId, sourceKey: award.sourceKey, pointsDelta: points - before.points, fromTier: before.tier, toTier: after.tier };
   if (atLimit) reason += '; scene reward limit reached';
   if (before.tier !== after.tier) tierChange = { sceneId: award.sceneId, from: before.tier, to: after.tier, points };
  }
  const record: AppliedSocialEvent = { eventId: event.eventId, sourceId: event.sourceId, sourceKey, fingerprint, type: event.type, targetId: npcId ?? award?.sceneId ?? REPUTATION_CONFIG.sceneId, contextId, reason, effects, ...(reputation ? { reputation } : {}) };
  next.appliedEvents.push(record);
  this.persist?.(copy(next));
  this.state = next;
  return { status: 'applied', record: copy(record), ...(tierChange ? { tierChange } : {}) };
 }

 private requireNpc(id: string) { if (!this.content.npcs.some((npc) => npc.id === id)) throw new Error(`unknown NPC: ${id}`); }

 private sourceKey(event: SocialEventInput): string {
  switch (event.type) {
   case 'milestone': return `milestone:${event.sourceId}`;
   case 'dialogue': return event.choiceId ? `dialogue-choice:${event.npcId}:${event.choiceId}` : `dialogue:${event.npcId}:${event.dialogueId}`;
   case 'favor': return `favor:${event.sourceId}:${event.phase}`;
   case 'race_attempt': return `race-start:${event.sourceId}`;
   case 'race': return `race:${event.sourceId}`;
   case 'job': return `job:${event.sourceId}`;
   case 'service': return `wallet:${event.transactionId}`;
   case 'marketplace': return `wallet:${event.transactionId}`;
  }
 }
}

/** Older social saves retain standings and event history; recognition counters start empty. */
export function restoreSocialState(input: unknown, content: SocialContent): SocialState {
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid social save');
 const raw = input as Partial<SocialState> & { version: number };
 if (raw.version !== 4 && raw.version !== 3 && raw.version !== 2 && raw.version !== 1) throw new Error('invalid social save version');
 if (!raw.npcs || !raw.reputation || !raw.crews || !raw.unlocks || typeof raw.npcs !== 'object') throw new Error('invalid social save records');
 const state: SocialState = { ...createSocialState(content), ...copy(raw), version: 4, favors: copy(raw.favors ?? {}), appliedEvents: copy(raw.appliedEvents ?? []), reputationRewards: copy(raw.reputationRewards ?? {}) };
 const known = (items: readonly { id: string }[], id: string, kind: string) => { if (!items.some((item) => item.id === id)) throw new Error(`unknown ${kind}: ${id}`); };
 for (const [id, npc] of Object.entries(state.npcs)) {
  known(content.npcs, id, 'NPC');
  if (!npc || typeof npc.introduced !== 'boolean' || !Array.isArray(npc.relationshipFlags) || !Array.isArray(npc.favorIds) || !Array.isArray(npc.eventIds)) throw new Error(`invalid NPC state: ${id}`);
  requireInteger(npc.trust, 'trust'); requireInteger(npc.respect, 'respect');
  if (npc.trust < STANDING_MIN || npc.trust > STANDING_MAX || npc.respect < STANDING_MIN || npc.respect > STANDING_MAX) throw new Error(`invalid standing: ${id}`);
  for (const flagId of npc.relationshipFlags) if (!content.relationshipFlags.some((flag) => flag.id === flagId && flag.npcId === id)) throw new Error(`unknown relationship flag: ${flagId}`);
  for (const favorId of npc.favorIds) if (!content.favors.some((favor) => favor.id === favorId && favor.npcId === id)) throw new Error(`unknown favor: ${favorId}`);
  for (const eventId of npc.eventIds) if (!content.events.some((event) => event.id === eventId && event.npcIds.includes(id))) throw new Error(`unknown social event: ${eventId}`);
 }
 for (const npc of content.npcs) state.npcs[npc.id] ??= initialNpc();
 for (const [id, favor] of Object.entries(state.favors)) {
  const definition = content.favors.find((item) => item.id === id);
  if (!definition || !favor || favor.favorId !== id || favor.npcId !== definition.npcId || !['offered', 'accepted', 'completed', 'failed', 'abandoned'].includes(favor.status)) throw new Error(`invalid favor state: ${id}`);
 }
 if (!Array.isArray(state.appliedEvents)) throw new Error('invalid applied events');
 const eventIds = new Set<string>(), sourceKeys = new Set<string>();
 for (const event of state.appliedEvents) {
  requireId(event.eventId, 'event ID'); requireId(event.sourceId, 'source ID'); requireId(event.sourceKey, 'source key'); requireId(event.fingerprint, 'event fingerprint');
  if (event.targetId !== REPUTATION_CONFIG.sceneId) known(content.npcs, event.targetId, 'NPC');
  if (eventIds.has(event.eventId) || sourceKeys.has(event.sourceKey) || !Array.isArray(event.effects) || typeof event.reason !== 'string') throw new Error(`invalid applied event: ${event.eventId}`);
  eventIds.add(event.eventId); sourceKeys.add(event.sourceKey);
  for (const effect of event.effects) { known(content.npcs, effect.npcId, 'NPC'); requireInteger(effect.trustDelta, 'trust delta'); requireInteger(effect.respectDelta, 'respect delta'); }
  if (event.reputation) { known(content.scenes, event.reputation.sceneId, 'scene'); requireInteger(event.reputation.pointsDelta, 'reputation delta'); }
 }
 for (const [id, record] of Object.entries(state.reputation)) { known(content.scenes, id, 'scene'); if (record.sceneId !== id) throw new Error(`invalid scene reference: ${id}`); requireInteger(record.points, 'reputation'); if (record.points < 0 || record.points > REPUTATION_CONFIG.cap) throw new Error(`invalid reputation points: ${id}`); }
 for (const [key, source] of Object.entries(state.reputationRewards)) {
  const [kind, id, extra] = key.split(':');
  const limits: Record<string, Record<string, { limit: number }>> = { race: REPUTATION_CONFIG.races, job: REPUTATION_CONFIG.jobs, favor: REPUTATION_CONFIG.favors, milestone: REPUTATION_CONFIG.milestones };
  const limit = extra === undefined ? limits[kind]?.[id]?.limit : undefined;
  if (!source || source.sourceKey !== key || limit === undefined) throw new Error(`invalid reputation source: ${key}`);
  requireInteger(source.count, 'reputation reward count');
  if (source.count < 0 || source.count > limit) throw new Error(`invalid reputation reward count: ${key}`);
 }
 for (const [id, record] of Object.entries(state.crews)) {
  known(content.crews, id, 'crew');
  if (raw.version < 4) {
   const legacy = record as unknown as { membership: string };
   record.invitation = legacy.membership === 'invited' ? 'invited' : legacy.membership === 'member' ? 'accepted' : 'none';
   record.joins = legacy.membership === 'member' ? 1 : 0;
   record.introduced = legacy.membership !== 'none' || !!state.npcs[content.crews.find(item => item.id === id)!.introductionContactId]?.introduced;
   if (legacy.membership === 'invited') record.membership = 'none';
  }
  if (record.crewId !== id || !['none', 'member', 'left'].includes(record.membership) || !['none', 'invited', 'accepted', 'declined'].includes(record.invitation) || typeof record.introduced !== 'boolean') throw new Error(`invalid crew state: ${id}`);
  requireInteger(record.points, 'crew standing'); requireInteger(record.joins, 'crew joins');
  if ((!record.introduced && (record.invitation !== 'none' || record.membership !== 'none')) || (record.membership === 'none' && record.joins !== 0) || record.joins < 0 || record.joins > 2 || ((record.membership === 'member' || record.membership === 'left') && record.joins === 0) || (record.membership === 'member' && record.invitation !== 'accepted')) throw new Error(`invalid crew state: ${id}`);
 }
 if (Object.values(state.crews).filter(item => item.membership === 'member').length > 1) throw new Error('Only one active crew membership is supported');
 for (const crew of content.crews) if (state.npcs[crew.introductionContactId]?.introduced && !state.crews[crew.id]) state.crews[crew.id] = { ...initialCrew(crew.id), introduced: true };
 for (const [id, record] of Object.entries(state.unlocks)) { known(content.unlocks, id, 'unlock'); if (record.unlockId !== id || typeof record.unlocked !== 'boolean') throw new Error(`invalid unlock state: ${id}`); }
 return copy(state);
}

function isRecordedDnf(fingerprint: string): boolean {
 try { return JSON.parse(fingerprint).outcome === 'dnf'; } catch { return false; }
}
