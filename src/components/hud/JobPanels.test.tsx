// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameBridge } from '@/game/bridge';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { JobSession } from '@/game-core/jobs/JobSession';
import { JobSystem } from '@/game/jobs/JobSystem';
import { HUB_JOBS, KYO_ICE_RUN, KYO_JOB_BOARD } from '@/game/jobs/hubJobs';
import type { InteractionHandler } from '@/game/interaction/InteractionSystem';
import type { PlayerMode } from '@/game/player/PlayerMode';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindJobStore } from '@/state/jobStore';
import { JobBoardPanel, JobTracker } from './JobPanels';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(off => off()); vi.unstubAllGlobals(); });
const board = { id: KYO_JOB_BOARD, action: 'browse_jobs' as const, label: 'Check odd jobs', area: { kind: 'circle' as const, x: 0, z: 0, radius: 2 } };
function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const bridge = new GameBridge(), wallet = new VehicleSession(), jobs = new JobSession(wallet, HUB_JOBS);
  const player = { position: new Vector3(0, 0, 0), mode: 'walking' as PlayerMode };
  const handlers = new Map<string, InteractionHandler>();
  const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
  const unbind = bindJobStore(bridge.ui.events), unbindUi = bindGameUiStore(bridge.ui);
  const system = new JobSystem(bridge.runtime, jobs, { player, vehicle: { speedKmh: 0, impactSerial: 0, impactStrength: 0 }, racing: () => false, boards: [board] });
  system.connect({ handle: (action, handler) => { handlers.set(action, handler); return () => {}; } });
  act(() => { root.render(<><JobTracker /><JobBoardPanel /></>); });
  cleanup.push(() => { act(() => root.unmount()); system.dispose(); unbind(); unbindUi(); bridge.dispose(); div.remove(); });
  const button = (prefix: string) => Array.from(div.querySelectorAll('button')).find(b => b.textContent?.startsWith(prefix));
  const stop = (id: string) => act(() => {
    const area = KYO_ICE_RUN.objectives.find(o => o.id === id)!.area;
    player.position.set(area.x, 0, area.z);
    handlers.get('job_objective')!({ id, action: 'job_objective', label: id, target: id, area: { kind: 'circle', ...area } });
  });
  return { div, wallet, player, system, handlers, button, stop };
}

it('lists the job, tracks objectives in order and shows the paid result', () => {
  const s = setup();
  act(() => { s.handlers.get('browse_jobs')!(board); });
  expect(s.div.textContent).toContain('Ice & milk run');
  expect(s.div.textContent).toContain('Suki 24 → Kyo Coffee · 4:00 limit');
  act(() => s.button('Take the job')!.click());
  expect(s.div.querySelector('[aria-label="Job board"]')).toBeNull();
  expect(s.div.querySelector('[data-testid="job-hint"]')?.textContent).toBe('Get in your car to start.');

  act(() => { s.player.mode = 'driving'; s.system.update(.1); });
  expect(s.div.querySelector('[data-testid="job-timer"]')?.textContent).toBe('4:00');
  expect(s.div.textContent).toContain('▸ Pick up the order at Suki 24');
  s.stop('pickup');
  expect(s.div.textContent).toContain('✓ Pick up the order at Suki 24');
  expect(s.div.textContent).toContain('Ice & milk: 0% damaged');
  s.stop('dropoff');
  expect(s.div.querySelector('[data-testid="job-tracker"]')).toBeNull();
  expect(s.div.querySelector('[data-testid="job-result"]')?.textContent).toBe('Ice & milk run done · +₱450 in 0:00');
  expect(s.wallet.snapshot().walletPhp).toBe(5450);
});

it('abandons from the tracker without pay', () => {
  const s = setup();
  act(() => { s.handlers.get('browse_jobs')!(board); });
  act(() => s.button('Take the job')!.click());
  act(() => s.button('Abandon job')!.click());
  expect(s.div.querySelector('[data-testid="job-result"]')?.textContent).toBe('Ice & milk run abandoned · No pay');
  expect(s.wallet.snapshot().walletPhp).toBe(5000);
});
