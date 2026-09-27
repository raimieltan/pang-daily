import type { SocialState } from './contract';
import { evaluateDialogueCondition, type DialogueCondition } from './conversation';

export type Requirement = { text: string; condition: DialogueCondition | { eventId: string; npcId: string } };
export type OpportunityRule = {
 readonly id: string;
 readonly name: string;
 /** retain: discovery survives standing loss; suspend: check standing on every execution. */
 readonly lossBehavior: 'retain' | 'suspend';
 readonly requirements: readonly Requirement[];
 readonly benefit: { kind: 'race'; raceId: string } | { kind: 'seller'; sellerId: string; discountPercent: number }
  | { kind: 'repair'; discountPercent: number } | { kind: 'crew'; crewId: string };
};
export type Eligibility = { eligible: boolean; discovered: boolean; unmetRequirements: string[] };

/** Pure, reusable projection; evaluating never discovers, pays, or grants anything. */
export function evaluateEligibility(rule: OpportunityRule, state: SocialState): Eligibility {
 const discovered = state.unlocks[rule.id]?.unlocked === true;
 const unmetRequirements = rule.requirements.filter(({ condition }) => 'eventId' in condition
  ? !state.npcs[condition.npcId]?.eventIds.includes(condition.eventId)
  : !evaluateDialogueCondition(condition, state)).map(item => item.text);
 const eligible = (discovered && rule.lossBehavior === 'retain') || unmetRequirements.length === 0;
 return { discovered, eligible, unmetRequirements: eligible ? [] : unmetRequirements };
}

/** Always starts from the catalog/base quote, rounded to centavos. Never mutates the base. */
export function discountedPrice(basePhp: number, percent: number): number {
 if (!Number.isFinite(basePhp) || basePhp < 0 || !Number.isFinite(percent)) throw new Error('Invalid discount price');
 return Math.max(0, Math.round(basePhp * 100 * (1 - Math.min(100, Math.max(0, percent)) / 100)) / 100);
}
export type SocialAccess = (id: string) => Eligibility;
