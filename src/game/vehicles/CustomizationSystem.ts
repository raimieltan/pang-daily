import { createSuspension, type SavedSuspension } from '@/game-core/suspension/schema';
import { applySuspensionAction, type SuspensionAction } from '@/game-core/suspension/actions';
import { vehicleSuspensionBaseline } from '@/game-core/suspension/baseline';
import type { SuspensionSolver } from '@/game-core/suspension/solver';
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
  readonly suspension?: SuspensionSolver;
  readonly suspensionTelemetry?: ReturnType<SuspensionSolver['snapshot']>;
  readonly suspensionPreview?: string;
  setSuspension?(saved: SavedSuspension): void;
  previewSuspension?(mode: string): void;
}
export type CustomizationView = VehicleAppearance & {
  vehicleId: string;
  limits: VehicleDefinition['visual']['rideHeight'];
  factoryPaint: string;
  fitment: Fitment;
  suspension?: SavedSuspension;
  suspensionTelemetry?: ReturnType<SuspensionSolver['snapshot']>;
  preview?: string;
  drivetrain?: string;
};

/** Saved paint/stance apply in every scene; edits require a parked car at the talyer. */
export class CustomizationSystem implements GameSystem {
  readonly name = 'customization';
  private readonly release: (() => void)[];
  private applied = '';
  private published = '';
  private suspensionApplied = '';
  private checkpointAge = 0;
  private viewAge = 0;
  private checkpointPending = false;
  constructor(private readonly bridge: RuntimePort, private readonly inventory: InventorySession,
    private readonly vehicle: CustomizationVehicle, private readonly rejection: () => string | null) {
    this.release = [inventory.subscribe(() => this.sync()),
      bridge.handle('setVehiclePaint', ({ color }) => this.change({ paint: color })),
      bridge.handle('setRideHeight', ({ offsetM }) => this.change({ rideHeightM: offsetM })),
      bridge.handle('suspensionAction', ({ action }) => this.changeSuspension(action)),
      bridge.handle('previewSuspension', ({ mode }) => { const rejected = this.rejection(); if (rejected) return { rejected }; this.vehicle.previewSuspension?.(mode); this.update(); }),
    ];
    this.sync();
  }
  private value(): VehicleAppearance {
    const { visual } = this.vehicle.definition.spec;
    return this.inventory.appearance(this.vehicle.id) ?? { paint: visual.defaultPaint, rideHeightM: visual.rideHeight.defaultM };
  }
  private change(patch: Partial<VehicleAppearance>): CommandOutcome | Promise<CommandOutcome> {
    const rejected = this.rejection();
    if (rejected) return { rejected };
    const value = { ...this.value(), ...patch };
    const { minM, maxM } = this.vehicle.definition.spec.visual.rideHeight;
    if (!Number.isFinite(value.rideHeightM) || value.rideHeightM < minM || value.rideHeightM > maxM) return { rejected: 'That ride height is outside this car’s suspension range.' };
    if (this.inventory.persistent) return this.inventory.execute({ type: 'vehicle_appearance', vehicleId: this.vehicle.id, ...patch }).then(() => undefined);
    const result = this.inventory.setAppearance(this.vehicle.id, value);
    return 'rejected' in result ? result : undefined;
  }
  private sync() {
    const value = this.value();
    const key = JSON.stringify(value);
    if (key !== this.applied) { this.vehicle.setAppearance(value); this.applied = key; }
    if (this.vehicle.setSuspension) {
      const saved = this.inventory.suspension(this.vehicle.id) ?? createSuspension(vehicleSuspensionBaseline(this.vehicle.definition.spec), value.rideHeightM);
      const key = JSON.stringify(saved);
      if (key !== this.suspensionApplied) { this.suspensionApplied = key; this.vehicle.setSuspension(saved); }
    }
    this.update();
  }
  private changeSuspension(action: SuspensionAction): CommandOutcome | Promise<CommandOutcome> {
    const rejected = this.rejection(); if (rejected) return { rejected };
    const baseline = vehicleSuspensionBaseline(this.vehicle.definition.spec);
    const saved = this.vehicle.suspension?.saved ?? this.inventory.suspension(this.vehicle.id) ?? createSuspension(baseline);
    const result = applySuspensionAction(saved, action, baseline);
    if ('rejected' in result) return result;
    if (this.inventory.persistent) return this.inventory.execute({ type: 'vehicle_suspension', vehicleId: this.vehicle.id, action }).then(() => undefined);
    const stored = this.inventory.setSuspension(this.vehicle.id, result);
    return 'rejected' in stored ? stored : undefined;
  }
  update(dt = 0) {
    this.checkpointAge += dt; this.viewAge += dt;
    const live = this.vehicle.suspension?.saved;
    if (live && this.checkpointAge >= 2 && !this.checkpointPending) {
      this.checkpointAge = 0;
      const previous = this.inventory.suspension(this.vehicle.id);
      if (JSON.stringify(previous?.damage) !== JSON.stringify(live.damage)) {
        if (this.inventory.persistent) {
          this.checkpointPending = true;
          void this.inventory.execute({ type: 'vehicle_suspension', vehicleId: this.vehicle.id, action: { kind: 'checkpoint', state: structuredClone(live) } })
            .catch(error => this.bridge.emit('commandRejected', { command: 'suspensionAction', reason: error instanceof Error ? error.message : 'Suspension save failed.' }))
            .finally(() => { this.checkpointPending = false; });
        } else this.inventory.setSuspension(this.vehicle.id, live);
      }
    }
    if (dt > 0 && this.viewAge < .1) return; this.viewAge = 0;
    if (this.vehicle.suspensionPreview !== 'off' && this.rejection()) this.vehicle.previewSuspension?.('off');
    const { visual } = this.vehicle.definition.spec;
    const view: CustomizationView = { ...this.value(), vehicleId: this.vehicle.id, limits: visual.rideHeight,
      factoryPaint: visual.defaultPaint, fitment: this.vehicle.fitment,
      ...(live ? { suspension: structuredClone(live), suspensionTelemetry: this.vehicle.suspensionTelemetry, preview: this.vehicle.suspensionPreview, drivetrain: this.vehicle.definition.spec.drivetrain.layout } : {}) };
    const key = JSON.stringify(view);
    if (key !== this.published) { this.published = key; this.bridge.emit('customizationState', view); }
  }
  dispose() { this.vehicle.previewSuspension?.("off"); this.release.forEach(off => off()); }
}
