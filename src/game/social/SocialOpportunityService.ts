import { FIRST_RIVAL, rivalHistory } from '@/game-core/social/rivalHistory';
import { evaluateEligibility } from '@/game-core/social/eligibility';
import { opportunity, SOCIAL_OPPORTUNITIES } from '@/game-core/social/opportunities';
import type { RuntimePort } from '../bridge';
import { loadSocialSession, type SocialStoragePort } from './socialStorage';

/** Runtime adapter: authoritative sessions ask for fresh state; discovery is persisted before notification. */
export class SocialOpportunityService {
 private elapsed = 0;
 constructor(private readonly bridge: RuntimePort, private readonly storage: SocialStoragePort) {}
 readonly access = (id: string) => evaluateEligibility(opportunity(id), loadSocialSession(this.storage).snapshot());
 readonly raceRejection = (raceId: string): string | null => {
  if (FIRST_RIVAL.raceIds.includes(raceId as 'barangay_sprint' | 'pahuway_descent')) {
   const rematch = rivalHistory(loadSocialSession(this.storage).snapshot()).rematch;
   if (!rematch.eligible) return `Rematch unavailable: ${rematch.unmetRequirements.join('; ')}`;
  }
  const rule = SOCIAL_OPPORTUNITIES.find(item => item.benefit.kind === 'race' && item.benefit.raceId === raceId);
  if (!rule) return null;
  const result = this.access(rule.id);
  return result.eligible ? null : `Race invitation unavailable: ${result.unmetRequirements.join('; ')}`;
 };
 update(dt: number): void {
  this.elapsed += dt;
  if (this.elapsed < 1) return;
  this.elapsed = 0;
  try {
   for (const notice of loadSocialSession(this.storage).discoverOpportunities()) this.bridge.emit('socialOpportunityDiscovered', notice);
  } catch (error) { this.bridge.emit('error', { message: `Social discovery failed: ${error instanceof Error ? error.message : String(error)}` }); }
 }
}
