import type { InventorySession } from '@/game-core/inventory/InventorySession';
import type { VehicleAppearance } from '@/game-core/exterior';
import type { VehicleDefinition } from '@/game-core/vehicles';
import type { Fitment } from '@/game-core/wheels';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';

export interface CustomizationVehicle {
  readonly id: string;
  readonly definition: { spec: VehicleDefinition };
  readonly fitment: Fitment;
  setAppearance(value: VehicleAppearance): void;
}
export type CustomizationView = VehicleAppearance & {
  vehicleId: string;
  limits: VehicleDefinition['visual']['rideHeight'];
  factoryPaint: string;
  fitment: Fitment;
};

/** Saved paint/stance apply in every scene; edits require a parked car at the talyer. */
export class CustomizationSystem implements GameSystem {
  readonly name = 'customization';
  private readonly release: (() => void)[];
  private applied = '';
  private published = '';
  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession,
    private readonly vehicle: CustomizationVehicle, private readonly rejection: () => string | null) {
    this.release = [inventory.subscribe(() => this.sync()),
      bridge.handle('setVehiclePaint', ({ color }) => this.change({ paint: color })),
      bridge.handle('setRideHeight', ({ offsetM }) => this.change({ rideHeightM: offsetM })),
    ];
    this.sync();
  }
  private value(): VehicleAppearance {
    const { visual } = this.vehicle.definition.spec;
    return this.inventory.appearance(this.vehicle.id) ?? { paint: visual.defaultPaint, rideHeightM: visual.rideHeight.defaultM };
  }
  private change(patch: Partial<VehicleAppearance>): CommandOutcome {
    const rejected = this.rejection();
    if (rejected) return { rejected };
    const value = { ...this.value(), ...patch };
    const { minM, maxM } = this.vehicle.definition.spec.visual.rideHeight;
    if (!Number.isFinite(value.rideHeightM) || value.rideHeightM < minM || value.rideHeightM > maxM) return { rejected: 'That ride height is outside this car’s suspension range.' };
    const result = this.inventory.setAppearance(this.vehicle.id, value);
    return 'rejected' in result ? result : undefined;
  }
  private sync() {
    const value = this.value();
    const key = JSON.stringify(value);
    if (key !== this.applied) { this.vehicle.setAppearance(value); this.applied = key; }
    this.update();
  }
  update() {
    const { visual } = this.vehicle.definition.spec;
    const view: CustomizationView = { ...this.value(), vehicleId: this.vehicle.id, limits: visual.rideHeight,
      factoryPaint: visual.defaultPaint, fitment: this.vehicle.fitment };
    const key = JSON.stringify(view);
    if (key !== this.published) { this.published = key; this.bridge.emit('customizationState', view); }
  }
  dispose() { this.release.forEach(off => off()); }
}
