import { createSuspension, type SavedSuspension, type SuspensionSetup } from '@/game-core/suspension/schema';
import { applySuspensionAction, type SuspensionAction } from '@/game-core/suspension/actions';
import { vehicleSuspensionBaseline } from '@/game-core/suspension/baseline';
import type { SuspensionSolver } from '@/game-core/suspension/solver';
import type { InventorySession } from '@/game-core/inventory/InventorySession';
import type { VehicleAppearance } from '@/game-core/exterior';
import type { VehicleDefinition } from '@/game-core/vehicles';
import type { Fitment } from '@/game-core/wheels';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';

/** Account saves wait this long after the last slider change; the car updates immediately. */
const SAVE_DEBOUNCE_S = 10;

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
  // Edits applied to the car but not yet sent to the server (account saves only).
  private pendingAppearance: Partial<VehicleAppearance> | null = null;
  private pendingSetup: SuspensionSetup | null = null;
  private pendingAge = 0;
  private flushing: Promise<void> | null = null;
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
    const saved = this.inventory.appearance(this.vehicle.id) ?? { paint: visual.defaultPaint, rideHeightM: visual.rideHeight.defaultM };
    return this.pendingAppearance ? { ...saved, ...this.pendingAppearance } : saved;
  }
  private change(patch: Partial<VehicleAppearance>): CommandOutcome | Promise<CommandOutcome> {
    const rejected = this.rejection();
    if (rejected) return { rejected };
    const value = { ...this.value(), ...patch };
    const { minM, maxM } = this.vehicle.definition.spec.visual.rideHeight;
    if (!Number.isFinite(value.rideHeightM) || value.rideHeightM < minM || value.rideHeightM > maxM) return { rejected: 'That ride height is outside this car’s suspension range.' };
    if (this.inventory.persistent) {
      this.pendingAppearance = { ...this.pendingAppearance, ...patch }; this.pendingAge = 0;
      this.sync(); return undefined;
    }
    const result = this.inventory.setAppearance(this.vehicle.id, value);
    return 'rejected' in result ? result : undefined;
  }
  private sync() {
    const value = this.value();
    const key = JSON.stringify(value);
    if (key !== this.applied) { this.vehicle.setAppearance(value); this.applied = key; }
    // A pending setup is already on the car; the server copy would roll it back.
    if (this.vehicle.setSuspension && !this.pendingSetup) {
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
    if (this.inventory.persistent) {
      if (action.kind === 'setup') {
        this.pendingSetup = result.setup; this.pendingAge = 0;
        this.vehicle.setSuspension?.(result); this.update(); return undefined;
      }
      // Parts, service and presets build on the current setup, so pending edits go first.
      return this.flush().then(() => this.inventory.execute({ type: 'vehicle_suspension', vehicleId: this.vehicle.id, action })).then(() => undefined);
    }
    const stored = this.inventory.setSuspension(this.vehicle.id, result);
    return 'rejected' in stored ? stored : undefined;
  }
  /** Sends pending edits now. On failure the car returns to the last saved state. */
  private flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => this.flush());
    const appearance = this.pendingAppearance, setup = this.pendingSetup;
    if (!appearance && !setup) return Promise.resolve();
    this.pendingAppearance = null; this.pendingSetup = null;
    const id = this.vehicle.id;
    this.flushing = (async () => {
      try {
        if (appearance) await this.inventory.execute({ type: 'vehicle_appearance', vehicleId: id, ...appearance });
        if (setup) await this.inventory.execute({ type: 'vehicle_suspension', vehicleId: id, action: { kind: 'setup', setup } });
      } catch (error) {
        this.bridge.emit('commandRejected', { command: 'suspensionAction', reason: error instanceof Error ? error.message : 'Saving the setup failed.' });
        this.applied = ''; this.suspensionApplied = ''; this.sync();
      } finally { this.flushing = null; }
    })();
    return this.flushing;
  }
  update(dt = 0) {
    this.checkpointAge += dt; this.viewAge += dt; this.pendingAge += dt;
    if ((this.pendingAppearance || this.pendingSetup) && this.pendingAge >= SAVE_DEBOUNCE_S && !this.flushing) void this.flush();
    const live = this.vehicle.suspension?.saved;
    // Damage checkpoints share the debounce, and wait for a pending setup: the server rejects a
    // checkpoint whose setup differs from the one it has saved.
    if (live && this.checkpointAge >= SAVE_DEBOUNCE_S && !this.checkpointPending && !this.pendingSetup && !this.flushing) {
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
  dispose() { void this.flush(); this.vehicle.previewSuspension?.("off"); this.release.forEach(off => off()); }
}
