import { AUTO_PARTS_SHOP_NAME, AUTO_PARTS_STOCK, AutoPartsShop, type AutoPartsProduct } from '../../game-core/shops/AutoPartsShop';
import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import type { InventorySession } from '../../game-core/inventory/InventorySession';
import type { RuntimePort, CommandOutcome } from '../bridge';
import type { GameSystem } from '../engine/types';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import { areaContains, type Interactable } from '../interaction/Interaction';
import type { PlayerMode } from '../player/PlayerMode';

export function autoPartsShopRejection(visit: { mode: PlayerMode; position: { x: number; y: number; z: number }; racing: boolean }, zones: readonly Interactable[]): string | null {
  if (visit.racing) return 'Finish or cancel the race before shopping.';
  if (visit.mode !== 'walking') return 'Get out and walk to the auto-parts counter beside Mang Boy’s talyer.';
  if (Math.abs(visit.position.y) > 2 || !zones.some(z => z.action === 'browse_auto_parts' && areaContains(z.area, visit.position.x, visit.position.z))) return 'Visit the Banwa Auto Supply counter beside Mang Boy’s talyer.';
  return null;
}
export type AutoPartsShopView = { name: string; walletPhp: number; products: AutoPartsProduct[] };
export type AutoPartsQuote = { id: string; product: AutoPartsProduct };
let instance = 0;
export class AutoPartsShopSystem implements GameSystem {
  readonly name = 'autoPartsShop';
  private readonly shop: AutoPartsShop;
  private readonly id = ++instance;
  private serial = 0;
  private open = false;
  private quote: AutoPartsQuote | null = null;
  private readonly release: (() => void)[];
  constructor(private readonly bridge: RuntimePort, private readonly wallet: VehicleSession, inventory: InventorySession,
    interactions: Pick<InteractionSystem, 'handle'>, private readonly rejection: () => string | null) {
    this.shop = new AutoPartsShop(wallet, inventory);
    this.release = [
      interactions.handle('browse_auto_parts', () => this.browse()),
      bridge.handle('openAutoPartsShop', () => this.browse()),
      bridge.handle('closeAutoPartsShop', () => this.close()),
      bridge.handle('quoteAutoPart', ({ partId }) => this.estimate(partId)),
      bridge.handle('buyAutoPart', ({ quoteId }) => this.buy(quoteId)),
      wallet.subscribe(() => this.publish()),
    ];
  }
  private browse(): CommandOutcome {
    const rejection = this.rejection(); if (rejection) return { rejected: rejection };
    this.open = true; this.clearQuote(); this.publish();
  }
  private publish() {
    if (this.open) this.bridge.emit('autoPartsShop', { name: AUTO_PARTS_SHOP_NAME, walletPhp: this.wallet.snapshot().walletPhp, products: AUTO_PARTS_STOCK.map(p => ({ ...p })) });
  }
  private estimate(partId: string): CommandOutcome {
    this.clearQuote();
    const rejection = this.rejection(); if (rejection) { this.close(); return { rejected: rejection }; }
    if (!this.open) return { rejected: 'Visit the auto-parts counter first.' };
    const product = AUTO_PARTS_STOCK.find(p => p.partId === partId);
    if (!product) return { rejected: 'That part is not stocked here.' };
    this.quote = { id: `auto-parts-${this.id}-${++this.serial}`, product: { ...product } };
    this.bridge.emit('autoPartsQuote', this.quote);
  }
  private buy(quoteId: string): CommandOutcome {
    const rejection = this.rejection(); if (rejection) { this.close(); return { rejected: rejection }; }
    if (!this.open || !this.quote || this.quote.id !== quoteId) return { rejected: 'Select a part for a fresh purchase quote.' };
    const quote = this.quote;
    if (AUTO_PARTS_STOCK.find(p => p.partId === quote.product.partId)?.pricePhp !== quote.product.pricePhp) { this.clearQuote(); return { rejected: 'The price changed. Select the part again.' }; }
    this.clearQuote(); // Consume before notifying wallet/inventory subscribers: duplicate clicks cannot pay twice.
    const purchase = this.shop.buy(quote.product.partId);
    if ('rejected' in purchase) return purchase;
    this.bridge.emit('autoPartPurchased', purchase);
  }
  update() { if (this.open && this.rejection()) this.close(); }
  private clearQuote() { this.quote = null; this.bridge.emit('autoPartsQuote', null); }
  private close() { this.open = false; this.clearQuote(); this.bridge.emit('autoPartsShop', null); }
  dispose() { this.close(); this.release.forEach(off => off()); }
}
