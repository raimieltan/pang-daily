import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import { createSocialState } from '@/game-core/social/SocialSession';
import { getReputationProgress, type ReputationProgress, type ReputationTier } from '@/game-core/social/reputation';
import { loadSocialSession, type SocialStoragePort } from '@/game/social/socialStorage';

type TierNotice = { sceneId: string; from: ReputationTier; to: ReputationTier; points: number };
type State = { opportunityNotices: { id: string; name: string }[]; clearOpportunityNotice(): void; progress: ReputationProgress; tierNotice: TierNotice | null; clearTierNotice(): void };
const initial = () => ({ opportunityNotices: [] as { id: string; name: string }[], progress: getReputationProgress(createSocialState()), tierNotice: null });

export const useSocialStore = create<State>((set) => ({
 ...initial(),
 clearOpportunityNotice: () => set(state => ({ opportunityNotices: state.opportunityNotices.slice(1) })),
 clearTierNotice: () => set({ tierNotice: null }),
}));

/** Low-frequency derived recognition for UI, sourced from the same save and selector as gates. */
export function bindSocialStore(events: GameEventSource, storage?: SocialStoragePort): () => void {
 try {
  const selected = storage ?? window.sessionStorage;
  useSocialStore.setState({ opportunityNotices: [] as { id: string; name: string }[], progress: getReputationProgress(loadSocialSession(selected).snapshot()), tierNotice: null });
 } catch {
  useSocialStore.setState(initial());
 }
 const release = [
  events.on('socialOpportunityDiscovered', notice => useSocialStore.setState(state => ({ opportunityNotices: [...state.opportunityNotices, notice] }))),
  events.on('socialReputationUpdated', progress => useSocialStore.setState({ progress })),
  events.on('socialTierChanged', tierNotice => useSocialStore.setState({ tierNotice })),
 ];
 return () => { for (const off of release) off(); useSocialStore.setState(initial()); };
}
