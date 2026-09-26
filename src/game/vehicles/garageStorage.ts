const ACTIVE_CAR_KEY = 'pang-daily.active-car.v1';

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StoragePort | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

/** The car the player last chose at home, or null before they've picked one. */
export function loadActiveCar(port: StoragePort | undefined = storage()): string | null {
  try { return port?.getItem(ACTIVE_CAR_KEY) ?? null; } catch { return null; }
}

export function saveActiveCar(id: string, port: StoragePort | undefined = storage()): void {
  try { port?.setItem(ACTIVE_CAR_KEY, id); } catch { /* In-memory only: the swap still happens this load. */ }
}
