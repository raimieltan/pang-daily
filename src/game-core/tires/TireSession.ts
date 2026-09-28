import { z } from 'zod';
import { CORNER_IDS, type CornerId } from './corners';
import { assemblySchema, isFlat, newAssembly, type TireAssembly } from './assembly';

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
});
export type VehicleTires = z.infer<typeof vehicleSchema>;
const saveSchema = z.object({
  version: z.literal(1),
  serial: z.number().int().nonnegative(),
  assemblies: z.record(z.string(), assemblySchema),
  vehicles: z.record(z.string(), vehicleSchema),
});
export type TireSave = z.infer<typeof saveSchema>;

/**
 * Every wheel assembly the player owns and where it is. Assemblies are never created fresh on
 * load: a punctured tire stays punctured across save/load until it is physically swapped.
 */
export class TireSession {
  private state: TireSave;
  private readonly listeners = new Set<() => void>();

  constructor(saved?: unknown, private readonly persist?: (save: TireSave) => void) {
    const parsed = saveSchema.safeParse(saved);
    this.state = parsed.success ? parsed.data : { version: 1, serial: 0, assemblies: {}, vehicles: {} };
  }

  snapshot(): TireSave { return structuredClone(this.state); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  /** The car's tires, creating a stock set (four road tires, a donut spare, jack and wrench) the first time. */
  vehicle(vehicleId: string): VehicleTires {
    let car = this.state.vehicles[vehicleId];
    if (!car) {
      const make = (spec: 'standard' | 'donut' = 'standard') => {
        const tire = newAssembly(`tire-${++this.state.serial}`, spec);
        this.state.assemblies[tire.id] = tire;
        return tire.id;
      };
      car = { corners: { FL: make(), FR: make(), RL: make(), RR: make() }, spare: make('donut'),
        jack: true, wrench: true, trunk: [], jacked: null, loosened: [], held: null };
      this.state.vehicles[vehicleId] = car;
      this.save();
    }
    return car;
  }

  /** Fresh id for a newly bought assembly. */
  nextAssemblyId() { return `tire-${++this.state.serial}`; }
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

  /** Persists and notifies. Call after stepping assemblies or changing places. */
  save() {
    this.persist?.(this.snapshot());
    this.listeners.forEach(l => l());
  }

  /** Internal mutation for the wheel-change procedure. */
  mutate(vehicleId: string, change: (car: VehicleTires) => void) {
    change(this.vehicle(vehicleId));
    this.save();
  }
}

export const CORNER_NAMES: Record<CornerId, string> = { FL: 'front-left', FR: 'front-right', RL: 'rear-left', RR: 'rear-right' };

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export function loadTireSession(storage?: StoragePort): TireSession {
  let saved: unknown = null;
  try { saved = JSON.parse(storage?.getItem(TIRE_SESSION_KEY) ?? 'null'); } catch { /* Start fresh if storage is corrupt. */ }
  return new TireSession(saved, save => { try { storage?.setItem(TIRE_SESSION_KEY, JSON.stringify(save)); } catch { /* Keep playing in memory. */ } });
}
