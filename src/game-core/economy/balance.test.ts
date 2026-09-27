import { describe, expect, it } from 'vitest';
import { EARLY_ECONOMY, JOB_BALANCE, PAYOUT_BANDS, RACE_REWARDS, jobsForCost } from './balance';
import { completeWork, operatingCost, representativePlaythrough, RECKLESS_DRIVING } from './simulation';
import { VehicleSession } from '../maintenance/VehicleSession';
import { payRacePrize } from '../social/raceOutcomes';
import { JobSession } from '../jobs/JobSession';
import { HUB_JOBS } from '../jobs/catalog';
import { BANWA_DALAGAN_1996 as car } from '../vehicles';
import { emptyLoss, SERVICE_COMPONENTS, impactWear } from '../maintenance/condition';
import { calculateVehiclePerformance } from '../performance/calculator';
import { fuelRejection } from '../../game/maintenance/fuelAccess';
import type { Interactable } from '../../game/interaction/Interaction';

const source = { kind: 'expense', source: 'balance-test', description: 'Prior spending' };
const pump: Interactable = { id: 'pump', action: 'refuel', label: 'Pump', priority: 1, area: { kind: 'circle', x: 38, z: 22, radius: 3 } };
describe('M2 balance guardrails', () => {
  it('covers every job, funds operating costs and keeps net/minute competitive', () => {
    const rates: number[] = [];
    for (const job of HUB_JOBS) {
      const tuning = JOB_BALANCE[job.id as keyof typeof JOB_BALANCE];
      expect(tuning).toBeDefined();
      const band = PAYOUT_BANDS[job.type as keyof typeof PAYOUT_BANDS];
      expect(job.payoutPhp).toBeGreaterThanOrEqual(band[0]);
      expect(job.payoutPhp + (job.bonus?.php ?? 0)).toBeLessThanOrEqual(band[1]);
      const cost = operatingCost(tuning.travelKm);
      expect(job.payoutPhp - cost.totalPhp).toBeGreaterThan(0);
      rates.push((job.payoutPhp - cost.totalPhp) / tuning.minutes);
      if (job.requirements.minFuelLiters) expect(job.requirements.minFuelLiters).toBeGreaterThan(cost.fuelLiters);
    }
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThanOrEqual(EARLY_ECONOMY.validation.maxNetPerMinuteRatio);
  });
  it('prices race uncertainty and used-part risk into saving targets', () => {
    const race = EARLY_ECONOMY.raceValidation;
    const cost = operatingCost(race.travelKm, { ...RECKLESS_DRIVING, brake: .1, slip: .05, handbrake: 0 });
    const expectedRate = (PAYOUT_BANDS.lowStakesRace[0] * race.winProbability - cost.totalPhp) / race.loopMinutes;
    expect(expectedRate).toBeGreaterThan(0);
    expect(expectedRate).toBeLessThan(JOB_BALANCE.talyer_oil_errand.payoutPhp / JOB_BALANCE.talyer_oil_errand.minutes);
    for (const band of [EARLY_ECONOMY.usedParts.common, EARLY_ECONOMY.usedParts.desirable, EARLY_ECONOMY.usedParts.aspirational]) {
      const riskBudget = band[1] * (1 + EARLY_ECONOMY.usedParts.riskReserveFraction) + EARLY_ECONOMY.usedParts.inspectionPhp;
      expect(jobsForCost(riskBudget)).toBeGreaterThan(jobsForCost(band[1]));
    }
  });
  it.each([[0, 0, false], [1, .01, false], [0, 0, true], [1, .1, true], [0, 20, true]])('recovers from wallet %s, fuel %s, damaged %s without gifts', (cash, fuel, damaged) => {
    const wallet = new VehicleSession();
    wallet.summary(car);
    wallet.spend(EARLY_ECONOMY.startingCashPhp - cash, source);
    wallet.consumeFuel(car, EARLY_ECONOMY.fuel.capacityLiters - fuel);
    if (damaged) wallet.wear(car, Object.fromEntries(SERVICE_COMPONENTS.map(key => [key, 1])) as ReturnType<typeof emptyLoss>);
    const jobs = new JobSession(wallet, HUB_JOBS);
    const recovery = HUB_JOBS.find(job => job.id === EARLY_ECONOMY.recovery.jobId)!;
    expect(recovery.requirements).toEqual({});
    expect(recovery.objectives.every(objective => objective.mode === 'walking')).toBe(true);
    for (let count = 0; count < EARLY_ECONOMY.recovery.maxActivities; count++) completeWork(wallet, jobs, 'talyer_oil_errand');
    expect(wallet.snapshot().walletPhp).toBeGreaterThanOrEqual(EARLY_ECONOMY.recovery.solvencyTargetPhp);
    expect(wallet.summary(car).fuelLiters).toBeCloseTo(fuel, 8);
    if (fuel <= EARLY_ECONOMY.recovery.emptyTankThresholdLiters) {
      expect(fuelRejection({ mode: 'walking', player: { x: 38, y: 0, z: 22 }, car: { x: 2200, y: 100, z: 3000 }, speedKmh: 0, racing: false, fuelLiters: fuel }, [pump])).toBeNull();
      expect(wallet.refuel(car, { liters: EARLY_ECONOMY.recovery.reserveCanMaxLiters })).not.toHaveProperty('rejected');
    }
    expect(wallet.snapshot().walletPhp).toBeGreaterThan(0);
    const performance = calculateVehiclePerformance(car, [], wallet.summary(car).condition);
    expect(performance.stats.powerHp).toBeGreaterThan(0);
    expect(performance.stats.tireGrip).toBeGreaterThan(0);
    expect(wallet.snapshot().transactions.filter(tx => tx.amountPhp > 0).every(tx => ['starting_cash', 'job_payout'].includes(tx.kind))).toBe(true);
  });
  it('reckless wear and collisions can erase a job profit; severe repairs remain finite', () => {
    const wallet = new VehicleSession(); wallet.summary(car);
    const priorRepair = wallet.quote(car).totalPhp;
    wallet.wear(car, impactWear(1)); wallet.wear(car, impactWear(1));
    const impactCost = wallet.quote(car).totalPhp - priorRepair;
    expect(operatingCost(6, RECKLESS_DRIVING).totalPhp + impactCost).toBeGreaterThan(JOB_BALANCE.hatid_overlook.payoutPhp);
    const condition = { ...car.condition.typical, ...Object.fromEntries(SERVICE_COMPONENTS.map(key => [key, EARLY_ECONOMY.repair.representativeCondition.severe])) };
    const saved = wallet.snapshot(); saved.vehicles[car.id].condition = condition;
    const severe = new VehicleSession(saved).quote(car).totalPhp;
    expect(severe).toBeGreaterThanOrEqual(EARLY_ECONOMY.repair.severe[0]);
    expect(severe).toBeLessThanOrEqual(EARLY_ECONOMY.repair.severe[1]);
    expect(jobsForCost(severe)).toBeLessThanOrEqual(15);
    expect(jobsForCost(severe + EARLY_ECONOMY.usedParts.desirable[0])).toBeGreaterThan(jobsForCost(EARLY_ECONOMY.usedParts.desirable[0]));
  });
  it('replays the representative loop with ledger, condition and fuel checkpoints', () => {
    const run = representativePlaythrough();
    const expectedWallets = [5000, 5450, 4697, 4997, 5377, 5777, 6337, 6987, 7587, 8387, 9327, 9627, 7877];
    const expectedFuel = [45, 44.8, 45, 45, 44.85, 44.6, 44.3, 44, 43.5, 42.25, 40.75, 40.75, 40.75];
    expect(run.checkpoints.map(step => step.walletPhp)).toEqual(expectedWallets);
    expect(run.checkpoints.map(step => step.fuelLiters)).toEqual(expectedFuel);
    expect(run.checkpoints.at(-1)!.condition).toEqual({ engine: .656, transmission: .7388, brakes: .9672, suspension: .5116, tires: .9016 });
    expect(run.checkpoints.at(-1)!.minutes).toBe(75);
    expect(run.checkpoints.at(-1)!.walletPhp).toBeGreaterThan(EARLY_ECONOMY.startingCashPhp);
    expect(run.wallet.snapshot().transactions.some(tx => tx.kind === 'parts_purchase')).toBe(true);
    expect(run.wallet.snapshot().transactions.some(tx => tx.kind === 'part_inspection')).toBe(true);
    expect(run.market.view().parts[0].actual?.verdict).toBe('oversold');
    const restored = new VehicleSession(run.wallet.snapshot());
    expect(restored.snapshot()).toEqual(run.wallet.snapshot());
    const paidBefore = restored.snapshot().walletPhp;
    expect(payRacePrize(restored, { raceId: 'barangay_sprint', attemptId: 'm2-validation-race', position: 1, racers: 2, timeMs: 18000, validation: { completedCheckpoints: 3, totalCheckpoints: 3, finishValidated: true, invalidFinish: false } }, RACE_REWARDS.barangay_sprint)).toBe(0);
    expect(restored.snapshot().walletPhp).toBe(paidBefore);
    const remainingFuelCost = (EARLY_ECONOMY.fuel.capacityLiters - restored.summary(car).fuelLiters!) * EARLY_ECONOMY.fuel.pricePhpPerLiter;
    expect(paidBefore - restored.quote(car).totalPhp - remainingFuelCost).toBeGreaterThan(EARLY_ECONOMY.startingCashPhp);
    restored.spend(EARLY_ECONOMY.usedParts.desirable[1], source);
    expect(restored.snapshot().walletPhp).toBeLessThan(restored.quote(car).totalPhp + remainingFuelCost);
    const recoveryJobs = new JobSession(restored, HUB_JOBS);
    for (let i = 0; i < EARLY_ECONOMY.recovery.maxActivities; i++) completeWork(restored, recoveryJobs, 'talyer_oil_errand');
    expect(restored.snapshot().walletPhp).toBeGreaterThan(restored.quote(car).totalPhp + remainingFuelCost);
  });
});
