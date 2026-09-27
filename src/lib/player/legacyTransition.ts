/** Development save retirement only. No browser field is ever imported into an account. */
export const LEGACY_SAVES = [
  { key: 'pang-daily.vehicle-session.v1', versions: [1, 2] },
  { key: 'pang-daily.inventory.v1', versions: [1] },
  { key: 'pang-daily.marketplace.v1', versions: [1] },
  { key: 'pang-daily.job-session.v1', versions: [1] },
  { key: 'pang-daily.social-session.v1', versions: [1, 2, 3, 4] },
  { key: 'pang-daily.active-car.v1', versions: [] },
] as const;
export const TRANSITION_KEY = 'pang-daily.server-transition.v1';
const MARKER = JSON.stringify({ version: 1, policy: 'reset-development-progress', completed: true });
export type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LegacyStores = { local?: BrowserStorage; session?: BrowserStorage };
export type LegacySave = { area: 'local' | 'session'; key: string; raw: string | null;
  status: 'absent' | 'recognized' | 'unsupported' | 'corrupt' | 'unavailable'; version: number | null };
export type TransitionResult = { status: 'complete' | 'cleanup-pending' | 'storage-unavailable';
  hadLegacy: boolean; marked: boolean; saves: LegacySave[] };

/** Detects envelopes, not trusted gameplay data. Recognized never means importable. */
export function inspectLegacy(stores: LegacyStores): LegacySave[] {
  return (['local', 'session'] as const).flatMap(area => LEGACY_SAVES.map(format => {
    const result: LegacySave = { area, key: format.key, raw: null, status: 'absent', version: null };
    try {
      if (!stores[area]) return { ...result, status: 'unavailable' as const };
      result.raw = stores[area]!.getItem(format.key);
      if (result.raw === null) return result;
      if (format.key === 'pang-daily.active-car.v1') return { ...result, status: result.raw.trim() ? 'recognized' : 'corrupt' };
      const value: unknown = JSON.parse(result.raw);
      if (!value || typeof value !== 'object' || Array.isArray(value) || !('version' in value) ||
          typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version < 0) {
        return { ...result, status: 'corrupt' as const };
      }
      result.version = value.version;
      result.status = (format.versions as readonly number[]).includes(value.version) ? 'recognized' : 'unsupported';
      return result;
    } catch { return { ...result, status: result.raw === null ? 'unavailable' as const : 'corrupt' as const }; }
  }));
}

/** Call only after successful server hydration. Marker precedes any destructive cleanup. */
export function retireLegacy(stores: LegacyStores): TransitionResult {
  const saves = inspectLegacy(stores);
  const hadLegacy = saves.some(save => save.raw !== null);
  let marked = false;
  try {
    if (!stores.local) throw new Error('Storage unavailable');
    // Global policy marker, not a claimed import receipt or authentication evidence.
    if (stores.local.getItem(TRANSITION_KEY) !== MARKER) stores.local.setItem(TRANSITION_KEY, MARKER);
    marked = stores.local.getItem(TRANSITION_KEY) === MARKER;
  } catch { /* Preserve all legacy data if the marker cannot be committed. */ }
  if (!marked) return { status: 'storage-unavailable', hadLegacy, marked, saves };
  let pending = saves.some(save => save.status === 'unavailable');
  for (const save of saves) {
    if (save.raw === null) continue;
    try {
      const storage = stores[save.area]!;
      // Do not delete a value concurrently replaced by a development fixture/other tab.
      if (storage.getItem(save.key) !== save.raw) { pending = true; continue; }
      storage.removeItem(save.key);
      if (storage.getItem(save.key) !== null) pending = true;
    } catch { pending = true; }
  }
  return { status: pending ? 'cleanup-pending' : 'complete', hadLegacy, marked, saves };
}
export function browserLegacyStores(): LegacyStores {
  const stores: LegacyStores = {};
  if (typeof window === 'undefined') return stores;
  try { stores.local = window.localStorage; } catch { /* Restricted browser. */ }
  try { stores.session = window.sessionStorage; } catch { /* Restricted browser. */ }
  return stores;
}
