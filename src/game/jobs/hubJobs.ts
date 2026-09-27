import { defineJob, type JobDefinition } from '../../game-core/jobs/jobs';
import { OVERLOOK, ROUTE_LENGTH, roadAt } from '../world/mountain/route';

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

/** Mountain stops: road shoulder (+ right of uphill travel) or a verge you walk to. */
const shoulder = (s: number, offset = 4.2) => { const p = roadAt(s, offset); return { x: p.x, z: p.z }; };
const PAHUWAY = { x: OVERLOOK.x, z: OVERLOOK.z, radius: 12 };
const MAASIN_MARKET = { ...shoulder(ROUTE_LENGTH - 90), radius: 8 };
const TERRACE_STAND = { ...shoulder(ROUTE_LENGTH * .21), radius: 8 };
const KYO_APRON = { x: 130.5, z: 98, radius: 9 };

/**
 * Catering drop for the Pahuway crowd: coffee urns and pastries from Kyo up to the overlook.
 * Long enough to need fuel; urns slosh, so a clean run earns a tip.
 */
export const KYO_OVERLOOK_CATERING = defineJob({
  id: 'kyo_overlook_catering', type: 'delivery', title: 'Coffee for the overlook',
  description: 'A car club booked Kyo for their Pahuway meet. Get the urns and pastry boxes up the mountain while it is still hot.',
  payoutPhp: 950, offeredAt: [KYO_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 10 }, timeLimitSeconds: 600,
  cargo: { label: 'Coffee urns', maxDamage: .55, impactDamage: .35 },
  bonus: { label: 'tip for hot, unspilled coffee', php: 250, withinSeconds: 450, maxDamage: .2 },
  objectives: [
    { id: 'pickup', label: 'Load the urns at Kyo', prompt: 'Load coffee urns', locationName: 'Kyo Coffee', area: KYO_APRON, cargo: 'load' },
    { id: 'dropoff', label: 'Set up at Pahuway overlook', prompt: 'Hand over the urns', locationName: 'Pahuway overlook', area: PAHUWAY, cargo: 'unload' },
  ],
});

/** Pickup: Kyo's bean supplier is at the Maasin market. The whole mountain and back. */
export const KYO_BEAN_PICKUP = defineJob({
  id: 'kyo_bean_pickup', type: 'pickup', title: 'Beans from Maasin',
  description: 'The roaster in Maasin has Kyo\'s sacks ready. Drive the whole mountain, load up, and bring them down before closing.',
  payoutPhp: 1500, offeredAt: [KYO_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 18 }, timeLimitSeconds: 1200,
  cargo: { label: 'Coffee sacks', maxDamage: .9, impactDamage: .15 },
  objectives: [
    { id: 'pickup', label: 'Load the sacks at the Maasin market', prompt: 'Load coffee sacks', locationName: 'Maasin market', area: MAASIN_MARKET, cargo: 'load' },
    { id: 'dropoff', label: 'Bring them back to Kyo', prompt: 'Unload coffee sacks', locationName: 'Kyo Coffee', area: KYO_APRON, cargo: 'unload' },
  ],
});

/** Multi-drop: one load of pastry boxes, three stops around the block, last box goes home. */
export const KYO_PASTRY_ROUND = defineJob({
  id: 'kyo_pastry_round', type: 'delivery', title: 'Ensaymada round',
  description: 'Three standing orders for ensaymada boxes: Suki 24, the Bahandi kiosk, and the neighbour by your place. Keep them flat.',
  payoutPhp: 560, offeredAt: [KYO_JOB_BOARD], requirements: { mode: 'driving' }, timeLimitSeconds: 360,
  cargo: { label: 'Pastry boxes', maxDamage: .6, impactDamage: .3 },
  objectives: [
    { id: 'pickup', label: 'Load pastry boxes at Kyo', prompt: 'Load pastry boxes', locationName: 'Kyo Coffee', area: KYO_APRON, cargo: 'load' },
    { id: 'suki', label: 'Drop a box at Suki 24', prompt: 'Drop off a box', locationName: 'Suki 24', area: { x: -68, z: 11.5, radius: 10 } },
    { id: 'bahandi', label: 'Drop a box at the Bahandi kiosk', prompt: 'Drop off a box', locationName: 'Bahandi Fuels', area: { x: 38, z: 22, radius: 8 } },
    { id: 'dropoff', label: 'Walk the last box to the neighbour', prompt: 'Hand over the last box', locationName: 'Neighbour\'s porch',
      area: { x: -50, z: 151.5, radius: 3 }, mode: 'walking', cargo: 'unload' },
  ],
});

/** Pickup: a farmer at the terraces is selling a set of used rims Mang Boy wants. */
export const TALYER_RIMS_PICKUP = defineJob({
  id: 'talyer_rims_pickup', type: 'pickup', title: 'Rims from the terraces',
  description: 'A farmer up at the vegetable terraces is selling a set of used rims. Mang Boy already paid. Go fetch them.',
  payoutPhp: 800, offeredAt: [TALYER_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 8 }, timeLimitSeconds: 720,
  cargo: { label: 'Used rims', maxDamage: .95, impactDamage: .1 },
  objectives: [
    { id: 'pickup', label: 'Load the rims at the terrace stall', prompt: 'Load the rims', locationName: 'Terrace stall', area: TERRACE_STAND, cargo: 'load' },
    { id: 'dropoff', label: 'Bring them to the talyer', prompt: 'Unload the rims', locationName: 'Talyer ni Mang Boy', area: { x: 22, z: 147.5, radius: 6 }, cargo: 'unload' },
  ],
});

/** Delivery with an on-foot handoff: a rebuilt alternator for a suki in Alimodian. */
export const TALYER_ALTERNATOR_DROP = defineJob({
  id: 'talyer_alternator_drop', type: 'delivery', title: 'Alternator to Alimodian',
  description: 'Mang Boy rebuilt an alternator for a suki just past the Alimodian sign. Park on the shoulder and walk it to the gate.',
  payoutPhp: 600, offeredAt: [TALYER_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 5 }, timeLimitSeconds: 420,
  cargo: { label: 'Alternator', maxDamage: .8, impactDamage: .25 },
  objectives: [
    { id: 'pickup', label: 'Load the alternator at the talyer', prompt: 'Load the alternator', locationName: 'Talyer ni Mang Boy', area: { x: 22, z: 147.5, radius: 6 }, cargo: 'load' },
    { id: 'park', label: 'Pull over in Alimodian', prompt: 'Park on the shoulder', locationName: 'Alimodian', area: { ...shoulder(320), radius: 8 } },
    { id: 'dropoff', label: 'Walk it to the gate', prompt: 'Hand over the alternator', locationName: 'Alimodian',
      area: { ...shoulder(320, -5.5), radius: 3 }, mode: 'walking', cargo: 'unload' },
  ],
});

/** Delivery: an LPG tank from the Bahandi forecourt, carried the last metres to the neighbour. */
export const FUEL_LPG_DELIVERY = defineJob({
  id: 'fuel_lpg_delivery', type: 'delivery', title: 'LPG for the neighbour',
  description: 'Your neighbour ran out of gas mid-sinigang. Load a full tank at the forecourt and carry it to their porch. Upright.',
  payoutPhp: 340, offeredAt: [FUEL_JOB_BOARD], requirements: { mode: 'driving' }, timeLimitSeconds: 300,
  cargo: { label: 'LPG tank', maxDamage: .5, impactDamage: .35 },
  objectives: [
    { id: 'pickup', label: 'Load the tank on the forecourt', prompt: 'Load the LPG tank', locationName: 'Bahandi Fuels', area: { x: 38, z: 22, radius: 8 }, cargo: 'load' },
    { id: 'dropoff', label: 'Carry it to the neighbour\'s porch', prompt: 'Hand over the tank', locationName: 'Neighbour\'s porch',
      area: { x: -50, z: 151.5, radius: 3 }, mode: 'walking', cargo: 'unload' },
  ],
});

/** Hatid up the mountain: two riders from the meet spot want the overlook before sunset. */
export const HATID_OVERLOOK = defineJob({
  id: 'hatid_overlook', type: 'passenger', title: 'Hatid: Pahuway sunset',
  description: 'Two college kids at the Bahandi meet spot missed the last jeep. Take them up to Pahuway overlook. They get carsick.',
  payoutPhp: 720, offeredAt: [FUEL_JOB_BOARD], requirements: { mode: 'driving', minFuelLiters: 10 },
  cargo: { label: 'Two riders', kind: 'passenger', maxDamage: .6, impactDamage: .2 },
  bonus: { label: 'tip for a smooth climb', php: 200, maxDamage: .15 },
  objectives: [
    { id: 'pickup', label: 'Pick them up at the meet spot', prompt: 'Let the riders in', locationName: 'Bahandi Fuels', area: { x: 40, z: 14, radius: 8 }, cargo: 'load' },
    { id: 'dropoff', label: 'Drop them at Pahuway overlook', prompt: 'Drop off the riders', locationName: 'Pahuway overlook', area: PAHUWAY, cargo: 'unload' },
  ],
});

export const HUB_JOBS: readonly JobDefinition[] = [
  KYO_ICE_RUN, KYO_PASTRY_ROUND, KYO_OVERLOOK_CATERING, KYO_BEAN_PICKUP,
  TALYER_OIL_ERRAND, TALYER_BATTERY_DROP, TALYER_ALTERNATOR_DROP, TALYER_RIMS_PICKUP,
  HATID_SUKI_HOME, FUEL_LPG_DELIVERY, HATID_OVERLOOK,
];
