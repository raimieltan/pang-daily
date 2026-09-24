import { describe, expect, it, vi } from "vitest";
import { GameEvents } from "./GameEvents";

describe("GameEvents", () => {
  it("delivers typed payloads to subscribers", () => {
    const events = new GameEvents();
    const listener = vi.fn();
    events.on("statsUpdated", listener);

    events.emit("statsUpdated", { fps: 60 });

    expect(listener).toHaveBeenCalledWith({ fps: 60 });
  });

  it("stops delivering after unsubscribe", () => {
    const events = new GameEvents();
    const listener = vi.fn();
    const off = events.on("ready", listener);

    off();
    events.emit("ready");

    expect(listener).not.toHaveBeenCalled();
  });

  it("drops all listeners on clear", () => {
    const events = new GameEvents();
    const listener = vi.fn();
    events.on("paused", listener);

    events.clear();
    events.emit("paused", { paused: true });

    expect(listener).not.toHaveBeenCalled();
  });
});
