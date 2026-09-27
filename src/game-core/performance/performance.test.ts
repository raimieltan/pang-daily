import { describe, expect, it } from 'vitest';
import { BANWA_DALAGAN_1996 as car } from '../vehicles/catalog';
import { PRISTINE_CONDITION as pristine, resolveVehicleStats } from '../vehicles/vehicleStats';
import { vehicleConditionSchema } from '../vehicles/VehicleDefinition';
import { InventorySession } from '../inventory/InventorySession';
import { VehicleSession } from '../maintenance/VehicleSession';
import { PART_TEMPLATES } from '../parts/parts';
import { calculateVehiclePerformance, PERFORMANCE_PARTS, performancePart, performancePartSchema,
  checkPerformanceCompatibility, performanceFailureRisks, samplePerformanceFailures, type InstalledPerformancePart, type PerformancePart } from './index';

const items = (...ids: string[]): InstalledPerformancePart[] => ids.map(partId => ({ id: partId, partId, condition: 1 }));
const turboIds = ['efi_wiring', 'efi_conversion', 'turbo_oil_lines', 'used_small_turbo'];
const build = (ids: string[], condition = pristine) => calculateVehiclePerformance(car, items(...ids), condition).stats;
const context = { vehicle: car, mechanicLevel: 3, reputation: 20 };

describe('performance data and compatibility', () => {
  it('validates every example and exposes the same IDs to marketplace/inventory', () => {
    for (const part of PERFORMANCE_PARTS) {
      expect(performancePartSchema.parse(part)).toEqual(part);
      expect(PART_TEMPLATES.some(p => p.id === part.id)).toBe(true);
    }
    expect(new Set(PERFORMANCE_PARTS.map(p => p.category)).size).toBe(11);
  });
  it('rejects invalid category payloads and market ranges', () => {
    expect(performancePartSchema.safeParse({ ...performancePart('used_small_turbo'), turbo: undefined }).success).toBe(false);
    expect(performancePartSchema.safeParse({ ...performancePart('cheap_radiator'), conditionRange: [.8, .2] }).success).toBe(false);
  });
  it('blocks an EFI-only turbo on carb and cascades missing conversion dependencies', () => {
    const carb = calculateVehiclePerformance(car, items('used_small_turbo', 'turbo_oil_lines'));
    expect(carb.stats.boostBar).toBe(0);
    expect(carb.compatibility.compatible).toBe(false);
    const missing = calculateVehiclePerformance(car, items('used_small_turbo', 'efi_conversion', 'turbo_oil_lines'));
    expect(missing.stats.fuelSystem).toBe('carb');
    expect(missing.stats.boostBar).toBe(0);
  });
  it('checks mechanic/reputation only for proposed installation', () => {
    expect(checkPerformanceCompatibility(car, items(...turboIds)).compatible).toBe(true);
    expect(checkPerformanceCompatibility(car, items(...turboIds), { context: { mechanicLevel: 0, reputation: 0 } }).compatible).toBe(false);
    expect(checkPerformanceCompatibility(car, items('close_ratio_gearbox'), { context: { mechanicLevel: 3, reputation: 0 } }).compatible).toBe(false);
  });
  it('supports has-part, category, layout, chassis, and explicit incompatibility rules', () => {
    const custom: PerformancePart = { ...performancePart('cone_intake')!, requirements: [
      { kind: 'has_part', partId: 'cheap_radiator' }, { kind: 'has_category', category: 'cooling' },
      { kind: 'engine_layout', layout: 'inline_4' }, { kind: 'chassis_tag', tag: 'banwa_dalagan' },
    ] };
    const catalog = PERFORMANCE_PARTS.map(p => p.id === custom.id ? custom : p);
    expect(checkPerformanceCompatibility(car, items('cone_intake'), { catalog }).compatible).toBe(false);
    expect(checkPerformanceCompatibility(car, items('cone_intake', 'cheap_radiator'), { catalog }).compatible).toBe(true);
    custom.incompatibleParts = ['cheap_radiator'];
    expect(checkPerformanceCompatibility(car, items('cone_intake', 'cheap_radiator'), { catalog }).active).toHaveLength(0);
    custom.incompatibleParts = []; custom.requirements = [{ kind: 'engine_layout', layout: 'v8' }];
    expect(checkPerformanceCompatibility(car, items('cone_intake'), { catalog }).compatible).toBe(false);
  });
  it('rejects both duplicate slots instead of granting an order-dependent advantage', () => {
    const duplicates = items('stock_clutch', 'uprated_clutch');
    expect(checkPerformanceCompatibility(car, duplicates).active).toHaveLength(0);
    expect(build(['stock_clutch', 'uprated_clutch'])).toEqual(build(['uprated_clutch', 'stock_clutch']));
  });
  it('honors external blocks and rejects unknown/invalid-condition items', () => {
    const result = calculateVehiclePerformance(car, items(...turboIds), pristine, { compatibility: { blockedItemIds: ['efi_wiring'] } });
    expect(result.stats.boostBar).toBe(0);
    for (const condition of [null, NaN, -1, 2]) expect(checkPerformanceCompatibility(car, [{ id: 'bad', partId: 'cheap_radiator', condition }]).compatible).toBe(false);
    expect(checkPerformanceCompatibility(car, items('missing')).compatible).toBe(false);
    expect(checkPerformanceCompatibility({ ...car, tags: ['other_chassis'] }, items('cheap_radiator')).compatible).toBe(false);
  });
});

describe('calculated driving stats', () => {
  it('preserves stock power, weight and grip and distinguishes carb from EFI', () => {
    const stock = build([]), previous = resolveVehicleStats(car);
    expect(stock).toMatchObject(previous);
    const efi = build(['efi_wiring', 'efi_conversion']);
    expect(stock.fuelSystem).toBe('carb'); expect(efi.fuelSystem).toBe('efi');
    expect(efi.tuneability).toBeGreaterThan(stock.tuneability);
    expect(efi.throttleResponse).toBeGreaterThan(stock.throttleResponse);
  });
  it('swaps engine baseline and only adds the engine mass difference', () => {
    const swap = build(['surplus_16_efi', 'efi_wiring']);
    expect(swap.powerHp).toBe(125); expect(swap.torqueNm).toBe(150);
    expect(swap.weightKg).toBe(car.weight.curbKg + 10 + 3);
    expect(swap.fuelSystem).toBe('efi');
  });
  it('turbo increases pull, lag, heat, fuel demand and reliability pressure', () => {
    const stock = build([]), turbo = build(turboIds);
    for (const key of ['powerHp', 'torqueNm', 'turboLagSeconds', 'heatRate', 'fuelConsumption'] as const) expect(turbo[key]).toBeGreaterThan(stock[key]);
    expect(turbo.reliability).toBeLessThan(stock.reliability);
  });
  it('supporting parts reduce penalties; unknown ECU trades tuneability for risk', () => {
    const bare = build(turboIds), supported = build([...turboIds, 'cheap_radiator', 'uprated_clutch', 'close_ratio_gearbox']);
    expect(supported.coolingRate).toBeGreaterThan(bare.coolingRate);
    expect(supported.clutchCapacityNm).toBeGreaterThan(bare.clutchCapacityNm);
    expect(supported.transmissionCapacityNm).toBeGreaterThan(bare.transmissionCapacityNm);
    expect(supported.reliability).toBeGreaterThan(bare.reliability);
    const ecu = build([...turboIds, 'unknown_ecu']);
    expect(ecu.tuneability).toBeGreaterThan(bare.tuneability);
    expect(ecu.sketchiness).toBeGreaterThan(bare.sketchiness);
  });
  it('poor condition lowers benefits without erasing weight or penalties', () => {
    const fresh = calculateVehiclePerformance(car, items(...turboIds)).stats;
    const used = calculateVehiclePerformance(car, items(...turboIds).map(p => ({ ...p, condition: .25 }))).stats;
    expect(used.weightKg).toBe(fresh.weightKg); expect(used.powerHp).toBeLessThan(fresh.powerHp);
    expect(used.reliability).toBeLessThan(fresh.reliability); expect(used.turboLagSeconds).toBeGreaterThan(fresh.turboLagSeconds);
  });
  it('is pure, order-independent and composes wheel/body effects once', () => {
    const input = items(...turboIds), before = structuredClone(input);
    expect(calculateVehiclePerformance(car, input).stats).toEqual(calculateVehiclePerformance(car, [...input].reverse()).stats);
    expect(input).toEqual(before);
    const modified = calculateVehiclePerformance(car, input, pristine, { modifiers: { addedWeightKg: 20, grip: 1.1, braking: .9, acceleration: 1.05 } }).stats;
    expect(modified.weightKg).toBe(build(turboIds).weightKg + 20);
    expect(modified.tireGrip).toBe(1.1); expect(modified.acceleration).toBe(1.05);
  });
});

describe('warnings and future talyer flow', () => {
  it('reports all six consequence hooks without changing condition', () => {
    const worn = { ...pristine, engine: .2, transmission: .2, clutch: .1, cooling: .2 };
    const before = { ...worn };
    const stats = build([...turboIds, 'unknown_ecu'], worn);
    const warnings = performanceFailureRisks(stats, worn, { throttle: 1, speedMps: 0 }, 60);
    expect(new Set(warnings.map(w => w.kind)).size).toBe(6);
    expect(samplePerformanceFailures(warnings, () => 0)).toHaveLength(6);
    expect(samplePerformanceFailures(warnings, () => .99999)).toHaveLength(0);
    expect(worn).toEqual(before);
  });
  it('cooling and clutch supports clear or reduce warnings', () => {
    const warnings = (ids: string[]) => performanceFailureRisks(build(ids), pristine, { throttle: 1, speedMps: 20 });
    expect(warnings(turboIds).some(w => w.kind === 'clutch_slip')).toBe(true);
    const supported = warnings([...turboIds, 'uprated_clutch', 'cheap_radiator']);
    expect(supported.some(w => w.kind === 'clutch_slip')).toBe(false);
    const heat = (values: ReturnType<typeof warnings>) => values.find(w => w.kind === 'overheating')?.severity ?? 0;
    expect(heat(supported)).toBeLessThan(heat(warnings(turboIds)));
    expect(warnings([])).toEqual([]);
  });
  it('uses elapsed-time hazard, zero dt cannot trigger events, rules are tunable', () => {
    const stats = build(turboIds), load = { throttle: 1, speedMps: 20 };
    const one = performanceFailureRisks(stats, pristine, load, 1)[0];
    const two = performanceFailureRisks(stats, pristine, load, 2)[0];
    expect(two.probability).toBeCloseTo(1 - (1 - one.probability) ** 2);
    expect(samplePerformanceFailures(performanceFailureRisks(stats, pristine, load, 0), () => 0)).toEqual([]);
    expect(performanceFailureRisks(stats, pristine, load, 60, [])).toEqual([]);
  });
  it('defaults added conditions when loading existing session saves', () => {
    const legacy = { ...pristine } as Partial<typeof pristine>; delete legacy.clutch; delete legacy.cooling;
    expect(vehicleConditionSchema.parse(legacy)).toMatchObject({ clutch: 1, cooling: 1 });
    const session = new VehicleSession(); session.ensureVehicle(car);
    const saved = session.snapshot(); Object.assign(saved.vehicles[car.id], { condition: legacy });
    const restored = new VehicleSession(saved);
    expect(restored.summary(car).condition.clutch).toBe(1);
    expect(restored.snapshot().walletPhp).toBe(saved.walletPhp);
  });
  it('validates installs atomically, preserves actual condition and round-trips inventory', () => {
    const inventory = new InventorySession();
    const add = (partId: string) => {
      const result = inventory.add({ partId, condition: .7, origin: { kind: 'grant', reason: 'test' } });
      if ('rejected' in result) throw new Error(result.rejected);
      return result;
    };
    const conversion = add('efi_conversion');
    expect(inventory.install(car.id, conversion.id, context)).toHaveProperty('rejected');
    expect(inventory.installedOn(car.id)).toEqual({});
    const wiring = add('efi_wiring');
    expect(inventory.install(car.id, wiring.id)).toHaveProperty('rejected');
    expect(inventory.install(car.id, wiring.id, context)).toHaveProperty('installation');
    expect(inventory.install(car.id, conversion.id, context)).toHaveProperty('installation');
    const restored = new InventorySession(inventory.snapshot());
    expect(restored.installedOn(car.id)).toEqual(inventory.installedOn(car.id));
    expect(restored.item(conversion.id)?.condition).toBe(.7);
  });
});
