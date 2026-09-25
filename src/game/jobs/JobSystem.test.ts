import { afterEach, expect, it, vi } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameBridge } from '../bridge';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { interactablesFromZones } from '../interaction/Interaction';
import { HUB_LAYOUT } from '../world/hub/hubLayout';
import type { PlayerMode } from '../player/PlayerMode';
import { bindJobStore, useJobStore } from '../../state/jobStore';
import { JobSystem } from './JobSystem';
import { HUB_JOBS, KYO_ICE_RUN } from './hubJobs';
import { loadJobSession } from './jobStorage';

const BOARD = { x: 139.2, z: 98.4 };
const [PICKUP, DROPOFF] = KYO_ICE_RUN.objectives.map(o => o.area);
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).reverse().forEach(off => off()));

function setup(storage?: Pick<Storage, 'getItem' | 'setItem'>, wallet = new VehicleSession()) {
  const bridge = new GameBridge(), jobs = loadJobSession(wallet, HUB_JOBS, storage);
  const player = { position: new Vector3(BOARD.x, 0, BOARD.z), mode: 'walking' as PlayerMode };
  const vehicle = { speedKmh: 0, impactSerial: 0, impactStrength: 0 };
  const world = { racing: false };
  const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap(c => c.zones));
  const marker = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
  const system = new JobSystem(bridge.runtime, jobs, { player, vehicle, racing: () => world.racing,
    boards: zones.filter(z => z.action === 'browse_jobs'), marker });
  const interactions = new InteractionSystem(bridge.runtime, player, [() => zones, system.interactions]);
  system.connect(interactions);
  const unbind = bindJobStore(bridge.ui.events);
  const errors: string[] = []; bridge.ui.events.on('commandRejected', e => errors.push(e.reason));
  cleanup.push(() => { system.dispose(); interactions.dispose(); unbind(); bridge.dispose(); });
  const at = (p: { x: number; z: number }, mode: PlayerMode) => { player.position.set(p.x, 0, p.z); player.mode = mode; system.update(.1); };
  return { commands: bridge.ui.commands, wallet, jobs, player, vehicle, world, system, marker, errors, at };
}
const job = () => useJobStore.getState().job;
const payouts = (wallet: VehicleSession) => wallet.snapshot().transactions.filter(tx => tx.kind === 'job_payout');

it('is discovered at the Kyo board, starts in the car, and pays once after pickup then drop-off', () => {
  const s = setup();
  s.commands.interact();
  expect(useJobStore.getState().board?.listings).toEqual([expect.objectContaining({ id: 'kyo_ice_run', payoutPhp: 450, status: 'available', stops: ['Suki 24', 'Kyo Coffee'] })]);
  s.commands.acceptJob('kyo_ice_run');
  expect(useJobStore.getState().board).toBeNull();
  expect(job()).toMatchObject({ status: 'accepted', hint: 'Get in your car to start.' });

  s.at(BOARD, 'driving');
  expect(job()).toMatchObject({ status: 'active', objectives: [{ state: 'current' }, { state: 'pending' }] });
  expect(s.marker.show).toHaveBeenLastCalledWith(PICKUP.x, PICKUP.z, PICKUP.radius);

  // The drop-off is not offered (and cannot be completed) before the pickup.
  s.at(DROPOFF, 'driving'); s.commands.interact();
  expect(s.errors.at(-1)).toBe('Nothing to do here');
  expect(s.jobs.completeObjective('dropoff')).toEqual({ rejected: 'Pick up the order at Suki 24 first.' });

  s.at(PICKUP, 'driving'); s.vehicle.speedKmh = 20; s.commands.interact();
  expect(s.errors.at(-1)).toBe('Stop the car first.');
  s.vehicle.speedKmh = 0; s.commands.interact();
  expect(job()).toMatchObject({ objectives: [{ state: 'done' }, { state: 'current' }], cargo: { loaded: true, damagePct: 0 } });
  expect(s.marker.show).toHaveBeenLastCalledWith(DROPOFF.x, DROPOFF.z, DROPOFF.radius);

  s.at(DROPOFF, 'driving'); s.commands.interact();
  expect(job()).toBeNull();
  expect(useJobStore.getState().result).toMatchObject({ status: 'completed', payoutPhp: 450 });
  expect(payouts(s.wallet)).toHaveLength(1);
  expect(s.wallet.snapshot().walletPhp).toBe(5450);
  expect(s.marker.hide).toHaveBeenCalled();
});

it('can be replayed without reloading', () => {
  const s = setup();
  for (let i = 0; i < 2; i++) {
    s.at(BOARD, 'walking'); s.commands.interact(); s.commands.acceptJob('kyo_ice_run');
    s.at(PICKUP, 'driving'); s.commands.interact();
    s.at(DROPOFF, 'driving'); s.commands.interact();
  }
  expect(payouts(s.wallet).map(tx => tx.relatedEntityId)).toEqual(['kyo_ice_run#1', 'kyo_ice_run#2']);
  s.at(BOARD, 'walking'); s.commands.interact();
  expect(useJobStore.getState().board?.listings[0]).toMatchObject({ status: 'available', completedCount: 2 });
});

it('fails on time, cargo damage or joining a race, and abandons, all without pay', () => {
  const s = setup();
  const take = () => { s.at(BOARD, 'walking'); s.commands.interact(); s.commands.acceptJob('kyo_ice_run'); s.at(PICKUP, 'driving'); };
  take(); s.system.update(KYO_ICE_RUN.timeLimitSeconds! + 1);
  expect(useJobStore.getState().result).toMatchObject({ status: 'failed', reason: 'Out of time.', payoutPhp: 0 });

  take(); s.vehicle.impactSerial++; s.vehicle.impactStrength = 1; s.system.update(.1);
  expect(s.jobs.current?.cargoDamage).toBe(0); // Nothing loaded yet.
  s.commands.interact(); s.vehicle.impactSerial++; s.system.update(.1);
  expect(job()?.cargo).toMatchObject({ damagePct: 40 });
  s.vehicle.impactSerial++; s.system.update(.1);
  expect(useJobStore.getState().result).toMatchObject({ status: 'failed', reason: 'Ice & milk got damaged.' });

  take(); s.world.racing = true; s.system.update(.1);
  expect(useJobStore.getState().result).toMatchObject({ status: 'failed', reason: 'You left the job for a race.' });
  s.world.racing = false;

  take(); s.commands.abandonJob();
  expect(useJobStore.getState().result).toMatchObject({ status: 'abandoned', payoutPhp: 0 });
  expect(payouts(s.wallet)).toHaveLength(0);
  expect(s.jobs.outcomes('kyo_ice_run')).toEqual({ completed: 0, failed: 3, abandoned: 1 });
});

it('rechecks board access for remote commands', () => {
  const s = setup();
  s.commands.acceptJob('kyo_ice_run');
  expect(s.errors.at(-1)).toBe('Check a job board first.');
  s.commands.interact(); s.at({ x: 0, z: 0 }, 'walking');
  expect(useJobStore.getState().board).toBeNull();
  s.commands.acceptJob('kyo_ice_run');
  expect(s.jobs.current).toBeNull();
  s.at(BOARD, 'walking'); s.world.racing = true; s.commands.interact();
  expect(useJobStore.getState().board).toBeNull();
});

it('persists the job in progress across a runtime restart', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const wallet = new VehicleSession();
  const first = setup(storage, wallet);
  first.commands.interact(); first.commands.acceptJob('kyo_ice_run');
  first.at(PICKUP, 'driving'); first.commands.interact(); first.system.update(3);
  first.system.dispose();

  const second = setup(storage, wallet);
  expect(second.jobs.current).toMatchObject({ status: 'active', objectiveIndex: 1, cargoLoaded: true });
  expect(second.jobs.current!.elapsedSeconds).toBeCloseTo(3);
  second.at(DROPOFF, 'driving'); second.commands.interact();
  expect(payouts(wallet)).toHaveLength(1);
});
