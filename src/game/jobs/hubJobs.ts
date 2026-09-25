import { defineJob, type JobDefinition } from '../../game-core/jobs/jobs';

/** Board zone on Kyo Coffee's terrace (see hubLayout `kyo_job_board`). */
export const KYO_JOB_BOARD = 'kyo_job_board';

/**
 * First repeatable delivery: pick up at Suki 24's lot, drop off on Kyo's apron. Stops are in the
 * car, stopped, so the whole run stays on the driving loop. Tune payout/time/cargo here.
 */
export const KYO_ICE_RUN = defineJob({
  id: 'kyo_ice_run', type: 'delivery', title: 'Ice & milk run',
  description: 'Kyo ran out of ice before the late crowd. Grab the order at Suki 24 and bring it back without sloshing it everywhere.',
  payoutPhp: 450, offeredAt: [KYO_JOB_BOARD], requirements: { mode: 'driving' },
  timeLimitSeconds: 240,
  cargo: { label: 'Ice & milk', maxDamage: .5, impactDamage: .4 },
  objectives: [
    { id: 'pickup', label: 'Pick up the order at Suki 24', prompt: 'Load ice & milk', locationName: 'Suki 24',
      area: { x: -68, z: 11.5, radius: 10 }, cargo: 'load' },
    { id: 'dropoff', label: 'Deliver to Kyo Coffee', prompt: 'Hand over the order', locationName: 'Kyo Coffee',
      area: { x: 130.5, z: 98, radius: 9 }, cargo: 'unload' },
  ],
});

/** Corkboard on the talyer's waiting-area wall (see hubLayout `talyer_job_board`). */
export const TALYER_JOB_BOARD = 'talyer_job_board';
/** Board on Bahandi Fuels' kiosk, by the meet spot where riders ask around for a hatid. */
export const FUEL_JOB_BOARD = 'fuel_job_board';

/**
 * Parts errand on foot at both ends: buy at the Bahandi kiosk counter, hand it to Mang Boy in the
 * bay. No clock and sturdy cargo; the car is optional for the drive between.
 */
export const TALYER_OIL_ERRAND = defineJob({
  id: 'talyer_oil_errand', type: 'errand', title: 'Oil & coolant for Mang Boy',
  description: 'Mang Boy is out of 20W-50 and coolant. Pick up the order he called in at the Bahandi Fuels kiosk and bring it to the bay.',
  payoutPhp: 300, offeredAt: [TALYER_JOB_BOARD],
  cargo: { label: 'Oil & coolant', maxDamage: .9, impactDamage: .25 },
  objectives: [
    { id: 'pickup', label: 'Collect the order at the Bahandi kiosk', prompt: 'Collect oil & coolant', locationName: 'Bahandi Fuels',
      area: { x: 50, z: 32.6, radius: 2.2 }, mode: 'walking', cargo: 'load' },
    { id: 'dropoff', label: 'Hand it to Mang Boy', prompt: 'Hand over the parts', locationName: 'Talyer ni Mang Boy',
      area: { x: 20, z: 153, radius: 3 }, mode: 'walking', cargo: 'unload' },
  ],
});

/**
 * Roadside parts drop: load a rebuilt battery on the talyer apron, drive it out to a stalled suki
 * on the main road shoulder by the mountain exit, then get out to hand it over. Timed, needs fuel.
 */
export const TALYER_BATTERY_DROP = defineJob({
  id: 'talyer_battery_drop', type: 'errand', title: 'Battery for a stalled suki',
  description: "One of Mang Boy's regulars died on the shoulder out by the mountain road. Take a charged battery to them before they give up and call a tow.",
  payoutPhp: 650, offeredAt: [TALYER_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 6 },
  timeLimitSeconds: 300,
  cargo: { label: 'Car battery', maxDamage: .7, impactDamage: .3 },
  objectives: [
    { id: 'pickup', label: 'Load the battery at the talyer', prompt: 'Load the battery', locationName: 'Talyer ni Mang Boy',
      area: { x: 22, z: 147.5, radius: 6 }, cargo: 'load' },
    { id: 'dropoff', label: 'Hand it over on the main road shoulder', prompt: 'Hand over the battery', locationName: 'Main Road shoulder',
      area: { x: 236, z: -8, radius: 5 }, mode: 'walking', cargo: 'unload' },
  ],
});

/**
 * Point-to-point hatid: Manang Lorna waits in Suki 24's lot with her groceries and wants to get
 * home. She is cargo of kind `passenger` (no NPC rides along); bumps wear her patience, and a quick,
 * smooth ride earns a tip.
 */
export const HATID_SUKI_HOME = defineJob({
  id: 'hatid_suki_home', type: 'passenger', title: 'Hatid: Manang Lorna',
  description: 'Manang Lorna has too many grocery bags for a jeepney. Pick her up at Suki 24 and bring her home, gently.',
  payoutPhp: 380, offeredAt: [FUEL_JOB_BOARD], requirements: { mode: 'driving' },
  cargo: { label: 'Manang Lorna', kind: 'passenger', maxDamage: .6, impactDamage: .25 },
  bonus: { label: 'tip for a quick, smooth ride', php: 100, withinSeconds: 120, maxDamage: .15 },
  objectives: [
    { id: 'pickup', label: 'Pick up Manang Lorna at Suki 24', prompt: 'Let Manang Lorna in', locationName: 'Suki 24',
      area: { x: -68, z: 11.5, radius: 10 }, cargo: 'load' },
    { id: 'dropoff', label: 'Drop her off at home', prompt: 'Drop off Manang Lorna', locationName: 'Home',
      area: { x: -78, z: 151, radius: 5 }, cargo: 'unload' },
  ],
});

export const HUB_JOBS: readonly JobDefinition[] = [KYO_ICE_RUN, TALYER_OIL_ERRAND, TALYER_BATTERY_DROP, HATID_SUKI_HOME];
