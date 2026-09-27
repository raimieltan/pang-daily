/** Stable content IDs are serialized in saves. Never derive them from display names. */
export type NpcId = string;
export type CrewId = string;
export type SocialEventId = string;
export type FavorId = string;
export type RelationshipFlagId = string;
export type SceneId = string;
export type SocialUnlockId = string;

export type NpcRole = 'friend' | 'rival' | 'mechanic' | 'seller' | 'mentor' | 'hostile_contact';
export type NpcDefinition = {
 readonly id: NpcId;
 readonly name: string;
 readonly roles: readonly NpcRole[];
 readonly homeInteractionId: string;
 readonly homeLocationId: string;
 readonly dialogueEntryId: string;
 readonly crewId?: CrewId;
 readonly vehicleBuildId?: string;
};
export type CrewDefinition = { readonly id: CrewId; readonly name: string; readonly homeLocationId: string };
export type SocialEventDefinition = { readonly id: SocialEventId; readonly npcIds: readonly NpcId[]; readonly crewId?: CrewId; readonly sceneId: SceneId };
export type FavorDefinition = { readonly id: FavorId; readonly npcId: NpcId; readonly jobId: string; readonly recoveryFor?: FavorId };
export type SocialUnlockDefinition = { readonly id: SocialUnlockId; readonly sourceEventId: SocialEventId };
export type RelationshipFlagDefinition = { readonly id: RelationshipFlagId; readonly npcId: NpcId; readonly establishes?: 'friend' | 'hostile' | 'mentor' };
export type SocialContent = {
 readonly npcs: readonly NpcDefinition[];
 readonly crews: readonly CrewDefinition[];
 readonly scenes: readonly { readonly id: SceneId; readonly name: string }[];
 readonly events: readonly SocialEventDefinition[];
 readonly favors: readonly FavorDefinition[];
 readonly relationshipFlags: readonly RelationshipFlagDefinition[];
 readonly unlocks: readonly SocialUnlockDefinition[];
 readonly references: {
  readonly interactionIds: readonly string[];
  readonly locationIds: readonly string[];
  readonly dialogueIds: readonly string[];
  readonly vehicleBuildIds: readonly string[];
  readonly jobIds: readonly string[];
  readonly sellerIds: readonly string[];
 };
};

/** Trust and respect are independent whole numbers from 0 to 100, default 50. */
export const STANDING_MIN = 0;
export const STANDING_MAX = 100;
export const STANDING_DEFAULT = 50;
export type NpcSocialState = {
 introduced: boolean;
 trust: number;
 respect: number;
 relationshipFlags: RelationshipFlagId[];
 favorIds: FavorId[];
 /** Unique significant event IDs in occurrence order. */
 eventIds: SocialEventId[];
};
export type SceneReputation = { sceneId: SceneId; points: number };
export type ReputationSourceState = { sourceKey: string; count: number };
export type ReputationEventEffect = { sceneId: SceneId; sourceKey: string; pointsDelta: number; fromTier: string; toTier: string };
export type CrewStanding = { crewId: CrewId; points: number; membership: 'none' | 'invited' | 'member' };
export type SocialUnlockState = { unlockId: SocialUnlockId; unlocked: boolean };
export type FavorProgress = { favorId: FavorId; npcId: NpcId; status: 'offered' | 'accepted' | 'completed' | 'failed' | 'abandoned'; runId: string | null };
export type SocialEventEffect = { npcId: NpcId; trustDelta: number; respectDelta: number; flagsAdded: RelationshipFlagId[]; flagsRemoved: RelationshipFlagId[] };
export type AppliedSocialEvent = { eventId: string; sourceId: string; sourceKey: string; fingerprint: string; type: string; targetId: string; contextId: string; reason: string; effects: SocialEventEffect[]; reputation?: ReputationEventEffect };
export type SocialState = {
 version: 3;
 npcs: Record<NpcId, NpcSocialState>;
 favors: Record<FavorId, FavorProgress>;
 appliedEvents: AppliedSocialEvent[];
 reputation: Record<SceneId, SceneReputation>;
 reputationRewards: Record<string, ReputationSourceState>;
 crews: Record<CrewId, CrewStanding>;
 unlocks: Record<SocialUnlockId, SocialUnlockState>;
};
