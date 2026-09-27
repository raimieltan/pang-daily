import { EARLY_ECONOMY, JOB_BALANCE, RACE_REWARDS, type EarlyJobId } from './balance';
import { drivingFuelLiters } from './economy';
import { VehicleSession } from '../maintenance/VehicleSession';
import { SERVICE_COMPONENTS, drivingWear, repairLines, type WearSample } from '../maintenance/condition';
import { BANWA_DALAGAN_1996 as car } from '../vehicles';
import { JobSession } from '../jobs/JobSession';
import { HUB_JOBS } from '../jobs/catalog';
import { payRacePrize } from '../social/raceOutcomes';
import { InventorySession } from '../inventory/InventorySession';
import { MarketplaceSession } from '../marketplace/MarketplaceSession';
import { generateListing } from '../marketplace/listings';

export const COMPETENT_DRIVING: WearSample = { speedMps: 10, throttle: .5, brake: .1, slip: .05, handbrake: 0, grounded: true, racing: false };
export const RECKLESS_DRIVING: WearSample = { ...COMPETENT_DRIVING, throttle: 1, brake: 1, slip: 1, handbrake: 1, racing: true };
function checked<T>(value: T | { rejected: string }): T {
  if (value && typeof value === 'object' && 'rejected' in value) throw new Error(String(value.rejected));
  return value as T;
}
export function operatingCost(km: number, sample = COMPETENT_DRIVING) {
  const seconds = km * 1000 / sample.speedMps;
  const loss = drivingWear(sample, seconds);
  const damaged = { ...car.condition.typical };
  for (const key of SERVICE_COMPONENTS) damaged[key] = 1 - loss[key];
  const wearPhp = repairLines(car, damaged).reduce((sum, line) => sum + line.costPhp, 0);
  const fuelLiters = drivingFuelLiters(sample.speedMps, sample.throttle, seconds);
  return { fuelLiters, wearPhp, totalPhp: wearPhp + fuelLiters * EARLY_ECONOMY.fuel.pricePhpPerLiter };
}
/** Uses real job transitions and ledger settlement, including reload-safe run IDs. */
export function completeWork(wallet: VehicleSession, jobs: JobSession, id: EarlyJobId) {
  const job = HUB_JOBS.find(job => job.id === id)!;
  checked(jobs.accept(id));
  checked(jobs.begin({ mode: job.requirements.mode ?? 'walking', racing: false, fuelLiters: wallet.summary(car).fuelLiters }));
  // Target minutes include travel to/from the board; in-job timing remains within authored limits.
  jobs.tick(Math.min(JOB_BALANCE[id].minutes * 30, job.timeLimitSeconds ?? Infinity));
  for (const objective of job.objectives) checked(jobs.completeObjective(objective.id));
}
export type EconomyCheckpoint = { step: string; minutes: number; walletPhp: number; fuelLiters: number; condition: Record<string, number>; transactions: { kind: string; amountPhp: number }[] };
/** 75-minute equivalent authored itinerary, seeded used listing and validated first race win. */
export function representativePlaythrough() {
  const wallet = new VehicleSession();
  const jobs = new JobSession(wallet, HUB_JOBS);
  const checkpoints: EconomyCheckpoint[] = [];
  let minutes = 0, lastSequence = 0;
  function record(step: string, duration: number) {
    minutes += duration;
    const summary = wallet.summary(car);
    const transactions = wallet.snapshot().transactions.filter(tx => tx.id > lastSequence);
    lastSequence = wallet.snapshot().transactions.at(-1)!.id;
    checkpoints.push({ step, minutes, walletPhp: summary.walletPhp, fuelLiters: Number(summary.fuelLiters!.toFixed(3)),
      condition: Object.fromEntries(SERVICE_COMPONENTS.map(key => [key, Number(summary.condition[key].toFixed(4))])),
      transactions: transactions.map(({ kind, amountPhp }) => ({ kind, amountPhp })) });
  }
  function work(id: EarlyJobId) {
    completeWork(wallet, jobs, id);
    const seconds = JOB_BALANCE[id].travelKm * 1000 / COMPETENT_DRIVING.speedMps;
    wallet.consumeFuel(car, drivingFuelLiters(COMPETENT_DRIVING.speedMps, COMPETENT_DRIVING.throttle, seconds));
    wallet.wear(car, drivingWear(COMPETENT_DRIVING, seconds));
    record(id, JOB_BALANCE[id].minutes);
  }
  record('fresh profile', 0);
  work('kyo_ice_run');
  checked(wallet.repair(car, wallet.quote(car), ['brakes', 'tires']));
  checked(wallet.refuel(car, { targetLiters: EARLY_ECONOMY.fuel.capacityLiters }));
  record('brakes, tires and fuel', 2);
  work('talyer_oil_errand');
  work('hatid_suki_home');
  const raceSample = { ...COMPETENT_DRIVING, racing: true };
  wallet.consumeFuel(car, drivingFuelLiters(10, .5, 100));
  wallet.wear(car, drivingWear(raceSample, 100));
  const result = { raceId: 'barangay_sprint', attemptId: 'm2-validation-race', position: 1, racers: 2, timeMs: 18000,
    validation: { completedCheckpoints: 3, totalCheckpoints: 3, finishValidated: true, invalidFinish: false } };
  payRacePrize(wallet, result, RACE_REWARDS.barangay_sprint);
  record('first race win', 4);
  work('kyo_pastry_round');
  work('talyer_battery_drop');
  work('talyer_alternator_drop');
  work('talyer_rims_pickup');
  work('hatid_overlook');
  work('talyer_oil_errand');
  const listing = { ...generateListing(42, 'm2-validation-part', 0), templateId: EARLY_ECONOMY.representativePart.templateId, sellerId: 'jun_surplus',
    askingPricePhp: EARLY_ECONOMY.representativePart.askingPricePhp, advertisedGrade: 'good' as const, actualCondition: EARLY_ECONOMY.representativePart.actualCondition, expiresAt: 10_000_000 };
  const market = new MarketplaceSession(wallet, new InventorySession(), { version: 1, seed: 42, serial: 1, listings: [listing] }, undefined, () => 0);
  const purchase = checked(market.buy(listing.id));
  checked(market.inspect(purchase.part.id));
  record('used shocks and inspection (oversold)', 3);
  return { checkpoints, wallet, jobs, market };
}
