import { ConflictException } from '@nestjs/common';
import type { PlayerAction, CommandReceipt } from '@pang-daily/contracts';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { CONVERSATIONS, resolveConversation } from '@pang-daily/game-core/social/conversation';
import { SocialSession } from '@pang-daily/game-core/social/SocialSession';
import { REPUTATION_CONFIG } from '@pang-daily/game-core/social/reputation';
import { SOCIAL_MARKETPLACE_SELLERS } from '@pang-daily/game-core/social/rules';
import type { SocialEventInput } from '@pang-daily/game-core/social/rules';
import { raceEconomy } from '@pang-daily/game-core/economy/raceRules';
import type { Prisma } from '../generated/prisma/client';
import { loadSocialState, saveSocialState } from './social-state';
type Tx = Prisma.TransactionClient;
export async function progressSocial(tx: Tx, playerId: string, action: PlayerAction, receipt: CommandReceipt) {
 const before = await loadSocialState(tx, playerId);
 const session = new SocialSession(SOCIAL_CONTENT, before);
 const apply = (event: SocialEventInput) => session.applyEvent(event);
 try {
  if (action.type === 'social_introduce') {
   const npc = SOCIAL_CONTENT.npcs.find(npc => npc.dialogueEntryId === action.dialogueId);
   if (!npc) throw new Error('Unknown conversation');
   const currentNodeId = resolveConversation(action.dialogueId, before).node.id;
   await tx.conversationProgress.upsert({ where: { playerId_dialogueId: { playerId, dialogueId: action.dialogueId } }, create: { playerId, dialogueId: action.dialogueId, currentNodeId }, update: { currentNodeId } });
   const result = apply({ type: 'dialogue', npcId: npc.id, dialogueId: action.dialogueId, eventId: `dialogue:${npc.id}:${action.dialogueId}`, sourceId: action.dialogueId });
   receipt.details = { duplicate: result.status !== 'applied' };
  } else if (action.type === 'social_choice') {
   const cursor = await tx.conversationProgress.findUnique({ where: { playerId_dialogueId: { playerId, dialogueId: action.dialogueId } } });
   const consumed = before.appliedEvents.some(event => event.eventId === `conversation:${action.dialogueId}:${action.choiceId}`);
   if (!cursor || (!consumed && cursor.currentNodeId !== action.nodeId)) throw new Error('Open the conversation and follow its current node');
   const result = session.chooseConversation(action.dialogueId, action.nodeId, action.choiceId);
   const choice = CONVERSATIONS.find(dialogue => dialogue.id === action.dialogueId)?.nodes.find(node => node.id === action.nodeId)?.choices.find(choice => choice.id === action.choiceId);
   if (result.status !== 'duplicate' && choice?.nextNodeId) await tx.conversationProgress.update({ where: { playerId_dialogueId: { playerId, dialogueId: action.dialogueId } }, data: { currentNodeId: choice.nextNodeId } });
   receipt.details = { duplicate: result.status === 'duplicate' };
  } else if (['job_start', 'job_objective', 'job_end'].includes(action.type) && receipt.resourceId) {
   const job = await tx.jobProgress.findUniqueOrThrow({ where: { playerId_runId: { playerId, runId: receipt.resourceId } } });
   const favor = SOCIAL_CONTENT.favors.find(favor => favor.jobId === job.jobDefinitionId);
   if (favor && job.status !== 'active') {
    const phase = job.status;
    apply({ type: 'favor', eventId: `favor:${job.runId}:${phase}`, sourceId: job.runId, npcId: favor.npcId, favorId: favor.id, jobId: job.jobDefinitionId, runId: job.runId, phase, jobStatus: phase });
   } else if (!favor && job.status === 'completed' && job.jobDefinitionId in REPUTATION_CONFIG.jobs) {
    apply({ type: 'job', eventId: `job:${job.runId}:completed`, sourceId: job.runId, jobId: job.jobDefinitionId, runId: job.runId, outcome: 'completed' });
   }
  } else if (action.type === 'race_start' || action.type === 'race_complete') {
   const row = await tx.raceResult.findUniqueOrThrow({ where: { playerId_attemptId: { playerId, attemptId: action.attemptId } } });
   const race = raceEconomy(row.raceDefinitionId)!;
   if (race.id in REPUTATION_CONFIG.races) {
    if (action.type === 'race_start' && race.npcId && race.rivalVehicleId) {
     apply({ type: 'race_attempt', eventId: `race-start:${row.attemptId}`, sourceId: row.attemptId, attemptId: row.attemptId, npcId: race.npcId, raceId: race.id, vehicleId: race.rivalVehicleId, totalCheckpoints: race.checkpoints });
    } else if (action.type === 'race_complete' && row.outcome !== 'started') {
     apply({ type: 'race', eventId: `race:${row.attemptId}`, sourceId: row.attemptId, attemptId: row.attemptId, ...(race.npcId ? { npcId: race.npcId, vehicleId: race.rivalVehicleId! } : {}), raceId: race.id, outcome: row.outcome, position: row.position ?? 2, racers: 2, timeMs: Number(row.elapsedMs), validation: { completedCheckpoints: row.checkpointIndex, totalCheckpoints: race.checkpoints, finishValidated: row.outcome !== 'dnf', invalidFinish: false } });
    }
   }
  } else if (receipt.transactionId && receipt.sequence) {
   const sequence = Number(receipt.sequence);
   if (action.type === 'vehicle_repair') apply({ type: 'service', eventId: `repair:${sequence}`, sourceId: `repair:${sequence}`, npcId: 'mang_boy', serviceId: 'repair', outcome: 'completed', transactionId: sequence, vehicleId: action.vehicleId, components: action.components, costPhp: Math.round(Number(receipt.details.costPhp)) });
   if (action.type === 'part_inspect') apply({ type: 'service', eventId: `inspection:${sequence}`, sourceId: `inspection:${sequence}`, npcId: 'mang_boy', serviceId: 'inspection', outcome: 'completed', transactionId: sequence, itemId: action.partId, feePhp: Number(-BigInt(receipt.amountCentavos)) / 100 });
   if (action.type === 'market_purchase') {
    const listing = await tx.marketplaceListing.findFirstOrThrow({ where: { playerId, id: action.listingId } });
    const npcId = SOCIAL_MARKETPLACE_SELLERS[listing.sellerId];
    if (npcId) apply({ type: 'marketplace', eventId: `marketplace:${sequence}`, sourceId: `marketplace:${sequence}`, npcId, sellerId: listing.sellerId, listingId: listing.id, transactionId: sequence, outcome: 'purchased' });
   }
  }
 } catch (error) {
  if (error instanceof Error && !('code' in error)) throw new ConflictException({ code: 'INVALID_SOCIAL_ACTION', message: error.message });
  throw error;
 }
 await saveSocialState(tx, playerId, before, session);
}
