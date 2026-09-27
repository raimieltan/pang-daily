import { performancePartSchema, type EngineDefinition, type PerformancePart } from './schema';

export const STOCK_CARB_ENGINE: EngineDefinition = { id: 'banwa_15_carb', displacementCc: 1493, layout: 'inline_4', aspiration: 'naturally_aspirated', fuelSystem: 'carb', basePowerHp: 98, baseTorqueNm: 130, weightKg: 115, reliability: .8, heatOutput: 1 };
const part = (data: Pick<PerformancePart, 'id' | 'name' | 'category' | 'effects'> & Partial<PerformancePart>): PerformancePart => performancePartSchema.parse({
  slot: data.category, priceRangePhp: [1500, 3000], conditionRange: [.3, .85], rarity: 'common',
  compatibleTags: ['banwa_dalagan'], requiredParts: [], incompatibleParts: [], requirements: [], sketchiness: .05, ...data,
});

export const USED_PERFORMANCE_PARTS: readonly PerformancePart[] = [
  part({ id: 'stock_carb_engine', name: 'Dalagan 1.5 carb long block, pulled running', category: 'engine', engine: STOCK_CARB_ENGINE, priceRangePhp: [8000, 14000], effects: {} }),
  part({ id: 'surplus_16_efi', name: 'Surplus 1.6 EFI long block, compression untested', category: 'engine', engine: { ...STOCK_CARB_ENGINE, id: 'banwa_16_efi', displacementCc: 1590, fuelSystem: 'efi', basePowerHp: 125, baseTorqueNm: 150, weightKg: 125, reliability: .85, heatOutput: 1.12 }, priceRangePhp: [22000, 35000], rarity: 'uncommon', requiredParts: ['efi_wiring'], requirements: [{ kind: 'mechanic_level', minimum: 2 }], sketchiness: .18, effects: {} }),
  part({ id: 'efi_wiring', name: 'Surplus EFI harness and fuel pump', category: 'supporting_mod', slot: 'fuel_support', effects: { weightKg: 3 }, priceRangePhp: [2500, 4500] }),
  part({ id: 'efi_conversion', name: 'EFI conversion: manifold, injectors, sensors', category: 'fuel_system', fuelSystem: 'efi', requiredParts: ['efi_wiring'], requirements: [{ kind: 'engine_layout', layout: 'inline_4' }, { kind: 'mechanic_level', minimum: 2 }], effects: { weightKg: 4, throttleResponse: .08 }, priceRangePhp: [6500, 11000], rarity: 'uncommon' }),
  part({ id: 'used_small_turbo', name: 'Used small turbo, welded manifold and lines', category: 'turbo', turbo: { boostBar: .55, spoolSeconds: .65, supportedFuelSystems: ['efi'] }, requiredParts: ['turbo_oil_lines'], requirements: [{ kind: 'fuel_system', fuelSystem: 'efi' }, { kind: 'mechanic_level', minimum: 2 }], priceRangePhp: [9000, 16000], rarity: 'uncommon', sketchiness: .25, effects: { weightKg: 13 } }),
  part({ id: 'turbo_oil_lines', name: 'Talyer oil feed and return fittings', category: 'supporting_mod', slot: 'turbo_support', effects: { weightKg: 1, reliability: .02 } }),
  part({ id: 'cheap_radiator', name: 'Two-row surplus radiator, repaired neck', category: 'cooling', effects: { coolingRate: .65, weightKg: 2 }, priceRangePhp: [1800, 3500], sketchiness: .12 }),
  part({ id: 'unknown_ecu', name: 'Rechipped ECU, unknown map', category: 'ecu', requirements: [{ kind: 'fuel_system', fuelSystem: 'efi' }], effects: { tuneability: .3, powerFraction: .05, heatRate: -.08 }, sketchiness: .4, priceRangePhp: [3500, 6500] }),
  part({ id: 'stock_clutch', name: 'Stock clutch, may kapit pa', category: 'clutch', effects: {}, priceRangePhp: [800, 1500] }),
  part({ id: 'uprated_clutch', name: 'Used heavy-duty clutch and pressure plate', category: 'clutch', effects: { clutchCapacityNm: 130, throttleResponse: -.03 }, priceRangePhp: [4000, 6500], rarity: 'uncommon' }),
  part({ id: 'close_ratio_gearbox', name: 'Surplus close-ratio five-speed', category: 'transmission', slot: 'gearbox', effects: { transmissionCapacityNm: 100, weightKg: 5 }, priceRangePhp: [12000, 18000], rarity: 'rare', requirements: [{ kind: 'reputation', minimum: 10 }] }),
  part({ id: 'used_lsd', name: 'Used helical differential', category: 'differential', effects: { weightKg: 3, reliability: -.02 }, priceRangePhp: [9000, 14000], rarity: 'rare' }),
  part({ id: 'cone_intake', name: 'Cone filter with improvised heat shield', category: 'intake', effects: { powerFraction: .025, throttleResponse: .03, heatRate: .03 } }),
  part({ id: 'talyer_exhaust', name: 'Talyer two-inch exhaust, patched welds', category: 'exhaust', effects: { powerFraction: .04, torqueFraction: .02, weightKg: -3 }, priceRangePhp: [2000, 4000] }),
];
export const NEW_PART_NAMES: Record<string, string> = {
  stock_carb_engine: 'New Dalagan 1.5 carb long block', surplus_16_efi: 'New Dalagan 1.6 EFI long block',
  efi_wiring: 'New EFI harness and fuel pump', efi_conversion: 'New EFI conversion kit',
  used_small_turbo: 'New small turbo kit', turbo_oil_lines: 'New turbo oil feed and return fittings',
  cheap_radiator: 'New two-row radiator', unknown_ecu: 'New programmable ECU with base map',
  stock_clutch: 'New stock-spec clutch', uprated_clutch: 'New heavy-duty clutch and pressure plate',
  close_ratio_gearbox: 'New close-ratio five-speed gearbox', used_lsd: 'New helical differential',
  cone_intake: 'New cone intake with heat shield', talyer_exhaust: 'New two-inch exhaust',
};
export const NEW_PART_PRICE_MULTIPLIER = 5;
/** Fixed reference: midpoint of the corresponding used Marketplace template's price range. */
export const newPartPrice = (used: PerformancePart) => NEW_PART_PRICE_MULTIPLIER * (used.priceRangePhp[0] + used.priceRangePhp[1]) / 2;
export const NEW_PERFORMANCE_PARTS: readonly PerformancePart[] = USED_PERFORMANCE_PARTS.map(used => performancePartSchema.parse({
  ...used, id: `new_${used.id}`, name: NEW_PART_NAMES[used.id], satisfiesParts: [used.id],
  priceRangePhp: [newPartPrice(used), newPartPrice(used)], conditionRange: [1, 1], sketchiness: 0,
}));
export const PERFORMANCE_PARTS: readonly PerformancePart[] = [...USED_PERFORMANCE_PARTS, ...NEW_PERFORMANCE_PARTS];
export const performancePart = (id: string): PerformancePart | undefined => PERFORMANCE_PARTS.find(p => p.id === id);
