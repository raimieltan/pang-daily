// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LegacyTransitionNotice } from './LegacyTransitionNotice';
import { useLegacyTransitionStore } from '@/state/legacyTransitionStore';
import { playerService } from '@/lib/player/playerService';
vi.mock('@/lib/player/playerService', () => ({ playerService: { retryLegacyCleanup: vi.fn() } }));
let root: Root | undefined;
function renderNotice() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<LegacyTransitionNotice />));
  return container;
}
afterEach(() => {
  act(() => root?.unmount()); root = undefined; document.body.innerHTML = '';
  vi.clearAllMocks(); useLegacyTransitionStore.setState({ result: null, dismissed: false });
});
it('explains the reset and lets the player dismiss the notice', () => {
  useLegacyTransitionStore.setState({ result: { status: 'complete', marked: true, hadLegacy: true, saves: [] }, dismissed: false });
  const container = renderNotice();
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Browser development progress was not imported');
  act(() => container.querySelector('button')!.click());
  expect(container.querySelector('[role="status"]')).toBeNull();
});
it('offers cleanup recovery without implying that the account save failed', () => {
  useLegacyTransitionStore.setState({ result: { status: 'cleanup-pending', marked: true, hadLegacy: true, saves: [] }, dismissed: false });
  const container = renderNotice();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your account save is safe');
  act(() => container.querySelector('button')!.click());
  expect(playerService.retryLegacyCleanup).toHaveBeenCalledOnce();
});
it('does not show a reset notice for fresh users', () => {
  useLegacyTransitionStore.setState({ result: { status: 'complete', marked: true, hadLegacy: false, saves: [] }, dismissed: false });
  expect(renderNotice().textContent).toBe('');
});
