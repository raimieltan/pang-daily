const DEFAULT_INTERVAL_SECONDS = 0.1;

type Flat = Record<string, number | string | boolean | null>;

/**
 * Turns per-frame simulation into HUD-rate updates: samples at most every
 * `intervalSeconds` and only publishes when the summary actually changed.
 * Keeps the bridge (and React re-renders) off the frame loop.
 */
export class SummaryPublisher<T extends Flat> {
  private elapsed: number;
  private last: T | null = null;

  constructor(
    private readonly publish: (summary: T) => void,
    private readonly intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  ) {
    this.elapsed = intervalSeconds;
  }

  /** Call every frame; `sample` only runs when an update is due. */
  tick(dtSeconds: number, sample: () => T): void {
    this.elapsed += dtSeconds;
    if (this.elapsed < this.intervalSeconds) return;
    this.elapsed = 0;
    this.flush(sample());
  }

  /** Publish immediately (e.g. on race start/finish) if it differs from the last value. */
  flush(summary: T): void {
    if (this.last && shallowEqual(this.last, summary)) return;
    this.last = summary;
    this.publish(summary);
  }
}

function shallowEqual(a: Flat, b: Flat): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
