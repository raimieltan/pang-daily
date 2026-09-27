import type { PaintFinish } from './BodyPart';

export type NpcCarBuild = {
  /** Vehicle spec id; the Banwa Dalagan when omitted. */
  car?: string;
  rideHeightM: number;
  wheels?: string;
  parts: readonly { id: string; condition: number; finish?: PaintFinish }[];
  /** Engine-bay parts. They never show, but they set a race rival's pace. */
  performance?: readonly { id: string; condition: number }[];
};

export const NPC_DEFAULT_CAR = 'banwa_dalagan_1996';
export const npcCarId = (build: NpcCarBuild | undefined) => build?.car ?? NPC_DEFAULT_CAR;

/**
 * Kyo regulars: clean daily, marketplace hero, donor panels, and a work-in-progress kit. The crew
 * run the most finished builds in town; the street racers sit between the dailies and them.
 */
export const NPC_CAR_BUILDS = {
  clean_daily: { rideHeightM: -0.025, wheels: 'mags_15_4x100', parts: [
    { id: 'universal_rubber_lip', condition: 0.9 }, { id: 'dalagan_ducktail', condition: 0.95 },
  ] },
  marketplace_hero: { rideHeightM: -0.05, wheels: 'oversized_17_deep_dish', parts: [
    { id: 'marketplace_gt_wing', condition: 0.55 }, { id: 'acp_chin_splitter', condition: 0.55 },
    { id: 'vented_carbon_look_hood', condition: 0.8 },
  ] },
  primer_project: { rideHeightM: -0.035, wheels: 'steelies_14', parts: [
    { id: 'dalagan_primer_bumper', condition: 0.5 }, { id: 'dalagan_fiberglass_skirts', condition: 0.25 },
  ] },
  donor_daily: { rideHeightM: 0, parts: [
    { id: 'dalagan_red_fender_fl', condition: 0.6 }, { id: 'universal_rubber_lip', condition: 0.4 },
  ] },
  tidy_kit: { rideHeightM: -0.04, wheels: 'mags_15_4x100', parts: [
    { id: 'dalagan_fiberglass_skirts', condition: 0.9, finish: 'body_color' },
    { id: 'dalagan_ducktail', condition: 0.95 }, { id: 'dalagan_primer_bumper', condition: 0.9, finish: 'body_color' },
  ], performance: [{ id: 'cone_intake', condition: 0.8 }, { id: 'talyer_exhaust', condition: 0.7 }] },
  kidlat_stock: { car: 'hiraya_kidlat_1997', rideHeightM: 0, parts: [] },
  kidlat_street: { car: 'hiraya_kidlat_1997', rideHeightM: -0.03, wheels: 'mags_15_4x100', parts: [
    { id: 'universal_rubber_lip', condition: 0.7 }, { id: 'marketplace_gt_wing', condition: 0.6 },
  ] },
  // Sean's Lancer-in-spirit: Evo nose painted in, big wing, carbon-look hood, turbo on a converted 1.6.
  sean_evo_tribute: { rideHeightM: -0.05, wheels: 'oversized_17_deep_dish', parts: [
    { id: 'evo_type_front_bumper', condition: 0.9, finish: 'body_color' }, { id: 'marketplace_gt_wing', condition: 0.9 },
    { id: 'vented_carbon_look_hood', condition: 0.9 }, { id: 'dalagan_fiberglass_skirts', condition: 0.9, finish: 'body_color' },
    { id: 'acp_chin_splitter', condition: 0.85 },
  ], performance: [
    { id: 'surplus_16_efi', condition: 0.85 }, { id: 'efi_wiring', condition: 0.9 }, { id: 'used_small_turbo', condition: 0.8 },
    { id: 'turbo_oil_lines', condition: 0.9 }, { id: 'unknown_ecu', condition: 0.8 }, { id: 'cheap_radiator', condition: 0.85 },
    { id: 'uprated_clutch', condition: 0.9 }, { id: 'talyer_exhaust', condition: 0.8 },
  ] },
  // Casey's white hatch: honest RS look, chin and lip, mags. Stock 1.6 that loves revs.
  casey_kidlat_rs: { car: 'hiraya_kidlat_1997', rideHeightM: -0.04, wheels: 'mags_15_4x100', parts: [
    { id: 'universal_rubber_lip', condition: 0.95 }, { id: 'acp_chin_splitter', condition: 0.9 },
  ] },
  // Kent keeps it clean: colour-matched kit, ducktail, and a quiet 1.6 EFI swap underneath.
  kent_sleeper: { rideHeightM: -0.03, wheels: 'mags_15_4x100', parts: [
    { id: 'dalagan_primer_bumper', condition: 0.95, finish: 'body_color' }, { id: 'dalagan_fiberglass_skirts', condition: 0.95, finish: 'body_color' },
    { id: 'dalagan_ducktail', condition: 1 },
  ], performance: [
    { id: 'surplus_16_efi', condition: 0.9 }, { id: 'efi_wiring', condition: 0.9 }, { id: 'cone_intake', condition: 0.9 },
    { id: 'talyer_exhaust', condition: 0.85 }, { id: 'uprated_clutch', condition: 0.9 },
  ] },
} as const satisfies Record<string, NpcCarBuild>;
export type NpcCarBuildId = keyof typeof NPC_CAR_BUILDS;
