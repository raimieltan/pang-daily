import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import { SOCIAL_MARKETPLACE_SELLERS, SOCIAL_RACE_RIVALS } from '@/game-core/social/rules';
import { getReputationProgress, REPUTATION_CONFIG, type ReputationProgress, type ReputationTier } from '@/game-core/social/reputation';
import type { SocialEventInput } from '@/game-core/social/rules';
import type { GameEventSource } from '@/game/bridge/GameEvents';
import { loadSocialSession, type SocialStoragePort } from './socialStorage';

/** Converts completed game-system outcomes into social events. No score logic lives here. */
export class SocialEventBridge {
 private readonly release: (() => void)[] = [];

 constructor(events: GameEventSource, private readonly storage: SocialStoragePort, private readonly onError: (error: Error) => void = () => {}, private readonly onReputation?: (progress: ReputationProgress, tierChange?: { sceneId: string; from: ReputationTier; to: ReputationTier; points: number }) => void) {
  this.receive(() => this.session.recoverInterruptedRaces());
  this.release.push(events.on('raceAttemptStarted', attempt => this.receive(() => {
   if (SOCIAL_RACE_RIVALS[attempt.raceId] !== attempt.npcId) return;
   this.apply({ type: 'race_attempt', eventId: `race-start:${attempt.attemptId}`, sourceId: attempt.attemptId, ...attempt });
  })));
  this.release.push(events.on('jobState', run => this.receive(() => {
   if (!run || (run.status !== 'accepted' && run.status !== 'active')) return;
   const favor = SOCIAL_CONTENT.favors.find((item) => item.jobId === run.jobId);
   if (!favor) return;
   this.apply({ type: 'favor', eventId: `favor:${run.runId}:accepted`, sourceId: run.runId, npcId: favor.npcId, favorId: favor.id, jobId: run.jobId, runId: run.runId, phase: 'accepted', jobStatus: 'accepted' });
  })));
  this.release.push(events.on('jobEnded', result => this.receive(() => {
   const favor = SOCIAL_CONTENT.favors.find((item) => item.jobId === result.jobId);
   if (favor) {
    this.apply({ type: 'favor', eventId: `favor:${result.runId}:${result.status}`, sourceId: result.runId, npcId: favor.npcId, favorId: favor.id, jobId: result.jobId, runId: result.runId, phase: result.status, jobStatus: result.status });
   } else if (result.status === 'completed' && result.jobId in REPUTATION_CONFIG.jobs) {
    this.apply({ type: 'job', eventId: `job:${result.runId}:completed`, sourceId: result.runId, jobId: result.jobId, runId: result.runId, outcome: 'completed' });
   }
  })));
  this.release.push(events.on('raceFinished', result => this.receive(() => {
   if (!(result.raceId in REPUTATION_CONFIG.races) || !result.attemptId) return;
   const npcId = SOCIAL_RACE_RIVALS[result.raceId];
   this.apply({ type: 'race', eventId: `race:${result.attemptId}`, sourceId: result.attemptId, attemptId: result.attemptId, ...(npcId ? { npcId } : {}), raceId: result.raceId, position: result.position, racers: result.racers, timeMs: result.timeMs, validation: result.validation, outcome: result.outcome, vehicleId: result.vehicleId });
  })));
  this.release.push(events.on('repairCompleted', receipt => this.receive(() => {
   this.apply({ type: 'service', eventId: `repair:${receipt.transactionId}`, sourceId: `repair:${receipt.transactionId}`, npcId: 'mang_boy', serviceId: 'repair', outcome: 'completed', transactionId: receipt.transactionId, vehicleId: receipt.vehicleId, components: receipt.components, costPhp: receipt.costPhp });
  })));
  this.release.push(events.on('partInspected', receipt => this.receive(() => {
   this.apply({ type: 'service', eventId: `inspection:${receipt.transactionId}`, sourceId: `inspection:${receipt.transactionId}`, npcId: 'mang_boy', serviceId: 'inspection', outcome: 'completed', transactionId: receipt.transactionId, itemId: receipt.part.id, feePhp: receipt.feePhp });
  })));
  this.release.push(events.on('partPurchased', purchase => this.receive(() => {
   const npcId = SOCIAL_MARKETPLACE_SELLERS[purchase.sellerId];
   if (!npcId) return;
   this.apply({ type: 'marketplace', eventId: `marketplace:${purchase.transactionId}`, sourceId: `marketplace:${purchase.transactionId}`, npcId, sellerId: purchase.sellerId, listingId: purchase.listingId, transactionId: purchase.transactionId, outcome: 'purchased' });
  })));
 }

 dispose(): void { for (const release of this.release.splice(0)) release(); }

 private get session() { return loadSocialSession(this.storage); }

 private apply(event: SocialEventInput): void {
  const session = this.session;
  const result = session.applyEvent(event);
  if (result.status === 'applied' && result.record?.reputation) this.onReputation?.(getReputationProgress(session.snapshot(), result.record.reputation.sceneId), result.tierChange);
 }

 private receive(action: () => void): void {
  try { action(); } catch (error) { this.onError(error instanceof Error ? error : new Error(String(error))); }
 }
}
