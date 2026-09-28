import type { SceneId, SocialState } from './contract';
import type { SocialEventInput } from './rules';

/** Authored recognition thresholds and repeat limits for the Iloilo car scene. */
export const REPUTATION_CONFIG = {
 sceneId: 'iloilo_scene',
 cap: 160,
 tiers: [
  { name: 'Unknown', minimum: 0 },
  { name: 'Regular', minimum: 12 },
  { name: 'Known', minimum: 30 },
  { name: 'Respected', minimum: 55 },
  { name: 'Feared', minimum: 90 },
  { name: 'Local Legend', minimum: 130 },
 ],
 milestones: { saved_parking: { sceneId: 'iloilo_scene', points: 12, limit: 1 } },
 races: {
  barangay_sprint: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
  kyo_block_lap: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
  terrace_sprint: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
  pahuway_descent: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
  the_wall: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
  midnight_run: { sceneId: 'iloilo_scene', win: 8, finish: 5, limit: 3 },
 },
 jobs: { kyo_ice_run: { sceneId: 'iloilo_scene', completed: 4, limit: 2 } },
 favors: {
  mang_boy_parts_help: { sceneId: 'iloilo_scene', completed: 8, failed: -3, abandoned: -2, limit: 1 },
  mang_boy_recovery: { sceneId: 'iloilo_scene', completed: 6, failed: -2, abandoned: -2, limit: 1 },
 },
} as const;

export type ReputationTier = (typeof REPUTATION_CONFIG.tiers)[number]['name'];
export type ReputationProgress = {
 sceneId: SceneId;
 points: number;
 tier: ReputationTier;
 tierMinimum: number;
 nextTier: ReputationTier | null;
 nextMinimum: number | null;
 pointsToNext: number;
 progress: number;
};

export const clampReputation = (points: number): number => Number.isFinite(points) ? Math.max(0, Math.min(REPUTATION_CONFIG.cap, Math.trunc(points))) : 0;

/** One projection for presentation and content gates; thresholds are inclusive. */
export function getReputationProgress(input: number | SocialState, sceneId: SceneId = REPUTATION_CONFIG.sceneId): ReputationProgress {
 const points = clampReputation(typeof input === 'number' ? input : input.reputation[sceneId]?.points ?? 0);
 const tiers = REPUTATION_CONFIG.tiers;
 let index = 0;
 for (let candidate = 1; candidate < tiers.length; candidate++) if (points >= tiers[candidate].minimum) index = candidate;
 const current = tiers[index], next = tiers[index + 1] as (typeof tiers)[number] | undefined;
 return {
  sceneId, points, tier: current.name, tierMinimum: current.minimum,
  nextTier: next?.name ?? null, nextMinimum: next?.minimum ?? null,
  pointsToNext: next ? next.minimum - points : 0,
  progress: next ? (points - current.minimum) / (next.minimum - current.minimum) : 1,
 };
}

export function meetsReputationTier(input: number | SocialState, required: ReputationTier, sceneId: SceneId = REPUTATION_CONFIG.sceneId): boolean {
 const minimum = REPUTATION_CONFIG.tiers.find((tier) => tier.name === required)!.minimum;
 return getReputationProgress(input, sceneId).points >= minimum;
}

export type ReputationAward = { sceneId: SceneId; sourceKey: string; points: number; limit: number };

/** Only validated gameplay outcomes named in content can request scene points. */
export function configuredReputationAward(event: SocialEventInput): ReputationAward | null {
 if (event.type === 'milestone' && event.milestoneId === 'saved_parking') return { sceneId: 'iloilo_scene', sourceKey: 'milestone:saved_parking', points: 12, limit: 1 };
 if (event.type === 'race' && event.outcome !== 'dnf') {
  const source = REPUTATION_CONFIG.races[event.raceId as keyof typeof REPUTATION_CONFIG.races];
  return source ? { sceneId: source.sceneId, sourceKey: `race:${event.raceId}`, points: event.position === 1 ? source.win : source.finish, limit: source.limit } : null;
 }
 if (event.type === 'job') {
  const source = REPUTATION_CONFIG.jobs[event.jobId as keyof typeof REPUTATION_CONFIG.jobs];
  return source && event.outcome === 'completed' ? { sceneId: source.sceneId, sourceKey: `job:${event.jobId}`, points: source.completed, limit: source.limit } : null;
 }
 if (event.type === 'favor' && (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'abandoned')) {
  const source = REPUTATION_CONFIG.favors[event.favorId as keyof typeof REPUTATION_CONFIG.favors];
  return source ? { sceneId: source.sceneId, sourceKey: `favor:${event.favorId}`, points: source[event.phase], limit: source.limit } : null;
 }
 return null;
}
