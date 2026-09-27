import { PART_PRICE_RANGES } from '../economy/balance';
import { z } from 'zod';
import { EXTERIOR_SLOTS, type ExteriorSlot } from '../vehicles/VehicleDefinition';
import type { ServiceComponent } from '../maintenance/condition';
import { WHEEL_PARTS, wheelPart } from '../wheels/catalog';
import { BODY_PARTS, bodyPart } from '../exterior/catalog';
import { PERFORMANCE_PARTS, NEW_PERFORMANCE_PARTS } from '../performance/catalog';
import type { PerformanceCategory } from '../performance/schema';

/**
 * Equip slots on an owned car. Exterior slots are the vehicle schema's `EXTERIOR_SLOTS` (the
 * model's attachment points); the rest are wheel/performance/interior positions. A part fills one
 * or more slots — a headlight pair takes both sides, coilovers replace shocks and springs.
 */
export const PERFORMANCE_SLOTS = ['wheels', 'tires', 'shocks', 'springs', 'brakes_front', 'alternator', 'cylinder_head', 'gearbox', 'clutch', 'seat_driver', 'engine', 'fuel_system', 'intake', 'turbo', 'cooling', 'ecu', 'differential', 'fuel_support', 'turbo_support'] as const;
export const PART_SLOTS = [...PERFORMANCE_SLOTS, ...EXTERIOR_SLOTS] as const;
export type PartSlot = typeof PERFORMANCE_SLOTS[number] | ExteriorSlot;
export type PartCategory = 'wheels' | 'tires' | 'suspension' | 'brakes' | 'drivetrain' | 'body' | 'lighting' | 'interior' | PerformanceCategory;

/**
 * Part definitions (TECH_ARCHITECTURE §17), shared by the marketplace, inventory and later the
 * garage. Prices are PHP for a used part at 100%; `conditionRange` bounds the condition a
 * generated copy can roll. `component` links the part to the wear system it will replace on install.
 */
export type PartTemplate = {
  marketplaceAvailable?: boolean;
  compatibleVehicleIds?: readonly string[];
  id: string; name: string; category: PartCategory; fits: string; component: ServiceComponent | null;
  slots: readonly PartSlot[]; priceRange: readonly [number, number]; conditionRange: readonly [number, number]; weight: number;
};

/** Wheel sets are defined in `game-core/wheels`; this is their listing entry. `weight` = listing frequency. */
function wheels(id: string, weight: number): PartTemplate {
  const part = wheelPart(id);
  if (!part) throw new Error(`Unknown wheel part "${id}"`);
  return { id, name: part.name, category: 'wheels', fits: part.fits, component: null, slots: ['wheels'],
    priceRange: part.market.priceRangePhp, conditionRange: part.market.conditionRange, weight };
}

/** Body parts are defined in `game-core/exterior`; this is their listing entry, on the part's socket. */
function body(id: string, weight: number): PartTemplate {
  const part = bodyPart(id);
  if (!part) throw new Error(`Unknown body part "${id}"`);
  return { id, name: part.name, category: 'body', fits: part.fits, component: null, slots: [part.socket],
    priceRange: part.market.priceRangePhp, conditionRange: part.market.conditionRange, weight };
}

export const PART_TEMPLATES: readonly PartTemplate[] = [
  ...PERFORMANCE_PARTS.map((part): PartTemplate => {
    if (!(PART_SLOTS as readonly string[]).includes(part.slot)) throw new Error(`Unknown performance slot: ${part.slot}`);
    return { id: part.id, name: part.name, category: part.category, fits: part.compatibleTags.join(', '),
      component: null, slots: [part.slot as PartSlot], priceRange: part.priceRangePhp, conditionRange: part.conditionRange,
      marketplaceAvailable: !NEW_PERFORMANCE_PARTS.some(p => p.id === part.id),
      weight: part.rarity === 'rare' ? 1 : part.rarity === 'uncommon' ? 2 : 3 };
  }),
  { id: 'used_coilovers_01', name: 'Used coilovers (adjustable)', category: 'suspension', fits: 'Most 90s sedans', component: 'suspension', slots: ['shocks', 'springs'], priceRange: PART_PRICE_RANGES.parts_used_coilovers_01, conditionRange: [.35, .85], weight: 2 },
  { id: 'stock_shocks_set', compatibleVehicleIds: ['banwa_dalagan_1996'], name: 'Stock shocks, set of 4', category: 'suspension', fits: 'Banwa Dalagan', component: 'suspension', slots: ['shocks'], priceRange: PART_PRICE_RANGES.parts_stock_shocks_set, conditionRange: [.3, .9], weight: 3 },
  { id: 'lowering_springs', name: 'Lowering springs', category: 'suspension', fits: 'Universal-ish', component: 'suspension', slots: ['springs'], priceRange: PART_PRICE_RANGES.parts_lowering_springs, conditionRange: [.45, .95], weight: 2 },
  wheels('mags_15_4x100', 3),
  wheels('steelies_14', 2),
  { id: 'tires_195_55', name: 'Tires 195/55 R15, 4 pcs', category: 'tires', fits: '15" rims', component: 'tires', slots: ['tires'], priceRange: PART_PRICE_RANGES.parts_tires_195_55, conditionRange: [.2, .85], weight: 3 },
  { id: 'brake_pads_front', compatibleVehicleIds: ['banwa_dalagan_1996'], name: 'Front brake pads + rotors', category: 'brakes', fits: 'Banwa Dalagan', component: 'brakes', slots: ['brakes_front'], priceRange: PART_PRICE_RANGES.parts_brake_pads_front, conditionRange: [.25, .9], weight: 3 },
  { id: 'surplus_alternator', compatibleVehicleIds: ['banwa_dalagan_1996'], name: 'Japan surplus alternator', category: 'engine', fits: '4A / 4E family', component: 'engine', slots: ['alternator'], priceRange: PART_PRICE_RANGES.parts_surplus_alternator, conditionRange: [.2, .9], weight: 2 },
  { id: 'surplus_head', compatibleVehicleIds: ['banwa_dalagan_1996'], name: 'Surplus cylinder head', category: 'engine', fits: '4A family', component: 'engine', slots: ['cylinder_head'], priceRange: PART_PRICE_RANGES.parts_surplus_head, conditionRange: [.15, .85], weight: 1 },
  { id: 'gearbox_5spd', compatibleVehicleIds: ['banwa_dalagan_1996'], name: '5-speed manual gearbox', category: 'drivetrain', fits: 'Banwa Dalagan', component: 'transmission', slots: ['gearbox'], priceRange: PART_PRICE_RANGES.parts_gearbox_5spd, conditionRange: [.2, .85], weight: 1 },
  { id: 'clutch_kit', compatibleVehicleIds: ['banwa_dalagan_1996'], name: 'Clutch kit (disc + pressure plate)', category: 'drivetrain', fits: 'Banwa Dalagan', component: 'transmission', slots: ['clutch'], priceRange: PART_PRICE_RANGES.parts_clutch_kit, conditionRange: [.3, .95], weight: 2 },
  { id: 'muffler_canister', name: 'Canister muffler', category: 'exhaust', fits: '2" pipe', component: null, slots: ['exhaust'], priceRange: PART_PRICE_RANGES.parts_muffler_canister, conditionRange: [.4, 1], weight: 2 },
  { id: 'projector_headlights', name: 'Projector headlights, pair', category: 'lighting', fits: 'Banwa Dalagan', component: null, slots: ['headlight_l', 'headlight_r'], priceRange: PART_PRICE_RANGES.parts_projector_headlights, conditionRange: [.35, .95], weight: 2 },
  { id: 'bucket_seat', name: 'Bucket seat w/ rails', category: 'interior', fits: 'Universal rails', component: null, slots: ['seat_driver'], priceRange: PART_PRICE_RANGES.parts_bucket_seat, conditionRange: [.35, .9], weight: 1 },
  wheels('oversized_17_deep_dish', 1),
  body('universal_rubber_lip', 3),
  body('acp_chin_splitter', 2),
  body('dalagan_fiberglass_skirts', 1),
  body('dalagan_ducktail', 2),
  body('marketplace_gt_wing', 2),
  body('dalagan_primer_bumper', 2),
  body('evo_type_front_bumper', 1),
  body('dalagan_red_fender_fl', 2),
  body('vented_carbon_look_hood', 1),
];

const byId = new Map(PART_TEMPLATES.map(part => [part.id, part]));
if (WHEEL_PARTS.some(part => !byId.has(part.id))) throw new Error('Every wheel part needs a PART_TEMPLATES entry');
if (BODY_PARTS.some(part => !byId.has(part.id))) throw new Error('Every body part needs a PART_TEMPLATES entry');
export const partDefinition = (id: string): PartTemplate | undefined => byId.get(id);
export const partIdSchema = z.string().refine(id => byId.has(id), 'unknown part');
