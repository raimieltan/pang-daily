import type { InventorySession } from '../../game-core/inventory/InventorySession';
import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { TUNE_IDS, TUNE_LABOR_PHP, TUNES, tuneIdSchema, type TuneId } from '../../game-core/tuning/tunes';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { VehicleRuntimeDefinition } from './VehicleDefinition';

export interface TunableVehicle {
  readonly id: string;
  readonly definition: VehicleRuntimeDefinition;
  useTune(tune: TuneId): void;
}
export type TuningView = {
  vehicleId: string; drivetrain: string; current: TuneId; laborPhp: number; walletPhp: number;
  options: { id: TuneId; label: string; description: string }[];
};
export type TuneReceipt = { tune: TuneId; label: string; laborPhp: number };

/** The saved tune drives the car in every scene; switching requires a parked car at the talyer. */
export class TuningSystem implements GameSystem {
  readonly name = 'tuning';
  private readonly release: (() => void)[];
  private published = '';
  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession,
    private readonly wallet: VehicleSession, private readonly vehicle: TunableVehicle, private readonly rejection: () => string | null) {
    this.release = [inventory.subscribe(() => this.sync()), wallet.subscribe(() => this.publish()),
      bridge.handle('setVehicleTune', ({ tune }) => this.change(tune)),
    ];
    this.sync();
  }
  private change(tune: TuneId): CommandOutcome | Promise<CommandOutcome> {
    if (!tuneIdSchema.safeParse(tune).success) return { rejected: 'Tito Jun does not know that tune.' };
    const rejected = this.rejection();
    if (rejected) return { rejected };
    const { label } = TUNES[tune];
    if (this.inventory.tune(this.vehicle.id) === tune) return { rejected: `Your car already runs the ${label.toLowerCase()} tune.` };
    const receipt: TuneReceipt = { tune, label, laborPhp: TUNE_LABOR_PHP };
    if (this.inventory.persistent) return this.inventory.execute({ type: 'vehicle_tune', vehicleId: this.vehicle.id, tune })
      .then(() => { this.bridge.emit('vehicleTuned', receipt); });
    const paid = this.wallet.spend(TUNE_LABOR_PHP, { kind: 'tune_labor', source: 'talyer', description: `Tune: ${label}`, relatedEntityId: this.vehicle.id });
    if ('rejected' in paid) return paid;
    const result = this.inventory.setTune(this.vehicle.id, tune);
    if (typeof result !== 'string') return result;
    this.bridge.emit('vehicleTuned', receipt);
  }
  private sync() {
    this.vehicle.useTune(this.inventory.tune(this.vehicle.id));
    this.publish();
  }
  private publish() {
    const { spec } = this.vehicle.definition, layout = spec.drivetrain.layout;
    const view: TuningView = { vehicleId: this.vehicle.id, drivetrain: layout, current: this.inventory.tune(this.vehicle.id),
      laborPhp: TUNE_LABOR_PHP, walletPhp: this.wallet.summary(spec).walletPhp,
      options: TUNE_IDS.map(id => ({ id, label: TUNES[id].label, description: TUNES[id].description[layout] })) };
    const key = JSON.stringify(view);
    if (key !== this.published) { this.published = key; this.bridge.emit('tuningState', view); }
  }
  dispose() { this.release.forEach(off => off()); this.bridge.emit('tuningState', null); }
}
