import { EARLY_ECONOMY } from '../economy/balance';
import type { RaceValidation } from './raceOutcomes';
export type SocialEventInput =
 | { type: 'milestone'; eventId: string; sourceId: string; npcId: 'kyo_barista' | 'mang_boy'; milestoneId: 'brake_setback' | 'daily_recovered' | 'saved_parking' }
 | { type: 'dialogue'; eventId: string; sourceId: string; npcId: string; dialogueId: string; choiceId?: 'promise_help' | 'apologize' | 'congratulate_casey' | 'insult_casey' }
 | { type: 'favor'; eventId: string; sourceId: string; npcId: string; favorId: string; phase: 'offered' | 'accepted' | 'completed' | 'failed' | 'abandoned'; jobId?: string; runId?: string; jobStatus?: string; dialogueId?: string }
 | { type: 'race_attempt'; eventId: string; sourceId: string; attemptId: string; npcId: string; raceId: string; vehicleId: string; totalCheckpoints: number }
 | { type: 'race'; eventId: string; sourceId: string; attemptId: string; npcId?: string; raceId: string; position: number; racers: number; timeMs: number; vehicleId?: string; outcome?: 'win' | 'loss' | 'dnf'; validation?: RaceValidation }
 | { type: 'job'; eventId: string; sourceId: string; jobId: string; runId: string; outcome: 'completed' }
 | { type: 'service'; eventId: string; sourceId: string; npcId: string; serviceId: 'repair'; outcome: 'completed'; transactionId: number; vehicleId: string; components: readonly string[]; costPhp: number }
 | { type: 'service'; eventId: string; sourceId: string; npcId: string; serviceId: 'inspection'; outcome: 'completed'; transactionId: number; itemId: string; feePhp: number }
 | { type: 'marketplace'; eventId: string; sourceId: string; npcId: string; sellerId: string; listingId: string; transactionId: number; outcome: 'purchased' };

type Reward = { readonly trust: number; readonly respect: number; readonly reason: string; readonly flag?: string };

/** Authored effects only. Event producers cannot choose trust/respect rewards. */
export const SOCIAL_RULES = {
 dialogue: {
  introduction: { trust: 0, respect: 0, reason: 'First conversation' },
  introduce_mang_boy: { trust: 2, respect: 0, reason: 'Shared trusted mechanic introduction', flag: 'introduced_mang_boy' },
  promise_help: { trust: 2, respect: 0, reason: 'Promised to help Tito Jun', flag: 'promised_help' },
  apologize: { trust: 0, respect: 0, reason: 'Apologized to Tito Jun', flag: 'apology_offered' },
  congratulate_casey: { trust: 3, respect: 0, reason: 'Gave Casey credit after a race', flag: 'trusted_friend' },
  insult_casey: { trust: -10, respect: -5, reason: 'Insulted Casey after a race', flag: 'hostile' },
 },
 favor: {
  offered: { trust: 0, respect: 0, reason: 'Favor offered' },
  accepted: { trust: 0, respect: 0, reason: 'Favor accepted' },
  completed: { trust: 8, respect: 5, reason: 'Kept a commitment' },
  failed: { trust: -20, respect: -3, reason: 'Broke a commitment' },
  abandoned: { trust: -12, respect: -2, reason: 'Abandoned a commitment' },
  recovery: { trust: 26, respect: 3, reason: 'Made amends through follow-up help', flag: 'mentorship_offered' },
 },
 race: {
  win: { trust: 0, respect: 8, reason: 'Won a valid race' },
  loss: { trust: 0, respect: 2, reason: 'Finished a valid race' },
  dnf: { trust: 0, respect: 0, reason: 'Did not finish the race' },
 },
 service: { repair: { trust: 2, respect: 1, reason: 'Completed a repair with Tito Jun' }, inspection: { trust: 1, respect: 0, reason: 'Completed a part inspection with Tito Jun' } },
 marketplace: { purchased: { trust: 1, respect: 0, reason: 'Completed a Marketplace purchase' } },
} as const satisfies Record<string, Record<string, Reward>>;

/** Per NPC and authored source. Further valid attempts are recorded with zero reward. */
export const SOCIAL_REPEAT_LIMITS = { racePerRoute: EARLY_ECONOMY.raceValidation.paidWinsPerRoute, repairPerNpc: 3, inspectionPerNpc: 3, marketplacePerSeller: 3 } as const;
export const SOCIAL_RACE_RIVALS: Readonly<Record<string, string>> = { barangay_sprint: 'casey', pahuway_descent: 'casey' };
export const SOCIAL_MARKETPLACE_SELLERS: Readonly<Record<string, string>> = { jun_surplus: 'jun_surplus' };
