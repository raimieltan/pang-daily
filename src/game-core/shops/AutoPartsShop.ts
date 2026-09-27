import type { InventorySession } from '../inventory/InventorySession';
import type { VehicleSession } from '../maintenance/VehicleSession';
import { NEW_PERFORMANCE_PARTS, USED_PERFORMANCE_PARTS } from '../performance/catalog';

export const AUTO_PARTS_SHOP_ID = 'banwa_auto_supply';
export const AUTO_PARTS_SHOP_NAME = 'Banwa Auto Supply';
export const AUTO_PARTS_STOCK = NEW_PERFORMANCE_PARTS.map(part => {
  const used = USED_PERFORMANCE_PARTS.find(p => part.satisfiesParts.includes(p.id))!;
  return { partId: part.id, name: part.name, category: part.category, pricePhp: part.priceRangePhp[0],
    usedReferencePhp: (used.priceRangePhp[0] + used.priceRangePhp[1]) / 2, replaces: used.name };
});
export type AutoPartsProduct = typeof AUTO_PARTS_STOCK[number];
export type AutoPartsPurchase = { itemId: string; name: string; pricePhp: number; transactionId: number };

/** Guaranteed new stock. The ledger is the receipt; replay repairs interrupted inventory delivery. */
export class AutoPartsShop {
  constructor(private readonly wallet: VehicleSession, private readonly inventory: InventorySession) { this.recover(); }
  recover() {
    for (const tx of this.wallet.snapshot().transactions) {
      if (tx.kind === 'parts_shop_purchase' && tx.source === AUTO_PARTS_SHOP_ID && tx.relatedEntityId && tx.amountPhp < 0) {
        if (this.inventory.hasAcquisition(`${AUTO_PARTS_SHOP_ID}:${tx.id}`)) continue;
        this.deliver(tx.relatedEntityId, tx.id, -tx.amountPhp);
      }
    }
  }
  private deliver(partId: string, transactionId: number, paidPhp: number) {
    if (!AUTO_PARTS_STOCK.some(p => p.partId === partId)) return { rejected: 'Unknown shop part.' };
    return this.inventory.add({ partId, condition: 1, revealedBy: 'known', key: `${AUTO_PARTS_SHOP_ID}:${transactionId}`,
      origin: { kind: 'parts_shop', shopId: AUTO_PARTS_SHOP_ID, transactionId, paidPhp } });
  }
  buy(partId: string): AutoPartsPurchase | { rejected: string } {
    const product = AUTO_PARTS_STOCK.find(p => p.partId === partId);
    if (!product) return { rejected: 'That part is not stocked here.' };
    const paid = this.wallet.spend(product.pricePhp, { kind: 'parts_shop_purchase', source: AUTO_PARTS_SHOP_ID,
      description: `Brand new: ${product.name}`, relatedEntityId: partId });
    if ('rejected' in paid) return paid;
    const item = this.deliver(partId, paid.id, product.pricePhp);
    if ('rejected' in item) return item;
    return { itemId: item.id, name: product.name, pricePhp: product.pricePhp, transactionId: paid.id };
  }
}
