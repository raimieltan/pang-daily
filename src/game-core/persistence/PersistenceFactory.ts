import type { PersistencePort } from './PersistencePort';
import type { RuntimeBootstrap } from './RuntimeBootstrap';
import type { VehicleSession } from '../maintenance/VehicleSession';
import type { InventorySession } from '../inventory/InventorySession';
import type { JobSession } from '../jobs/JobSession';
import type { ListingView } from '../marketplace/listings';

export interface RuntimePersistence extends PersistencePort {
  marketplace(): Promise<ListingView[]>;
  checkpoint(): void;
  dispose(): void;
}
/** Injected by the application; the engine knows only domain sessions and intents. */
export type PersistenceFactory = (sessions: {
  initial: RuntimeBootstrap; wallet: VehicleSession; inventory: InventorySession; jobs: JobSession;
  report(message: string | null): void;
  refresh(state: RuntimeBootstrap): void;
}) => RuntimePersistence;
