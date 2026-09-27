import { create } from 'zustand';
import type { TransitionResult } from '@/lib/player/legacyTransition';
/** Presentation-only status; completion is stored by the transition boundary. */
export const useLegacyTransitionStore = create<{ result: TransitionResult | null; dismissed: boolean }>(() => ({ result: null, dismissed: false }));
