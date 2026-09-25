import { z } from 'zod';
import { EXTERIOR_SLOTS, type ExteriorSlot } from '../vehicles/VehicleDefinition';
import type { ServiceComponent } from '../maintenance/condition';

/**
 * Equip slots on an owned car. Exterior slots are the vehicle schema's `EXTERIOR_SLOTS` (the
 * model's attachment points); the rest are wheel/performance/interior positions. A part fills one
 * or more slots — a headlight pair takes both sides, coilovers replace shocks and springs.
 */
export const PERFORMANCE_SLOTS = ['wheels', 'tires', 'shocks', 'springs', 'brakes_front', 'alternator', 'cylinder_head', 'gearbox', 'clutch', 'seat_driver'] as const;
export const PART_SLOTS = [...PERFORMANCE_SLOTS, ...EXTERIOR_SLOTS] as const;
export type PartSlot = typeof PERFORMANCE_SLOTS[number] | ExteriorSlot;
export type PartCategory = 'wheels' | 'tires' | 'suspension' | 'brakes' | 'engine' | 'drivetrain' | 'exhaust' | 'lighting' | 'interior';

/**
 * Part definitions (TECH_ARCHITECTURE §17), shared by the marketplace, inventory and later the
 * garage. Prices are PHP for a used part at 100%; `conditionRange` bounds the condition a
 * generated copy can roll. `component` links the part to the wear system it will replace on install.
 */
export type PartTemplate = {
  id: string; name: string; category: PartCategory; fits: string; component: ServiceComponent | null;
  slots: readonly PartSlot[]; priceRange: readonly [number, number]; conditionRange: readonly [number, number]; weight: number;
};

export const PART_TEMPLATES: readonly PartTemplate[] = [
  { id: 'used_coilovers_01', name: 'Used coilovers (adjustable)', category: 'suspension', fits: 'Most 90s sedans', component: 'suspension', slots: ['shocks', 'springs'], priceRange: [6500, 9000], conditionRange: [.35, .85], weight: 2 },
  { id: 'stock_shocks_set', name: 'Stock shocks, set of 4', category: 'suspension', fits: 'Banwa Dalagan', component: 'suspension', slots: ['shocks'], priceRange: [1800, 2600], conditionRange: [.3, .9], weight: 3 },
  { id: 'lowering_springs', name: 'Lowering springs', category: 'suspension', fits: 'Universal-ish', component: 'suspension', slots: ['springs'], priceRange: [2500, 3800], conditionRange: [.45, .95], weight: 2 },
  { id: 'mags_15_4x100', name: '15" mags 4x100', category: 'wheels', fits: '4x100 PCD', component: null, slots: ['wheels'], priceRange: [7000, 11000], conditionRange: [.4, .95], weight: 3 },
  { id: 'steelies_14', name: '14" steel wheels w/ caps', category: 'wheels', fits: '4x100 PCD', component: null, slots: ['wheels'], priceRange: [1500, 2400], conditionRange: [.5, 1], weight: 2 },
  { id: 'tires_195_55', name: 'Tires 195/55 R15, 4 pcs', category: 'tires', fits: '15" rims', component: 'tires', slots: ['tires'], priceRange: [4000, 6500], conditionRange: [.2, .85], weight: 3 },
  { id: 'brake_pads_front', name: 'Front brake pads + rotors', category: 'brakes', fits: 'Banwa Dalagan', component: 'brakes', slots: ['brakes_front'], priceRange: [1200, 2000], conditionRange: [.25, .9], weight: 3 },
  { id: 'surplus_alternator', name: 'Japan surplus alternator', category: 'engine', fits: '4A / 4E family', component: 'engine', slots: ['alternator'], priceRange: [2200, 3500], conditionRange: [.2, .9], weight: 2 },
  { id: 'surplus_head', name: 'Surplus cylinder head', category: 'engine', fits: '4A family', component: 'engine', slots: ['cylinder_head'], priceRange: [8000, 13000], conditionRange: [.15, .85], weight: 1 },
  { id: 'gearbox_5spd', name: '5-speed manual gearbox', category: 'drivetrain', fits: 'Banwa Dalagan', component: 'transmission', slots: ['gearbox'], priceRange: [9000, 14000], conditionRange: [.2, .85], weight: 1 },
  { id: 'clutch_kit', name: 'Clutch kit (disc + pressure plate)', category: 'drivetrain', fits: 'Banwa Dalagan', component: 'transmission', slots: ['clutch'], priceRange: [2500, 4200], conditionRange: [.3, .95], weight: 2 },
  { id: 'muffler_canister', name: 'Canister muffler', category: 'exhaust', fits: '2" pipe', component: null, slots: ['exhaust'], priceRange: [1500, 2800], conditionRange: [.4, 1], weight: 2 },
  { id: 'projector_headlights', name: 'Projector headlights, pair', category: 'lighting', fits: 'Banwa Dalagan', component: null, slots: ['headlight_l', 'headlight_r'], priceRange: [3000, 5200], conditionRange: [.35, .95], weight: 2 },
  { id: 'bucket_seat', name: 'Bucket seat w/ rails', category: 'interior', fits: 'Universal rails', component: null, slots: ['seat_driver'], priceRange: [4500, 8000], conditionRange: [.35, .9], weight: 1 },
];

const byId = new Map(PART_TEMPLATES.map(part => [part.id, part]));
export const partDefinition = (id: string): PartTemplate | undefined => byId.get(id);
export const partIdSchema = z.string().refine(id => byId.has(id), 'unknown part');
