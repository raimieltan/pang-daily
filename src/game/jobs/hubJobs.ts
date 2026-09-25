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

export const HUB_JOBS: readonly JobDefinition[] = [KYO_ICE_RUN];
