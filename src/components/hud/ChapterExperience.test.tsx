// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePlayerMetaStore, type PlayerMeta } from '@/state/playerMetaStore';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { CHAPTER_ONE } from '@/game-core/progression/chapter';
import { ChapterExperience } from './ChapterExperience';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); usePlayerMetaStore.setState({ player: null }); vi.unstubAllGlobals(); });
function save(currentBeatId: string | null, markers: string[]) {
 usePlayerMetaStore.setState({ player: { playerId: 'chapter-ui', runtime: { chapters: [{ id: CHAPTER_ONE.id, currentBeatId, markers, completedAt: currentBeatId ? null : new Date().toISOString(), beats: CHAPTER_ONE.beats.map(id => ({ id, status: markers.includes(id) ? 'completed' : id === currentBeatId ? 'available' : 'locked' })) }] } } as PlayerMeta });
}
it('shows the active world objective, recovery cost context and a completion scene from durable snapshots', () => {
 act(() => save('finish_first_race', CHAPTER_ONE.beats.slice(0, 4) as string[]));
 act(() => root.render(<ChapterExperience />));
 expect(host.querySelector('[data-testid="chapter-moment"]')).toBeNull();
 expect(host.textContent).toContain('Finish the Barangay sprint');
 act(() => save('repair_daily', CHAPTER_ONE.beats.slice(0, 6) as string[]));
 expect(host.querySelector('[data-testid="chapter-moment"]')?.textContent).toContain('This is the money you were saving');
 expect(host.textContent).toContain('walking oil errand');
 act(() => host.querySelector<HTMLButtonElement>('[aria-controls="chapter-beats"]')!.click());
 expect(host.querySelectorAll('#chapter-beats li')).toHaveLength(8);
 act(() => save(null, [...CHAPTER_ONE.beats]));
 expect(host.querySelector('[data-testid="chapter-moment"]')?.textContent).toContain('Your spot was already there');
 expect(host.textContent).toContain('Chapter 1 complete');
});
it('shows a brake-repair reminder only for the recovery beat', () => {
 act(() => save('repair_daily', CHAPTER_ONE.beats.slice(0, 6) as string[]));
 useMaintenanceStore.setState({ summary: { condition: { brakes: .3 }, walletPhp: 300 } as NonNullable<ReturnType<typeof useMaintenanceStore.getState>['summary']> });
 act(() => root.render(<ChapterExperience />));
 expect(host.textContent).toContain('Brakes 30% · ₱300');
});
