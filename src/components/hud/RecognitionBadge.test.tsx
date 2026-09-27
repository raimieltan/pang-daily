// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getReputationProgress } from '@/game-core/social/reputation';
import { useSocialStore } from '@/state/socialStore';
import { RecognitionBadge } from './RecognitionBadge';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 host = document.createElement('div');
 document.body.append(host);
 root = createRoot(host);
});
afterEach(() => {
 act(() => root.unmount());
 host.remove();
 vi.unstubAllGlobals();
});

it('shows the local tier, next threshold, and transition without NPC standing', () => {
 act(() => root.render(<RecognitionBadge />));
 expect(host.textContent).toContain('Unknown');
 expect(host.textContent).toContain('0 / 12');
 act(() => useSocialStore.setState({ progress: getReputationProgress(13), tierNotice: { sceneId: 'iloilo_scene', from: 'Unknown', to: 'Regular', points: 13 } }));
 expect(host.textContent).toContain('Regular');
 expect(host.textContent).toContain('13 / 30');
 expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('6');
 expect(host.querySelector('[role="status"]')?.textContent).toContain('Recognition: Regular');
});
