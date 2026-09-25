// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GameBridge } from '@/game/bridge';
import { FuelSystem } from '@/game/maintenance/FuelSystem';
import { MaintenanceSystem } from '@/game/maintenance/MaintenanceSystem';
import { VehicleSession } from '@/game-core/maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { FuelPanel } from './FuelPanel';
import type { InteractionHandler } from '@/game/interaction/InteractionSystem';

const cleanup: (() => void)[] = [];
/** React tracks controlled values through the native setter, so assign via the prototype before dispatching. */
function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
afterEach(() => { cleanup.splice(0).reverse().forEach(off => off()); vi.unstubAllGlobals(); });
function setup(cash = 5000) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const bridge = new GameBridge(), session = new VehicleSession(); session.consumeFuel(car, 10);
  if (cash < 5000) session.spend(5000 - cash, { kind: 'fee', source: 'test', description: 'Test' });
  const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
  const unbind = bindMaintenanceStore(bridge.ui.events), unbindUi = bindGameUiStore(bridge.ui);
  const maintenance = new MaintenanceSystem(bridge.runtime, session, {
    definition: { spec: car }, impactSerial: 0, impactStrength: 0, setCondition() {},
    maintenanceSample: () => ({ speedMps: 0, throttle: 0, brake: 0, slip: 0, handbrake: 0, grounded: true, racing: false }),
  }, () => false);
  let open: InteractionHandler | undefined;
  const fuel = new FuelSystem(bridge.runtime, session, car, { rejection: () => null, interactions: { handle: (_action, handler) => { open = handler; return () => {}; } } });
  act(() => { open!({ id: 'pump', action: 'refuel', label: 'Refuel', area: { kind: 'circle', x: 0, z: 0, radius: 1 } }); root.render(<FuelPanel />); });
  cleanup.push(() => { act(() => root.unmount()); fuel.dispose(); maintenance.dispose(); unbind(); unbindUi(); bridge.dispose(); div.remove(); });
  const button = (prefix: string) => Array.from(div.querySelectorAll('button')).find(b => b.textContent?.startsWith(prefix))!;
  return { div, session, button };
}
it('buys a peso budget, shows a receipt and lets the player close', () => {
  const s = setup();
  act(() => {
    change(s.div.querySelector('select')!, 'budgetPhp');
    change(s.div.querySelector('input')!, '130');
  });
  act(() => s.button('Get price').click());
  expect(s.div.textContent).toContain('Quoted fuel: 2.000 L');
  act(() => s.button('Pay ').click());
  expect(s.div.textContent).toContain('Added 2.000 L. Paid ₱130.00.');
  expect(s.session.summary(car)).toMatchObject({ walletPhp: 4870, fuelLiters: 37 });
  expect(s.button('Pay ')).toBeUndefined();
  act(() => s.button('Close').click()); expect(s.div.textContent).toBe('');
});
it('disables unaffordable payment and handles a full tank', () => {
  const poor = setup(50); act(() => poor.button('Fill tank').click());
  expect(poor.button('Pay ').disabled).toBe(true);
  expect(poor.div.textContent).toContain('Not enough cash');
});
it('fills to capacity and removes purchase controls once full', () => {
  const s = setup(); act(() => s.button('Fill tank').click()); act(() => s.button('Pay ').click());
  expect(s.div.textContent).toContain('Tank is full'); expect(s.div.querySelector('form')).toBeNull();
  expect(s.session.summary(car)).toMatchObject({ fuelLiters: 45, walletPhp: 4350 });
});
