import type { VehicleCondition, VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import { drivingWear, emptyLoss, impactWear, SERVICE_COMPONENTS, type WearSample } from '../../game-core/maintenance/condition';
import { VehicleSession, type RepairQuote } from '../../game-core/maintenance/VehicleSession';
import type { CommandOutcome, RuntimePort } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { InteractionSystem } from '../interaction/InteractionSystem';

export interface MaintenanceVehicle {
  readonly definition: { spec: VehicleDefinition };
  readonly impactSerial: number;
  readonly impactStrength: number;
  maintenanceSample(racing: boolean): WearSample;
  setCondition(condition: VehicleCondition): void;
}
export type WorkshopAccess = { rejection(): string | null; interactions: Pick<InteractionSystem, 'handle'> };

/** Scene adapter only: sample runtime driving, publish slow summaries, validate workshop access. */
export class MaintenanceSystem implements GameSystem {
  readonly name = 'maintenance';
  private pending = emptyLoss();
  private elapsed = 0;
  private lastImpact: number;
  private quote: RepairQuote | null = null;
  private disposed = false;
  private readonly release: (() => void)[] = [];
  private readonly definition: VehicleDefinition;

  constructor(private readonly bridge: RuntimePort, private readonly session: VehicleSession,
    private readonly vehicle: MaintenanceVehicle, private readonly driving: () => boolean,
    private readonly racing: () => boolean = () => false, private readonly workshop?: WorkshopAccess) {
    this.definition = vehicle.definition.spec;
    this.lastImpact = vehicle.impactSerial;
    session.ensureVehicle(this.definition);
    const publish = () => {
      const summary = session.summary(this.definition);
      vehicle.setCondition(summary.condition);
      bridge.emit('maintenanceState', summary);
    };
    this.release.push(session.subscribe(publish)); publish();
    if (workshop) {
      this.release.push(workshop.interactions.handle('talk_mechanic', () => this.inspect()));
      this.release.push(bridge.handle('inspectVehicle', () => this.inspect()));
      this.release.push(bridge.handle('dismissRepair', () => this.closeQuote()));
      this.release.push(bridge.handle('repairVehicle', ({ quoteId, components }) => {
        const rejection = workshop.rejection();
        if (rejection) { this.closeQuote(); return { rejected: rejection }; }
        this.flush();
        if (!this.quote || this.quote.id !== quoteId) return { rejected: 'Ask Mang Boy for a current repair quote.' };
        const receipt = session.repair(this.definition, this.quote, components);
        if ('rejected' in receipt) return receipt;
        bridge.emit('repairCompleted', receipt);
        this.quote = session.quote(this.definition);
        bridge.emit('repairQuote', this.quote);
      }));
    }
  }

  inspect(): CommandOutcome {
    if (!this.workshop) return { rejected: 'Inspection is available at the talyer.' };
    const rejection = this.workshop.rejection();
    if (rejection) return { rejected: rejection };
    this.flush();
    this.quote = this.session.quote(this.definition);
    this.bridge.emit('repairQuote', this.quote);
  }

  update(dt: number) {
    if (this.disposed) return;
    if (this.driving()) {
      const loss = drivingWear(this.vehicle.maintenanceSample(this.racing()), dt, this.definition.reliability.wearRate);
      for (const key of SERVICE_COMPONENTS) this.pending[key] += loss[key];
    }
    if (this.vehicle.impactSerial !== this.lastImpact) {
      const loss = impactWear(this.vehicle.impactStrength);
      for (const key of SERVICE_COMPONENTS) this.pending[key] += loss[key];
      this.lastImpact = this.vehicle.impactSerial;
      this.flush();
    }
    this.elapsed += dt;
    if (this.elapsed >= 1) this.flush();
    if (this.quote && this.workshop?.rejection()) this.closeQuote();
  }

  private flush() {
    this.session.wear(this.definition, this.pending);
    this.pending = emptyLoss(); this.elapsed = 0;
  }
  private closeQuote() { this.quote = null; this.bridge.emit('repairQuote', null); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.flush(); this.closeQuote(); this.release.forEach(off => off());
  }
}
