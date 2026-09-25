import type { VehicleDefinition } from '../../game-core/vehicles/VehicleDefinition';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { FuelRequest } from '../../game-core/economy/economy';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { WorkshopAccess } from './MaintenanceSystem';

export type FuelQuote = { id: string; liters: number; costPhp: number; pricePhpPerLiter: number };
export type FuelReceipt = { liters: number; costPhp: number };

/** Pump access and quote lifecycle; all money and fuel mutations remain in game-core. */
export class FuelSystem implements GameSystem {
  readonly name = 'fuel';
  private open = false;
  private serial = 0;
  private quote: FuelQuote | null = null;
  private release: (() => void)[] = [];
  constructor(private bridge: RuntimePort, private session: VehicleSession,
    private definition: VehicleDefinition, private access: WorkshopAccess) {
    this.release.push(access.interactions.handle('refuel', () => this.inspect()));
    this.release.push(bridge.handle('quoteFuel', request => this.estimate(request)));
    this.release.push(bridge.handle('dismissFuel', () => this.close()));
    this.release.push(bridge.handle('purchaseFuel', ({ quoteId }) => {
      const rejection = access.rejection();
      if (rejection) { this.close(); return { rejected: rejection }; }
      if (!this.open || !this.quote || quoteId !== this.quote.id) return { rejected: 'Choose a fresh fuel quote before paying.' };
      const quote = this.quote;
      const current = session.fuelQuote(definition, { liters: quote.liters });
      if ('rejected' in current || current.liters !== quote.liters || current.costPhp !== quote.costPhp) {
        this.quote = null; bridge.emit('fuelQuote', null);
        return { rejected: 'Fuel level changed. Choose a new quantity.' };
      }
      const result = session.refuel(definition, { liters: quote.liters });
      if ('rejected' in result) return result;
      this.quote = null;
      bridge.emit('fuelQuote', null);
      bridge.emit('fuelPurchased', { liters: result.liters, costPhp: result.costPhp });
    }));
  }
  private inspect(): CommandOutcome {
    const rejection = this.access.rejection();
    if (rejection) return { rejected: rejection };
    this.quote = null; this.open = true;
    this.bridge.emit('fuelPanel', true);
    this.bridge.emit('fuelQuote', null);
  }
  private estimate(request: FuelRequest): CommandOutcome {
    this.quote = null; this.bridge.emit('fuelQuote', null);
    const rejection = this.access.rejection();
    if (rejection) { this.close(); return { rejected: rejection }; }
    if (!this.open) return { rejected: 'Visit a fuel pump first.' };
    const result = this.session.fuelQuote(this.definition, request);
    if ('rejected' in result) return { rejected: result.rejected };
    this.quote = { ...result, id: `fuel-${++this.serial}` };
    this.bridge.emit('fuelQuote', this.quote);
  }
  update() { if (this.open && this.access.rejection()) this.close(); }
  private close() {
    this.open = false; this.quote = null;
    this.bridge.emit('fuelQuote', null); this.bridge.emit('fuelPanel', false);
  }
  dispose() { this.close(); this.release.forEach(off => off()); this.release = []; }
}
