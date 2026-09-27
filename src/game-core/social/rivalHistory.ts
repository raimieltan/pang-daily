import type { SocialState } from './contract';
import { SOCIAL_REPEAT_LIMITS } from './rules';

/** Same person and owned build at the grid and at Kyo. Rematches have no social gate or cooldown. */
export const FIRST_RIVAL = {
 npcId: 'casey', name: 'Casey', vehicleId: 'casey_daily', vehicleBuildId: 'casey_kidlat_rs', vehicleSpecId: 'hiraya_kidlat_1997',
 interactionId: 'casey_corner', raceIds: ['barangay_sprint', 'pahuway_descent'],
 rematch: { raceId: 'barangay_sprint', cooldownSeconds: 0, minimumTrust: 0, location: 'North street · Barangay sprint', rewardLimit: SOCIAL_REPEAT_LIMITS.racePerRoute },
} as const;
export type RivalOutcome = 'win' | 'loss' | 'dnf';
export type RivalAttempt = { attemptId: string; raceId: string; npcId: string; vehicleId: string; outcome: RivalOutcome | 'started'; timeMs: number };
export type RivalHistory = {
 npcId: string; vehicleId: string; metAtHub: boolean; attempts: RivalAttempt[];
 wins: number; losses: number; dnfs: number; latestOutcome: RivalOutcome | null;
 rematch: { raceId: string; eligible: boolean; label: string; unmetRequirements: string[] };
};

/** History is derived from the existing atomic event ledger, never a second mutable save. */
export function rivalHistory(state: SocialState, npcId = FIRST_RIVAL.npcId): RivalHistory {
 const attempts = new Map<string, RivalAttempt>();
 let latestOutcome: RivalOutcome | null = null;
 for (const record of state.appliedEvents) {
  if (record.targetId !== npcId || !['race_attempt', 'race'].includes(record.type)) continue;
  let input: { attemptId: string; raceId: string; vehicleId?: string; outcome?: RivalOutcome; position?: number; timeMs?: number };
  try { input = JSON.parse(record.fingerprint); } catch { continue; }
  if (typeof input.attemptId !== 'string' || !FIRST_RIVAL.raceIds.includes(input.raceId as 'barangay_sprint' | 'pahuway_descent')) continue;
  const outcome = record.type === 'race_attempt' ? 'started' : input.outcome ?? (input.position === 1 ? 'win' : 'loss');
  attempts.set(input.attemptId, { attemptId: input.attemptId, raceId: input.raceId, npcId, vehicleId: input.vehicleId ?? FIRST_RIVAL.vehicleId, outcome, timeMs: input.timeMs ?? 0 });
  if (outcome !== 'started') latestOutcome = outcome;
 }
 const history = [...attempts.values()];
 const rule = FIRST_RIVAL.rematch;
 const unmetRequirements = (state.npcs[npcId]?.trust ?? 0) < rule.minimumTrust ? [`Casey trust ${rule.minimumTrust} required`] : [];
 return { npcId, vehicleId: FIRST_RIVAL.vehicleId, metAtHub: state.npcs[npcId]?.introduced ?? false, attempts: history,
  wins: history.filter(item => item.outcome === 'win').length, losses: history.filter(item => item.outcome === 'loss').length, dnfs: history.filter(item => item.outcome === 'dnf').length, latestOutcome,
  rematch: { raceId: rule.raceId, eligible: !unmetRequirements.length, unmetRequirements,
   label: `Rematch ${rule.location} · no entry fee · no cooldown · first ${rule.rewardLimit} rewards per route` },
 };
}
