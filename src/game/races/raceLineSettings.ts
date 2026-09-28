const KEY = 'pang-daily:race-line';
let enabled = false;
let loaded = false;
const listeners = new Set<() => void>();

export function raceLineEnabled(): boolean {
  if (!loaded && typeof window !== 'undefined') {
    enabled = window.localStorage.getItem(KEY) === 'true';
    loaded = true;
  }
  return enabled;
}

export function setRaceLineEnabled(value: boolean): void {
  enabled = value;
  loaded = true;
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, String(value));
  listeners.forEach(listener => listener());
}

export function subscribeRaceLine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
