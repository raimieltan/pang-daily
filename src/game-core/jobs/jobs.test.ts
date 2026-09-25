import { describe, expect, it } from 'vitest';
import { VehicleSession } from '../maintenance/VehicleSession';
import { abandonJob, acceptJob, advanceTime, beginJob, bonusEarned, completeObjective, damageCargo, defineJob, jobPayout, startBlocker, type JobRun } from './jobs';
import { JobSession } from './JobSession';

const job = defineJob({
  id: 'test_delivery', type: 'delivery', title: 'Test run', description: 'Carry a box.', payoutPhp: 450,
  offeredAt: ['board'], requirements: { mode: 'driving' }, timeLimitSeconds: 60,
  cargo: { label: 'Box', maxDamage: .5, impactDamage: .4 },
  objectives: [
    { id: 'pickup', label: 'Pick up the box', prompt: 'Load box', locationName: 'A', area: { x: 0, z: 0, radius: 5 }, cargo: 'load' },
    { id: 'dropoff', label: 'Deliver the box', prompt: 'Unload box', locationName: 'B', area: { x: 100, z: 0, radius: 5 }, cargo: 'unload' },
  ],
});
const ride = defineJob({
  ...job, id: 'test_ride', type: 'passenger', title: 'Test ride', timeLimitSeconds: undefined,
  cargo: { label: 'Rider', kind: 'passenger', maxDamage: .6, impactDamage: .25 },
  bonus: { label: 'tip', php: 100, withinSeconds: 60, maxDamage: .2 },
});
const driving = { mode: 'driving', racing: false } as const;
const ok = (run: JobRun | { rejected: string }) => { if ('rejected' in run) throw new Error(run.rejected); return run; };

describe('job definitions', () => {
  it('applies defaults and rejects invalid data', () => {
    expect(job.objectives[0]).toMatchObject({ mode: 'driving', maxSpeedKmh: 3 });
    expect(() => defineJob({ ...job, payoutPhp: 0 })).toThrow();
    expect(() => defineJob({ ...job, payoutPhp: 1.234 })).toThrow();
    expect(() => defineJob({ ...job, objectives: [job.objectives[1], job.objectives[0]] })).toThrow(/loaded before/);
    expect(() => defineJob({ ...job, objectives: [job.objectives[0], { ...job.objectives[1], id: 'pickup' }] })).toThrow(/unique/);
    expect(() => defineJob({ ...job, cargo: undefined })).toThrow(/cargo definition/);
    expect(job.cargo?.kind).toBe('goods');
    expect(() => defineJob({ ...ride, bonus: { label: 'tip', php: 100 } })).toThrow(/time or damage/);
    expect(() => defineJob({ ...ride, cargo: undefined, objectives: [{ ...job.objectives[0], cargo: undefined }], bonus: { label: 'tip', php: 100, maxDamage: .2 } })).toThrow(/needs cargo/);
  });
});

describe('job run transitions', () => {
  it('starts only when requirements hold, then completes objectives strictly in order', () => {
    let run = acceptJob(job, 'r1');
    expect(run.status).toBe('accepted');
    expect(startBlocker(job, { mode: 'walking', racing: false })).toMatch(/car/);
    expect(beginJob(run, job, { mode: 'walking', racing: false })).toHaveProperty('rejected');
    expect(beginJob(run, job, { mode: 'driving', racing: true })).toHaveProperty('rejected');
    expect(completeObjective(run, job, 'pickup')).toEqual({ rejected: 'Start the job first.' });
    run = ok(beginJob(run, job, driving));
    expect(completeObjective(run, job, 'dropoff')).toEqual({ rejected: 'Pick up the box first.' });
    expect(completeObjective(run, job, 'nope')).toEqual({ rejected: 'Unknown objective.' });
    run = ok(completeObjective(run, job, 'pickup'));
    expect(run).toMatchObject({ status: 'active', objectiveIndex: 1, cargoLoaded: true });
    run = ok(completeObjective(run, job, 'dropoff'));
    expect(run).toMatchObject({ status: 'completed', cargoLoaded: false });
    expect(completeObjective(run, job, 'dropoff')).toHaveProperty('rejected');
  });
  it('fails on the time limit and on cargo damage, only while active and loaded', () => {
    const accepted = acceptJob(job, 'r1');
    expect(advanceTime(accepted, job, 100)).toBe(accepted);
    const active = ok(beginJob(accepted, job, driving));
    expect(advanceTime(active, job, 59).status).toBe('active');
    expect(advanceTime(active, job, 61)).toMatchObject({ status: 'failed', reason: 'Out of time.', elapsedSeconds: 60 });
    expect(damageCargo(active, job, .9)).toBe(active);
    const loaded = ok(completeObjective(active, job, 'pickup'));
    expect(damageCargo(loaded, job, .3)).toMatchObject({ status: 'active', cargoDamage: .3 });
    expect(damageCargo(damageCargo(loaded, job, .3), job, .3)).toMatchObject({ status: 'failed', reason: 'Box got damaged.' });
  });
  it('abandons only runs in progress', () => {
    expect(ok(abandonJob(acceptJob(job, 'r1'))).status).toBe('abandoned');
    expect(abandonJob({ ...acceptJob(job, 'r1'), status: 'completed' })).toHaveProperty('rejected');
  });
});

describe('passenger jobs', () => {
  it('needs the passenger aboard to finish, and loses them to a rough ride', () => {
    let run = ok(beginJob(acceptJob(ride, 'p1'), ride, driving));
    expect(run.cargoLoaded).toBe(false);
    // A save edited past the pickup still cannot finish without the passenger.
    expect(completeObjective({ ...run, objectiveIndex: 1 }, ride, 'dropoff')).toEqual({ rejected: 'No passenger aboard.' });
    run = ok(completeObjective(run, ride, 'pickup'));
    expect(run.cargoLoaded).toBe(true);
    expect(damageCargo(run, ride, .7)).toMatchObject({ status: 'failed', reason: 'Rider got out. Too rough a ride.' });
    expect(ok(completeObjective(run, ride, 'dropoff'))).toMatchObject({ status: 'completed', cargoLoaded: false });
  });
  it('adds the bonus only while quick and smooth enough', () => {
    const run = ok(completeObjective(ok(beginJob(acceptJob(ride, 'p1'), ride, driving)), ride, 'pickup'));
    expect(jobPayout(run, ride)).toBe(550);
    expect(bonusEarned(damageCargo(run, ride, .25), ride)).toBe(false);
    expect(jobPayout(advanceTime(run, ride, 61), ride)).toBe(450);
    expect(jobPayout(run, job)).toBe(450);
  });
});

describe('JobSession', () => {
  function setup(saved?: unknown) {
    const wallet = new VehicleSession(), saves: unknown[] = [];
    return { wallet, saves, jobs: new JobSession(wallet, [job], saved, save => saves.push(save)) };
  }
  function finish(jobs: JobSession) {
    ok(jobs.accept(job.id) as JobRun); ok(jobs.begin(driving));
    jobs.completeObjective('pickup');
    return jobs.completeObjective('dropoff');
  }

  it('pays the configured payout once through the wallet ledger, and can be replayed', () => {
    const { wallet, jobs } = setup();
    const step = finish(jobs);
    expect(step).toMatchObject({ ended: { status: 'completed', payoutPhp: 450 } });
    expect(jobs.current).toBeNull();
    expect(wallet.snapshot().walletPhp).toBe(5450);
    const payouts = () => wallet.snapshot().transactions.filter(tx => tx.kind === 'job_payout');
    expect(payouts()).toEqual([expect.objectContaining({ amountPhp: 450, source: 'job:delivery', relatedEntityId: 'test_delivery#1' })]);
    expect(jobs.completeObjective('dropoff')).toHaveProperty('rejected');
    finish(jobs);
    expect(payouts().map(tx => tx.relatedEntityId)).toEqual(['test_delivery#1', 'test_delivery#2']);
    expect(jobs.outcomes(job.id)).toEqual({ completed: 2, failed: 0, abandoned: 0 });
  });
  it('never pays failed or abandoned runs', () => {
    const { wallet, jobs } = setup();
    jobs.accept(job.id); jobs.begin(driving);
    expect(jobs.tick(61)).toMatchObject({ ended: { status: 'failed', payoutPhp: 0 } });
    jobs.accept(job.id); jobs.begin(driving); jobs.completeObjective('pickup');
    expect(jobs.damageCargo(.6)).toMatchObject({ ended: { status: 'failed' } });
    jobs.accept(job.id);
    expect(jobs.abandon()).toMatchObject({ ended: { status: 'abandoned', payoutPhp: 0 } });
    expect(wallet.snapshot().walletPhp).toBe(5000);
    expect(jobs.outcomes(job.id)).toEqual({ completed: 0, failed: 2, abandoned: 1 });
  });
  it('allows one job at a time and rejects unknown jobs', () => {
    const { jobs } = setup();
    expect(jobs.accept('missing')).toHaveProperty('rejected');
    jobs.accept(job.id);
    expect(jobs.accept(job.id)).toEqual({ rejected: 'Finish or abandon your current job first.' });
  });
  it('restores a run in progress and settles a paid run instead of paying twice', () => {
    const { wallet, jobs, saves } = setup();
    jobs.accept(job.id); jobs.begin(driving); jobs.completeObjective('pickup'); jobs.tick(12); jobs.flush();
    const restored = new JobSession(wallet, [job], saves.at(-1));
    expect(restored.current).toMatchObject({ status: 'active', objectiveIndex: 1, cargoLoaded: true, elapsedSeconds: 12 });
    const beforePay = saves.at(-1);
    jobs.completeObjective('dropoff');
    // The job save was lost after payment: reload settles it as completed without paying again.
    const settled = new JobSession(wallet, [job], beforePay);
    expect(settled.current).toBeNull();
    expect(settled.outcomes(job.id).completed).toBe(1);
    expect(wallet.snapshot().walletPhp).toBe(5450);
  });
  it('pays the bonus with the payout in one ledger entry, and resets the passenger on replay', () => {
    const wallet = new VehicleSession(), jobs = new JobSession(wallet, [ride]);
    ok(jobs.accept(ride.id) as JobRun); ok(jobs.begin(driving)); jobs.completeObjective('pickup');
    expect(jobs.completeObjective('dropoff')).toMatchObject({ ended: { status: 'completed', payoutPhp: 550, bonusPhp: 100 } });
    ok(jobs.accept(ride.id) as JobRun);
    expect(jobs.current).toMatchObject({ runId: 'test_ride#2', cargoLoaded: false, cargoDamage: 0, elapsedSeconds: 0 });
    ok(jobs.begin(driving)); jobs.completeObjective('pickup'); jobs.damageCargo(.3);
    expect(jobs.completeObjective('dropoff')).toMatchObject({ ended: { payoutPhp: 450, bonusPhp: 0 } });
    expect(wallet.snapshot().transactions.filter(tx => tx.kind === 'job_payout')).toEqual([
      expect.objectContaining({ amountPhp: 550, source: 'job:passenger', relatedEntityId: 'test_ride#1' }),
      expect.objectContaining({ amountPhp: 450, relatedEntityId: 'test_ride#2' }),
    ]);
  });
  it('drops corrupt saves and runs for jobs no longer in the catalog', () => {
    expect(setup({ broken: true }).jobs.current).toBeNull();
    const { saves, jobs, wallet } = setup(); jobs.accept(job.id);
    expect(new JobSession(wallet, [], saves.at(-1)).current).toBeNull();
  });
});
