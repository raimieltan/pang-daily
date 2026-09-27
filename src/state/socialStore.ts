import { socialView, type SocialView, type SocialNotice } from '@/game-core/social/presentation';
import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import { createSocialState } from '@/game-core/social/SocialSession';
import { getReputationProgress, type ReputationProgress, type ReputationTier } from '@/game-core/social/reputation';
import { loadSocialSession, type SocialStoragePort } from '@/game/social/socialStorage';

type TierNotice = { sceneId: string; from: ReputationTier; to: ReputationTier; points: number };
type State = { view: SocialView; contactsOpen: boolean; notices: SocialNotice[]; clearSocialNotice(): void; opportunityNotices: { id: string; name: string }[]; clearOpportunityNotice(): void; progress: ReputationProgress; tierNotice: TierNotice | null; clearTierNotice(): void };
const initial = () => ({ view: socialView(createSocialState()), contactsOpen: false, notices: [] as SocialNotice[], opportunityNotices: [] as { id: string; name: string }[], progress: getReputationProgress(createSocialState()), tierNotice: null });

export const useSocialStore = create<State>((set) => ({
 ...initial(),
 clearSocialNotice: () => set(state => ({ notices: state.notices.slice(1) })),
 clearOpportunityNotice: () => set(state => ({ opportunityNotices: state.opportunityNotices.slice(1) })),
 clearTierNotice: () => set({ tierNotice: null }),
}));

/** Low-frequency derived recognition for UI, sourced from the same save and selector as gates. */
export function bindSocialStore(events: GameEventSource, storage?: SocialStoragePort): () => void {
 try {
  const selected = storage ?? window.sessionStorage;
  useSocialStore.setState({ opportunityNotices: [] as { id: string; name: string }[], view: socialView(loadSocialSession(selected).snapshot()), contactsOpen: false, notices: [], progress: getReputationProgress(loadSocialSession(selected).snapshot()), tierNotice: null });
 } catch {
  useSocialStore.setState(initial());
 }
 const release = [
  events.on('contactsOpened', contactsOpen => useSocialStore.setState({ contactsOpen })),
  events.on('socialViewChanged', view => useSocialStore.setState({ view, progress: view.reputation })),
  events.on('socialChangesApplied', notices => useSocialStore.setState(state => ({ notices: [...state.notices, ...notices].slice(-12), opportunityNotices: [], tierNotice: null }))),
  events.on('socialOpportunityDiscovered', notice => useSocialStore.setState(state => ({ opportunityNotices: [...state.opportunityNotices, notice] }))),
  events.on('socialReputationUpdated', progress => useSocialStore.setState({ progress })),
  events.on('socialTierChanged', tierNotice => useSocialStore.setState({ tierNotice })),
 ];
 return () => { for (const off of release) off(); useSocialStore.setState(initial()); };
}
