import type { SessionSnapshot } from '../maintenance/VehicleSession';
import type { InventorySave } from '../inventory/InventorySession';
import type { JobSave } from '../jobs/JobSession';
import type { SocialState } from '../social/contract';

export type RuntimeBootstrap = { vehicles: SessionSnapshot; inventory: InventorySave; jobs: JobSave; social: SocialState; interruptedRaces?: { attemptId: string; elapsedMs: number }[]; chapters?: { id: string; currentBeatId: string | null; completedAt: string | null; markers: string[]; beats?: { id: string; status: import('../progression/chapter').BeatStatus }[] }[];
  /** Saved tires per vehicle definition; null state = never saved (a stock set). */
  tires?: Record<string, { revision: string; state: unknown | null }>;
  activeDefinitionId: string; ownedDefinitionIds: string[]; instanceIdByDefinition: Record<string, string> };
