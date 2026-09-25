// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RepairPanel, ConditionHud } from './RepairPanel';
import { GameBridge } from '@/game/bridge';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import { VehicleSession, type RepairQuote } from '@/game-core/maintenance/VehicleSession';
import { bindMaintenanceStore, useMaintenanceStore } from '@/state/maintenanceStore';
import { bindGameUiStore } from '@/state/gameUiStore';

const release: (() => void)[] = [];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); release.splice(0).reverse().forEach(off => off()); vi.unstubAllGlobals(); });
const click = (element: HTMLElement) => act(() => element.click());
const checkbox = (label: string) => Array.from(container.querySelectorAll('label')).find(el => el.textContent?.includes(label))!.querySelector('input')!;
const payButton = () => Array.from(container.querySelectorAll('button')).find(el => el.textContent?.startsWith('Pay '))!;
const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;
function setup() {
  const bridge = new GameBridge(), session = new VehicleSession();
  release.push(() => bridge.dispose(), bindGameUiStore(bridge.ui), bindMaintenanceStore(bridge.ui.events));
  let quote: RepairQuote = session.quote(car);
  bridge.runtime.handle('repairVehicle', ({ quoteId, components }) => {
    if (quoteId !== quote.id) return { rejected: 'Old quote' };
    const result = session.repair(car, quote, components);
    if ('rejected' in result) return result;
    bridge.runtime.emit('maintenanceState', session.summary(car));
    bridge.runtime.emit('repairCompleted', result);
    quote = session.quote(car); bridge.runtime.emit('repairQuote', quote);
  });
  bridge.runtime.handle('dismissRepair', () => bridge.runtime.emit('repairQuote', null));
  bridge.runtime.emit('maintenanceState', session.summary(car)); bridge.runtime.emit('repairQuote', quote);
  act(() => root.render(<><ConditionHud /><RepairPanel /></>));
  return { bridge, session };
}
it('shows an itemized quote, updates totals, pays once and shows repaired condition and cash', () => {
  const { session } = setup();
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(5);
  expect(payButton().disabled).toBe(true);
  const cost = useMaintenanceStore.getState().quote!.lines.find(line => line.component === 'tires')!.costPhp;
  click(checkbox('Tires'));
  expect(text('repair-total')).toBe(`₱${cost.toLocaleString('en-PH')}`);
  click(payButton());
  expect(text('condition-tires')).toBe('100%');
  expect(text('wallet')).toBe(`₱${(5000 - cost).toLocaleString('en-PH')}`);
  expect(container.querySelector('[role="status"]')?.textContent).toContain('restored to 100%');
  expect(checkbox('Tires').disabled).toBe(true);
  click(payButton());
  expect(session.snapshot().transactions.filter(t => t.kind === 'repair')).toHaveLength(1);
});
it('blocks unaffordable selections, displays a rejection and closes cleanly', () => {
  const { bridge } = setup();
  for (const input of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) click(input);
  expect(payButton().disabled).toBe(true);
  expect(container.textContent).toContain('Not enough cash. Choose fewer repairs.');
  act(() => bridge.runtime.emit('commandRejected', { command: 'repairVehicle', reason: 'Condition changed. Inspect again.' }));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Condition changed');
  click(container.querySelector<HTMLButtonElement>('[aria-label="Close inspection"]')!);
  expect(container.querySelector('[aria-label="Talyer inspection and repair"]')).toBeNull();
});
