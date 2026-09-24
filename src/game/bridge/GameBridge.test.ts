import { describe, expect, it, vi } from "vitest";
import { CommandBus } from "./GameCommands";
import { GameBridge } from "./GameBridge";

describe("CommandBus", () => {
  it("routes a typed payload to its handler", () => {
    const bus = new CommandBus();
    const handler = vi.fn();
    bus.handle("startRace", handler);

    expect(bus.dispatch("startRace", { raceId: "r1" })).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith({ raceId: "r1" });
  });

  it("reports commands with no handler, handler rejections, and handler errors", () => {
    const bus = new CommandBus();
    bus.handle("spawnAt", () => ({ rejected: "nope" }));
    bus.handle("startRace", () => {
      throw new Error("boom");
    });

    expect(bus.dispatch("pause")).toEqual({ ok: false, reason: '"pause" is not available right now' });
    expect(bus.dispatch("spawnAt", { spawnPointId: "x" })).toEqual({ ok: false, reason: "nope" });
    expect(bus.dispatch("startRace", { raceId: "r" })).toEqual({ ok: false, reason: "boom" });
  });

  it("allows one owner per command and frees it on release", () => {
    const bus = new CommandBus();
    const release = bus.handle("pause", () => {});

    expect(() => bus.handle("pause", () => {})).toThrow(/already has a handler/);
    release();
    expect(bus.dispatch("pause").ok).toBe(false);
    expect(() => bus.handle("pause", () => {})).not.toThrow();
  });

  it("ignores a stale release after the command was re-registered", () => {
    const bus = new CommandBus();
    const staleRelease = bus.handle("pause", () => {});
    staleRelease();
    const handler = vi.fn();
    bus.handle("pause", handler);

    staleRelease();
    bus.dispatch("pause");

    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("GameBridge", () => {
  it("delivers UI commands to runtime handlers", () => {
    const bridge = new GameBridge();
    const handler = vi.fn();
    bridge.runtime.handle("spawnAt", handler);

    bridge.ui.commands.spawnAt("coffee_shop");

    expect(handler).toHaveBeenCalledWith({ spawnPointId: "coffee_shop" });
  });

  it("delivers runtime events to UI subscribers", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    bridge.ui.events.on("vehicleStateUpdated", listener);

    bridge.runtime.emit("vehicleStateUpdated", { speedKmh: 82, gear: 3 });

    expect(listener).toHaveBeenCalledWith({ speedKmh: 82, gear: 3 });
  });

  it("turns refused commands into commandRejected events", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    bridge.ui.events.on("commandRejected", listener);

    bridge.ui.commands.startRace("r1");

    expect(listener).toHaveBeenCalledWith({
      command: "startRace",
      reason: '"startRace" is not available right now',
    });
  });

  it("exposes no emit to the UI half", () => {
    const bridge = new GameBridge();
    expect("emit" in bridge.ui.events).toBe(false);
    // @ts-expect-error — GameEventSource is subscribe-only.
    void bridge.ui.events.emit;
  });
});
