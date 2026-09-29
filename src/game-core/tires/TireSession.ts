import { z } from 'zod';
import { CORNER_IDS, type CornerId } from './corners';
import { FAILURE_STATES, assemblySchema, isFlat, newAssembly, type TireAssembly } from './assembly';

export const TIRE_SESSION_KEY = 'pang-daily.tires.v1';

const cornersSchema = z.object({ FL: z.string().nullable(), FR: z.string().nullable(), RL: z.string().nullable(), RR: z.string().nullable() });
const vehicleSchema = z.object({
  corners: cornersSchema,
  /** Spare well: one assembly, or empty once the spare is on the car. */
  spare: z.string().nullable(),
  jack: z.boolean(),
  wrench: z.boolean(),
  /** Other assemblies riding in the trunk (the removed flat, a second spare). */
  trunk: z.array(z.string()).default([]),
  /** Roadside job in progress. Persisted so a reload never drops the car off the jack or refits a wheel. */
  jacked: z.enum(CORNER_IDS).nullable().default(null),
  loosened: z.array(z.enum(CORNER_IDS)).default([]),
  /** Assembly in the player's hands. */
  held: z.string().nullable().default(null),
  /** Assemblies ever issued to this car; ids are `<vehicleId>#<n>` so they're unique across cars and saves. */
  serial: z.number().int().nonnegative().default(0),
});
export type VehicleTires = z.infer<typeof vehicleSchema>;
const saveSchema = z.object({
  version: z.literal(1),
  serial: z.number().int().nonnegative(),
  assemblies: z.record(z.string(), assemblySchema),
  vehicles: z.record(z.string(), vehicleSchema),
});
export type TireSave = z.infer<typeof saveSchema>;
/** One car's tires with every assembly it owns: the unit the server stores and validates. */
export const vehicleTireStateSchema = z.object({ car: vehicleSchema, assemblies: z.record(z.string(), assemblySchema) });
export type VehicleTireState = z.infer<typeof vehicleTireStateSchema>;

/** Every assembly id the car owns, wherever it sits. */
export function ownedAssemblyIds(car: VehicleTires): string[] {
  return [...CORNER_IDS.map(c => car.corners[c]), car.spare, car.held, ...car.trunk].filter((id): id is string => !!id);
}

/** Four road tires, a donut spare, a jack and a wrench, with ids the client and server agree on. */
export function stockVehicleTires(vehicleId: string): VehicleTireState {
  const assemblies: Record<string, TireAssembly> = {};
  let serial = 0;
  const make = (spec: 'standard' | 'donut' = 'standard') => {
    const tire = newAssembly(`${vehicleId}#${++serial}`, spec);
    assemblies[tire.id] = tire;
    return tire.id;
  };
  const corners = { FL: make(), FR: make(), RL: make(), RR: make() };
  const spare = make('donut');
  return { car: { corners, spare, jack: true, wrench: true, trunk: [], jacked: null, loosened: [], held: null, serial }, assemblies };
}

const EPS = 1e-6;
/**
 * Why `after` can't follow `before` for a saved car, or null. Driving and roadside work only ever
 * lose air, rubber and rims and move wheels around; healing, new assemblies and new tools need a
 * server-priced service. The server runs this on every tire checkpoint.
 */
export function tireCheckpointRejection(before: VehicleTireState, after: VehicleTireState): string | null {
  const was = ownedAssemblyIds(before.car), now = ownedAssemblyIds(after.car);
  if (new Set(now).size !== now.length) return 'A wheel is in two places at once.';
  if (was.length !== now.length || was.some(id => !now.includes(id))) return 'Wheels cannot appear or disappear outside a service.';
  if (Object.keys(after.assemblies).some(id => !now.includes(id))) return 'The save lists a wheel the car does not have.';
  if (after.car.serial !== before.car.serial) return 'New wheels need a service.';
  if ((after.car.jack && !before.car.jack) || (after.car.wrench && !before.car.wrench)) return 'Tools cannot appear outside a service.';
  if (after.car.jacked && !after.car.jack) return 'The car is on a jack it does not have.';
  for (const id of now) {
    const a = before.assemblies[id], b = after.assemblies[id];
    if (!a || !b) return 'A wheel is missing its state.';
    if (b.spec !== a.spec) return 'A tire changed type outside a service.';
    if (b.pressureKpa > a.pressureKpa + EPS) return 'Tire pressure cannot rise outside a service.';
    if (b.health > a.health + EPS) return 'Tire damage cannot heal outside a service.';
    if (b.rimDamage < a.rimDamage - EPS) return 'Rim damage cannot heal outside a service.';
    if (b.flatDistanceM < a.flatDistanceM - EPS) return 'Flat distance cannot decrease.';
    if (FAILURE_STATES.indexOf(b.failure) < FAILURE_STATES.indexOf(a.failure)) return 'A failed tire cannot repair itself.';
    if (b.failure === 'HEALTHY' && b.leakKpaPerMin > 0) return 'A healthy tire cannot leak.';
  }
  return null;
}

/**
 * Every wheel assembly the player owns and where it is. Assemblies are never created fresh on
 * load: a punctured tire stays punctured across save/load until it is physically swapped.
 */
export class TireSession {
  private state: TireSave;
  private readonly listeners = new Set<() => void>();

  private remote?: { execute(action: { type: string; [key: string]: unknown }): Promise<{ details: Record<string, string | number | boolean | null> }> };
  private readonly revisions: Record<string, string> = {};
  private lastPush = -Infinity;
  private pushing: Promise<void> | null = null;
  private again = false;
  /** Seconds between routine server checkpoints (leaks, driving wear). Failures and wheel work go immediately. */
  static readonly SERVER_INTERVAL_S = 30;
  get persistent() { return !!this.remote; }

  constructor(saved?: unknown, private readonly persist?: (save: TireSave) => void, private readonly now: () => number = () => Date.now() / 1000) {
    const parsed = saveSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, serial: 0, assemblies: {}, vehicles: {} };
  }

  snapshot(): TireSave { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  /** The car's tires, creating a stock set (four road tires, a donut spare, jack and wrench) the first time. */
  vehicle(vehicleId: string): VehicleTires {
    let car = this.state.vehicles[vehicleId];
    if (!car) {
      this.importVehicle(vehicleId, stockVehicleTires(vehicleId));
      car = this.state.vehicles[vehicleId];
      this.save({ urgent: true });
    }
    return car;
  }

  /** One car's tires and assemblies, detached. */
  exportVehicle(vehicleId: string): VehicleTireState {
    const car = this.vehicle(vehicleId);
    return structuredClone({ car, assemblies: Object.fromEntries(ownedAssemblyIds(car).map(id => [id, this.state.assemblies[id]])) });
  }

  /** Replaces one car's tires (server snapshot or service result). Other cars are untouched. */
  importVehicle(vehicleId: string, state: VehicleTireState) {
    const parsed = vehicleTireStateSchema.parse(state);
    const old = this.state.vehicles[vehicleId];
    if (old) for (const id of ownedAssemblyIds(old)) delete this.state.assemblies[id];
    this.state.vehicles[vehicleId] = parsed.car;
    Object.assign(this.state.assemblies, parsed.assemblies);
  }

  /**
   * Server saves: loads each car's confirmed tires, then checkpoints through `remote` instead of
   * local storage. `saved` maps vehicle id → { revision, state }; null state = never saved (stock).
   */
  useServer(remote: NonNullable<TireSession['remote']>, saved: Record<string, { revision: string; state: unknown | null }>) {
    this.remote = remote;
    for (const [vehicleId, entry] of Object.entries(saved)) {
      this.revisions[vehicleId] = entry.revision;
      const parsed = vehicleTireStateSchema.safeParse(entry.state);
      if (parsed.success) this.importVehicle(vehicleId, parsed.data);
    }
  }

  /** Server-priced tire service; applies the confirmed result. */
  async service(vehicleId: string, lineId: string) {
    if (!this.remote) throw new Error('Server persistence is not configured.');
    await this.flush();
    const receipt = await this.remote.execute({ type: 'tire_service', vehicleId, lineId });
    this.confirm(vehicleId, receipt.details);
    this.listeners.forEach(l => l());
    return receipt;
  }

  /** Server-priced catalogue work order; the server creates the physical assemblies. */
  async purchase(vehicleId: string, definitionId: string, quantity: 1 | 2 | 4, install: 'front' | 'rear' | 'all' | 'individual', corners?: import('./corners').CornerId[]) {
    if (!this.remote) throw new Error('Server persistence is not configured.');
    await this.flush();
    const receipt = await this.remote.execute({ type: 'tire_purchase', vehicleId, definitionId, quantity, install, corners });
    this.confirm(vehicleId, receipt.details);
    this.listeners.forEach(l => l());
    return receipt;
  }

  /** Sends any unsaved tire state now (scene exit, before a service). */
  flush(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.pushing) { this.again = true; return this.pushing; }
    this.lastPush = this.now();
    this.pushing = (async () => {
      try {
        do {
          this.again = false;
          for (const vehicleId of Object.keys(this.state.vehicles)) {
            const state = this.exportVehicle(vehicleId);
            if (this.sent.get(vehicleId) === JSON.stringify(state)) continue;
            const receipt = await this.remote!.execute({ type: 'vehicle_tires', vehicleId, revision: this.revisions[vehicleId] ?? '0', state });
            this.confirm(vehicleId, receipt.details);
            this.sent.set(vehicleId, JSON.stringify(state));
          }
        } while (this.again);
      } finally { this.pushing = null; }
    })();
    return this.pushing;
  }
  private readonly sent = new Map<string, string>();
  private confirm(vehicleId: string, details: Record<string, string | number | boolean | null>) {
    if (typeof details.tireRevision === 'string') this.revisions[vehicleId] = details.tireRevision;
    if (typeof details.tires === 'string') {
      const state = vehicleTireStateSchema.parse(JSON.parse(details.tires));
      this.importVehicle(vehicleId, state);
      this.sent.set(vehicleId, JSON.stringify(this.exportVehicle(vehicleId)));
    }
  }

  /** Fresh id for an assembly newly bought for `vehicleId`. */
  nextAssemblyId(vehicleId: string) { const car = this.vehicle(vehicleId); return `${vehicleId}#${++car.serial}`; }
  /** Registers a newly bought assembly; the caller places it. */
  adopt(tire: TireAssembly) { this.state.assemblies[tire.id] = tire; }

  assembly(id: string | null): TireAssembly | undefined { return id ? this.state.assemblies[id] : undefined; }
  /** Live assembly on a corner (mutable: the runtime steps it in place, then calls `save`). */
  mounted(vehicleId: string, corner: CornerId): TireAssembly | undefined { return this.assembly(this.vehicle(vehicleId).corners[corner]); }

  /** Where an assembly is, for inspection text and tests. */
  locate(id: string): { vehicleId: string; place: CornerId | 'spare' | 'trunk' | 'held' } | null {
    for (const [vehicleId, car] of Object.entries(this.state.vehicles)) {
      const corner = CORNER_IDS.find(c => car.corners[c] === id);
      if (corner) return { vehicleId, place: corner };
      if (car.spare === id) return { vehicleId, place: 'spare' };
      if (car.held === id) return { vehicleId, place: 'held' };
      if (car.trunk.includes(id)) return { vehicleId, place: 'trunk' };
    }
    return null;
  }

  /** Why the car can't be driven away, or null. */
  driveBlock(vehicleId: string): string | null {
    const car = this.vehicle(vehicleId);
    if (car.jacked) return 'Lower the car off the jack first';
    const empty = CORNER_IDS.find(c => !car.corners[c]);
    if (empty) return `The ${CORNER_NAMES[empty]} hub has no wheel`;
    if (car.loosened.length) return `Tighten the ${CORNER_NAMES[car.loosened[0]]} lug nuts first`;
    return null;
  }

  flatCorners(vehicleId: string): CornerId[] {
    return CORNER_IDS.filter(c => { const t = this.mounted(vehicleId, c); return !!t && isFlat(t); });
  }

  /**
   * Persists and notifies. Call after stepping assemblies or changing places. On server saves, routine
   * saves checkpoint at most every `SERVER_INTERVAL_S`; `urgent` (a failure, wheel work) goes now.
   */
  save({ urgent = false } = {}) {
    if (this.remote) {
      if (urgent || this.now() - this.lastPush >= TireSession.SERVER_INTERVAL_S) void this.flush().catch(() => { /* ServerPersistence reports it. */ });
    } else this.persist?.(this.snapshot());
    this.listeners.forEach(l => l());
  }

  /** Internal mutation for the wheel-change procedure. */
  mutate(vehicleId: string, change: (car: VehicleTires) => void) {
    change(this.vehicle(vehicleId));
    this.save({ urgent: true });
  }
}

export const CORNER_NAMES: Record<CornerId, string> = { FL: 'front-left', FR: 'front-right', RL: 'rear-left', RR: 'rear-right' };

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export function loadTireSession(storage?: StoragePort): TireSession {
  let saved: unknown = null;
  try { saved = JSON.parse(storage?.getItem(TIRE_SESSION_KEY) ?? 'null'); } catch { /* Start fresh if storage is corrupt. */ }
  return new TireSession(saved, save => { try { storage?.setItem(TIRE_SESSION_KEY, JSON.stringify(save)); } catch { /* Keep playing in memory. */ } });
}
