import { create } from 'zustand';
import type { GameEventSource } from '@/game/bridge';
import type { PersistenceFailure } from '@/lib/player/persistenceFailure';
export const usePersistenceStore = create<{ error: string | null; failure: PersistenceFailure | null; saving: boolean; saved: boolean; offline: boolean }>(() =>
  ({ error: null, failure: null, saving: false, saved: false, offline: false }));
export function bindPersistenceStore(events: GameEventSource) {
  const updateConnection = () => usePersistenceStore.setState({ offline: !navigator.onLine });
  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  const off = events.on('persistenceError', error => usePersistenceStore.setState({ error }));
  return () => { off(); window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection); usePersistenceStore.setState({ error: null, failure: null, saving: false, saved: false, offline: false }); };
}
