import { InventorySession } from '../../game-core/inventory/InventorySession';
import { MarketplaceSession } from '../../game-core/marketplace/MarketplaceSession';
import type { VehicleSession } from '../../game-core/maintenance/VehicleSession';
export const INVENTORY_SESSION_KEY = 'pang-daily.inventory.v1';
export const MARKET_SESSION_KEY = 'pang-daily.marketplace.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
function read(storage: StoragePort | undefined, key: string): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; /* Start fresh if storage is corrupt/unavailable. */ }
}
/** Same tab-scoped storage as the vehicle session; the wallet stays in `VehicleSession`. */
export function loadInventorySession(storage?: StoragePort): InventorySession {
  return new InventorySession(read(storage, INVENTORY_SESSION_KEY), save => storage?.setItem(INVENTORY_SESSION_KEY, JSON.stringify(save)));
}
export function loadMarketplaceSession(wallet: VehicleSession, inventory: InventorySession, storage?: StoragePort): MarketplaceSession {
  return new MarketplaceSession(wallet, inventory, read(storage, MARKET_SESSION_KEY), save => storage?.setItem(MARKET_SESSION_KEY, JSON.stringify(save)));
}
