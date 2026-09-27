import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
export const usePersistenceStore = create<{ error: string | null }>(() => ({ error: null }));
export function bindPersistenceStore(events: GameEventSource) {
  const off = events.on('persistenceError', error => usePersistenceStore.setState({ error }));
  return () => { off(); usePersistenceStore.setState({ error: null }); };
}
