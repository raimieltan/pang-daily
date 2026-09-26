import type { PaintFinish } from './BodyPart';

export type NpcCarBuild = {
  rideHeightM: number;
  wheels?: string;
  parts: readonly { id: string; condition: number; finish?: PaintFinish }[];
};

/** Kyo regulars: clean daily, marketplace hero, donor panels, and a work-in-progress kit. */
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
  ] },
} as const satisfies Record<string, NpcCarBuild>;
export type NpcCarBuildId = keyof typeof NPC_CAR_BUILDS;
