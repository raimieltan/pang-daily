import type { SessionSnapshot } from '../maintenance/VehicleSession';
import type { InventorySave } from '../inventory/InventorySession';
import type { JobSave } from '../jobs/JobSession';
import type { SocialState } from '../social/contract';

export type RuntimeBootstrap = { vehicles: SessionSnapshot; inventory: InventorySave; jobs: JobSave; social: SocialState;
  activeDefinitionId: string; ownedDefinitionIds: string[]; instanceIdByDefinition: Record<string, string> };
