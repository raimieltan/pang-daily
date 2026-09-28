const KEY = 'pang-daily:traffic';
let enabled = true;
let loaded = false;
const listeners = new Set<() => void>();

export function trafficEnabled(): boolean {
  if (!loaded && typeof window !== 'undefined') {
    enabled = window.localStorage.getItem(KEY) !== 'false';
    loaded = true;
  }
  return enabled;
}

export function setTrafficEnabled(value: boolean): void {
  enabled = value;
  loaded = true;
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, String(value));
  listeners.forEach(listener => listener());
}

export function subscribeTraffic(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
