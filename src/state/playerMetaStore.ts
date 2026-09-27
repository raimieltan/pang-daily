import { create } from 'zustand';
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';

export type PlayerMeta = {
  playerId: string; displayName: string; revision: string; runtime: RuntimeBootstrap;
  races: { attemptId: string; raceId: string; vehicleId: string; outcome: 'started' | 'win' | 'loss' | 'dnf'; elapsedMs: string | null }[];
  bestRaces: { raceId: string; elapsedMs: string; wins: number; finishes: number }[];
  unlocks: { id: string; locationId: string | null }[];
};
/** In-memory read model only. Never restored from browser storage. */
export const usePlayerMetaStore = create<{ player: PlayerMeta | null }>(() => ({ player: null }));
export function hydratePlayerMeta(player: PlayerMeta) {
  const current = usePlayerMetaStore.getState().player;
  if (current?.playerId === player.playerId && BigInt(current.revision) > BigInt(player.revision)) return false;
  usePlayerMetaStore.setState({ player: structuredClone(player) });
  return true;
}
