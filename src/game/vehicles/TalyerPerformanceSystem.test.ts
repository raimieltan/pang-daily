import { afterEach, expect, it } from 'vitest';
import { GameBridge } from '../bridge';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { BANWA_DALAGAN_1996 as car } from '../../game-core/vehicles/catalog';
import { emptyLoss } from '../../game-core/maintenance/condition';
import { TalyerPerformanceSystem, type PerformanceQuote, type PerformanceReceipt, type PerformanceWorkshopView } from './TalyerPerformanceSystem';
import { PerformanceSystem } from './PerformanceSystem';
import { calculateVehiclePerformance } from '../../game-core/performance/calculator';
import { bodyPart, exteriorEffects, resolveBodyPartLook } from '../../game-core/exterior';
import { wheelPart, wheelModifiers } from '../../game-core/wheels';
import { combineModifiers } from '../../game-core/vehicles/vehicleStats';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(off => off()));
function setup() {
  const bridge = new GameBridge(), inventory = new InventorySession(), session = new VehicleSession();
  let rejection: string | null = null;
  const views: { view: PerformanceWorkshopView | null; quote: PerformanceQuote | null; receipt: PerformanceReceipt | null; errors: string[] } = { view: null, quote: null, receipt: null, errors: [] };
  bridge.ui.events.on('performanceWorkshop', view => { views.view = view; });
  bridge.ui.events.on('performanceQuote', quote => { views.quote = quote; });
  bridge.ui.events.on('performanceInstalled', receipt => { views.receipt = receipt; });
  bridge.ui.events.on('commandRejected', ({ reason }) => views.errors.push(reason));
  const system = new TalyerPerformanceSystem(bridge.runtime, inventory, session, car, () => rejection);
  cleanup.push(() => bridge.dispose(), () => system.dispose());
  const add = (partId: string, known = true, condition = .8) => {
    const result = inventory.add({ partId, condition, origin: { kind: 'grant', reason: 'test' }, revealedBy: known ? 'known' : null });
    if ('rejected' in result) throw new Error(result.rejected);
    return result.id;
  };
  const install = (itemId: string) => { bridge.ui.commands.quotePerformancePart(itemId, 'install'); if (views.quote) bridge.ui.commands.installPerformancePart(views.quote.id); };
  return { bridge, inventory, session, system, views, add, install, commands: bridge.ui.commands, setAccess: (value: string | null) => { rejection = value; } };
}

it('quotes without mutations, charges exact labor once, syncs final stats and persists installed items', () => {
  const s = setup(), id = s.add('cone_intake');
  let stats = calculateVehiclePerformance(car).stats;
  const runtime = new PerformanceSystem(s.inventory, { id: car.id, setPerformanceParts: parts => { stats = calculateVehiclePerformance(car, parts).stats; } });
  cleanup.push(() => runtime.dispose());
  const before = s.inventory.snapshot();
  s.commands.quotePerformancePart(id, 'install');
  expect(s.inventory.snapshot()).toEqual(before); expect(s.session.snapshot().walletPhp).toBe(5000);
  expect(s.views.quote!.after.powerHp).toBeGreaterThan(s.views.quote!.before.powerHp);
  const quote = s.views.quote!;
  s.commands.installPerformancePart(quote.id); s.commands.installPerformancePart(quote.id);
  expect(s.session.snapshot().walletPhp).toBe(4750);
  expect(s.session.snapshot().transactions.filter(tx => tx.kind === 'performance_labor')).toHaveLength(1);
  expect(s.inventory.installedOn(car.id).intake).toBe(id);
  expect(stats.powerHp).toBeGreaterThan(car.power.peakPowerHp);
  expect(s.views.receipt).toMatchObject({ laborPhp: 250, operation: 'install' });
  expect(new InventorySession(s.inventory.snapshot()).installedOn(car.id).intake).toBe(id);
  expect(new VehicleSession(s.session.snapshot()).snapshot().walletPhp).toBe(4750);
});

it('never exposes unknown condition or previews it until inspected', () => {
  const s = setup(), id = s.add('cheap_radiator', false, .1234);
  expect(s.views.view!.parts[0]).toMatchObject({ condition: null, inspected: false });
  expect(JSON.stringify(s.views.view)).not.toContain('.1234');
  s.commands.quotePerformancePart(id, 'install');
  expect(s.views.quote).toBeNull(); expect(s.views.errors.at(-1)).toMatch(/inspect/);
  s.inventory.reveal(id, 'mechanic'); s.commands.quotePerformancePart(id, 'install');
  expect(s.views.quote).not.toBeNull();
  expect(s.views.view!.parts[0].condition).toBe(.1234);
});

it('reports supports, refuses invalid installs without charging and prevents dependent support removal', () => {
  const s = setup(), conversion = s.add('efi_conversion');
  s.commands.quotePerformancePart(conversion, 'install');
  expect(s.views.errors.at(-1)).toMatch(/harness/);
  expect(s.session.snapshot().walletPhp).toBe(5000);
  const wiring = s.add('efi_wiring'); s.install(wiring); s.install(conversion);
  expect(s.inventory.installedOn(car.id).fuel_system).toBe(conversion);
  const balance = s.session.snapshot().walletPhp;
  s.commands.quotePerformancePart(wiring, 'remove');
  expect(s.views.quote).toBeNull(); expect(s.views.errors.at(-1)).toMatch(/harness/);
  expect(s.session.snapshot().walletPhp).toBe(balance);
  s.commands.quotePerformancePart(conversion, 'remove'); s.commands.installPerformancePart(s.views.quote!.id);
  expect(s.inventory.installedOn(car.id).fuel_system).toBeUndefined();
  expect(s.inventory.item(conversion)).toBeDefined();
  expect(s.views.receipt).toMatchObject({ laborPhp: 900, operation: 'remove' });
});

it('replaces same-slot parts while keeping the old item owned', () => {
  const s = setup(), first = s.add('cone_intake'), replacement = s.add('cone_intake', true, .95);
  s.install(first); s.commands.quotePerformancePart(replacement, 'install');
  expect(s.views.quote!.displaced).toHaveLength(1);
  s.commands.installPerformancePart(s.views.quote!.id);
  expect(s.inventory.installation(first)).toBeNull(); expect(s.inventory.item(first)).toBeDefined();
  expect(s.inventory.installedOn(car.id).intake).toBe(replacement);
});

it('previews the same wheel, body and condition modifiers used by the driving calculator', () => {
  const s = setup(), wheelId = s.add('mags_15_4x100'), wingId = s.add('marketplace_gt_wing'), intake = s.add('cone_intake');
  s.inventory.install(car.id, wheelId); s.inventory.install(car.id, wingId);
  s.commands.quotePerformancePart(intake, 'install');
  const wing = bodyPart('marketplace_gt_wing')!;
  const modifiers = combineModifiers(wheelModifiers(car, wheelPart('mags_15_4x100')!, .8), exteriorEffects([
    { part: wing, look: resolveBodyPartLook(wing, { condition: .8, finish: null, bodyColor: car.visual.defaultPaint, vehicleTags: car.tags }) },
  ]).modifiers);
  const expected = calculateVehiclePerformance(car, [s.inventory.item(intake)!], s.session.summary(car).condition, { modifiers });
  expect(s.views.quote!.after).toEqual(expected.stats);
});

it('insufficient funds and changes after a quote never charge or move inventory', () => {
  const s = setup(), id = s.add('cone_intake');
  s.commands.quotePerformancePart(id, 'install'); const quote = s.views.quote!;
  s.session.spend(4900, { kind: 'fee', source: 'test', description: 'Other expense' });
  s.commands.installPerformancePart(quote.id);
  expect(s.views.errors.at(-1)).toMatch(/money/); expect(s.inventory.installedOn(car.id)).toEqual({});
  expect(s.session.snapshot().walletPhp).toBe(100);
  s.session.earn(1000, { kind: 'job', source: 'test', description: 'Payday' });
  s.commands.quotePerformancePart(id, 'install'); const fresh = s.views.quote!;
  s.session.wear(car, { ...emptyLoss(), engine: .01 });
  expect(s.views.quote).toBeNull(); s.commands.installPerformancePart(fresh.id);
  expect(s.inventory.installedOn(car.id)).toEqual({}); expect(s.session.snapshot().walletPhp).toBe(1100);
  s.commands.quotePerformancePart(id, 'install'); const last = s.views.quote!;
  s.inventory.remove(id); s.commands.installPerformancePart(last.id);
  expect(s.session.snapshot().walletPhp).toBe(1100);
});

it('rechecks workshop access, other-car ownership, reputation and scene lifecycle', () => {
  const s = setup(), id = s.add('cone_intake');
  s.setAccess('Park at the talyer.'); s.commands.quotePerformancePart(id, 'install');
  expect(s.views.errors.at(-1)).toBe('Park at the talyer.');
  s.setAccess(null); s.commands.quotePerformancePart(id, 'install'); const quote = s.views.quote!;
  s.setAccess('Get out first.'); s.commands.installPerformancePart(quote.id);
  expect(s.views.errors.at(-1)).toBe('Get out first.'); expect(s.session.snapshot().walletPhp).toBe(5000);
  s.setAccess(null);
  s.inventory.install('other_car', id, { vehicle: { ...car, id: 'other_car' }, mechanicLevel: 2, reputation: 0 });
  s.commands.quotePerformancePart(id, 'install'); expect(s.views.errors.at(-1)).toMatch(/another car/);
  const gearbox = s.add('close_ratio_gearbox'); s.commands.quotePerformancePart(gearbox, 'install');
  expect(s.views.errors.at(-1)).toMatch(/reputation 10/);
  s.system.dispose(); expect(s.views.view).toBeNull(); expect(s.views.quote).toBeNull();
});
