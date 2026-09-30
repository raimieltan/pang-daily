// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
const fireEvent = { click: (element: Element) => (element as HTMLElement).click(), change: (element: Element, event: {target: {value: string}}) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, event.target.value);
  element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
} };
import { GameBridge } from '@/game/bridge';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import { vehicleSuspensionBaseline } from '@/game-core/suspension/baseline';
import { createSuspension } from '@/game-core/suspension/schema';
import { SuspensionSolver } from '@/game-core/suspension/solver';
import { damageCorner } from '@/game-core/suspension/service';
import { CustomizationSystem } from '@/game/vehicles/CustomizationSystem';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { calculateFitment } from '@/game-core/wheels';
import { TalyerSetupPanel } from './TalyerSetupPanel';
it('tunes individual corners, previews and persists damage without alignment healing bent parts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const bridge = new GameBridge(), inventory = new InventorySession(), baseline = vehicleSuspensionBaseline(car);
  const solver = new SuspensionSolver(baseline, createSuspension(baseline)); let preview = 'off';
  const releases = [bindGameUiStore(bridge.ui), bindMaintenanceStore(bridge.ui.events)];
  const system = new CustomizationSystem(bridge.runtime, inventory, {
    id: car.id, definition: { spec: car }, fitment: calculateFitment(car, car.wheels.stock, 0), setAppearance() {},
    suspension: solver, get suspensionTelemetry() { return solver.snapshot(); }, get suspensionPreview() { return preview; },
    setSuspension(saved) { solver.saved = structuredClone(saved); }, previewSuspension(mode) { preview = mode; },
  }, () => null);
  const container = document.createElement('div'), root = createRoot(container); document.body.append(container);
  const find = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(<TalyerSetupPanel section="suspension" />));
    expect(container.textContent).toContain('Suspension workshop');
    await act(async () => fireEvent.change(container.querySelector('[aria-label="Suspension kit"]')!, { target: { value: 'race' } }));
    await act(async () => find('Alignment').click());
    await act(async () => fireEvent.change(container.querySelector('[aria-label="Front Camber"]')!, { target: { value: '-4' } }));
    expect(solver.saved.setup.corners[0].camber).toBeCloseTo(-4 * Math.PI / 180);
    expect(solver.saved.setup.corners[1].camber).toBeCloseTo(-4 * Math.PI / 180);
    await act(async () => fireEvent.click(container.querySelector('input[type="checkbox"]')!));
    await act(async () => fireEvent.change(container.querySelector('[aria-label="FL Toe"]')!, { target: { value: '-1' } }));
    expect(solver.saved.setup.corners[0].toe).not.toBe(solver.saved.setup.corners[1].toe);
    await act(async () => find('Simulate braking').click()); expect(preview).toBe('braking');
    const before = structuredClone(solver.saved); expect(inventory.suspension(car.id)?.damage).toEqual(before.damage);
    damageCorner(solver.saved, 0, 4500, 1);
    await act(async () => system.update(2.1));
    await act(async () => find('Damage').click());
    await act(async () => find('Align FL').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('CANNOT REACH TARGET');
    const restored = new InventorySession(inventory.snapshot()); expect(restored.suspension(car.id)).toEqual(solver.saved);
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7);
  } finally { act(() => root.unmount()); system.dispose(); releases.forEach(off => off()); bridge.dispose(); container.remove(); vi.unstubAllGlobals(); }
});
