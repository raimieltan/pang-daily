import { describe, expect, it, vi } from "vitest";
import { SummaryPublisher } from "./SummaryPublisher";

describe("SummaryPublisher", () => {
  it("publishes on the first tick, then at most once per interval", () => {
    const publish = vi.fn();
    const publisher = new SummaryPublisher<{ speed: number }>(publish, 0.1);
    let speed = 0;
    const sample = () => ({ speed: speed++ });

    for (let i = 0; i < 12; i++) publisher.tick(1 / 60, sample);

    // Frame 0 publishes; the next is due once 0.1s (6 frames) have accumulated.
    expect(publish.mock.calls).toEqual([[{ speed: 0 }], [{ speed: 1 }]]);
  });

  it("skips unchanged summaries", () => {
    const publish = vi.fn();
    const publisher = new SummaryPublisher<{ speed: number; gear: number }>(publish, 0);

    publisher.tick(0.1, () => ({ speed: 50, gear: 2 }));
    publisher.tick(0.1, () => ({ speed: 50, gear: 2 }));
    publisher.tick(0.1, () => ({ speed: 50, gear: 3 }));

    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("does not sample when no update is due", () => {
    const sample = vi.fn(() => ({ speed: 1 }));
    const publisher = new SummaryPublisher<{ speed: number }>(() => {}, 1);

    publisher.tick(0, sample);
    publisher.tick(0.5, sample);

    expect(sample).toHaveBeenCalledOnce();
  });
});
