import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import { areaContains, type Interactable } from '../interaction/Interaction';
import type { PlayerMode } from '../player/PlayerMode';
import { PLAYER_CARS } from '../vehicles/VehicleDefinition';

export const CAR_DEALER_NAME = 'Banwa Motors · Second-hand lot';

export function carDealerRejection(visit: { mode: PlayerMode; position: { x: number; y: number; z: number }; racing: boolean }, zones: readonly Interactable[]): string | null {
  if (visit.racing) return 'Finish or cancel the race before shopping for cars.';
  if (visit.mode !== 'walking') return 'Get out and walk to the Banwa Motors lot east of the auto-parts counter.';
  if (Math.abs(visit.position.y) > 2 || !zones.some(z => z.action === 'browse_car_dealer' && areaContains(z.area, visit.position.x, visit.position.z))) return 'Visit the Banwa Motors lot east of the auto-parts counter.';
  return null;
}
export type CarListing = { definitionId: string; name: string; drivetrain: string; pricePhp: number; owned: boolean };
export type CarDealerView = { name: string; walletPhp: number; listings: CarListing[] };
export type CarDealerQuote = { id: string; listing: CarListing };
export type CarPurchase = { vehicleId: string; definitionId: string; name: string; pricePhp: number; transactionId: number };

function listings(owned: readonly string[]): CarListing[] {
  return Object.values(PLAYER_CARS).map(({ spec }) => ({
    definitionId: spec.id,
    name: `${spec.identity.make} ${spec.identity.model} ${spec.identity.year}`,
    drivetrain: spec.drivetrain.layout.toUpperCase(),
    pricePhp: spec.market.basePricePhp,
    owned: owned.includes(spec.id),
  }));
}
let instance = 0;
/**
 * Sells the drivable catalogue for the server's `vehicle_purchase`. Only account sessions own
 * cars; standalone play already parks every car at home, so the lot refuses to open there.
 */
export class CarDealerSystem implements GameSystem {
  readonly name = 'carDealer';
  private readonly id = ++instance;
  private serial = 0;
  private open = false;
  private quote: CarDealerQuote | null = null;
  private readonly owned: string[];
  private readonly release: (() => void)[];
  constructor(private readonly bridge: RuntimePort, private readonly wallet: VehicleSession, owned: readonly string[] | undefined,
    interactions: Pick<InteractionSystem, 'handle'>, private readonly rejection: () => string | null) {
    this.owned = [...(owned ?? [])];
    this.release = [
      interactions.handle('browse_car_dealer', () => this.browse()),
      bridge.handle('openCarDealer', () => this.browse()),
      bridge.handle('closeCarDealer', () => this.close()),
      bridge.handle('quoteCar', ({ definitionId }) => this.estimate(definitionId)),
      bridge.handle('buyCar', ({ quoteId }) => this.buy(quoteId)),
      wallet.subscribe(() => this.publish()),
    ];
  }
  private refusal(): string | null {
    return this.rejection() ?? (this.wallet.persistent ? null : 'Sign in to buy cars. Without an account every car is already parked at home.');
  }
  private browse(): CommandOutcome {
    const refusal = this.refusal(); if (refusal) return { rejected: refusal };
    this.open = true; this.clearQuote(); this.publish();
  }
  private publish() {
    if (this.open) this.bridge.emit('carDealer', { name: CAR_DEALER_NAME, walletPhp: this.wallet.snapshot().walletPhp, listings: listings(this.owned) });
  }
  private estimate(definitionId: string): CommandOutcome {
    this.clearQuote();
    const refusal = this.refusal(); if (refusal) { this.close(); return { rejected: refusal }; }
    if (!this.open) return { rejected: 'Visit the Banwa Motors lot first.' };
    const listing = listings(this.owned).find(l => l.definitionId === definitionId);
    if (!listing) return { rejected: 'That car is not on the lot.' };
    if (listing.owned) return { rejected: 'You already own this model.' };
    this.quote = { id: `car-dealer-${this.id}-${++this.serial}`, listing };
    this.bridge.emit('carDealerQuote', this.quote);
  }
  private buy(quoteId: string): CommandOutcome | Promise<CommandOutcome> {
    const refusal = this.refusal(); if (refusal) { this.close(); return { rejected: refusal }; }
    if (!this.open || !this.quote || this.quote.id !== quoteId) return { rejected: 'Select a car for a fresh purchase quote.' };
    const quote = this.quote;
    // Clear only after server confirmation; failures keep the same quote retryable.
    return this.wallet.execute({ type: 'vehicle_purchase', operationTag: `dealer:${quote.id}`, definitionId: quote.listing.definitionId }).then(remote => {
      this.owned.push(quote.listing.definitionId);
      this.clearQuote(); this.publish();
      this.bridge.emit('carPurchased', { vehicleId: remote.resourceId!, definitionId: quote.listing.definitionId, name: quote.listing.name, pricePhp: quote.listing.pricePhp, transactionId: Number(remote.sequence) });
    });
  }
  update() { if (this.open && this.refusal()) this.close(); }
  private clearQuote() { this.quote = null; this.bridge.emit('carDealerQuote', null); }
  private close() { this.open = false; this.clearQuote(); this.bridge.emit('carDealer', null); }
  dispose() { this.close(); this.release.forEach(off => off()); }
}
