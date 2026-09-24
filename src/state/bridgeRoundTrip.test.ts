import { afterEach, describe, expect, it } from "vitest";
import { GameBridge } from "@/game/bridge";
import { createDebugSprintSystem, type SprintDefinition } from "@/game/scenes/debugSprint";
import { bindGameUiStore, useGameUiStore } from "./gameUiStore";
import { bindHudStore, useHudStore } from "./hudStore";

/**
 * End-to-end over the real bridge, minus Babylon rendering:
 * React-side command → runtime system → derived events → React-side stores.
 */
const sprint: SprintDefinition = {
  lengthMeters: 200,
  rivalSpeedsMps: [20, 60],
  startDialogue: "start",
  finishDialogue: "finish",
};

const FRAME = 1 / 60;

function setup() {
  const bridge = new GameBridge();
  const system = createDebugSprintSystem(bridge.runtime, { test_sprint: sprint });
  const unbind = [bindGameUiStore(bridge.ui), bindHudStore(bridge.ui.events)];
  const dialogue: string[] = [];
  bridge.ui.events.on("dialogueTriggered", ({ dialogueId }) => dialogue.push(dialogueId));
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += FRAME) system.update?.(FRAME);
  };
  return { commands: useGameUiStore.getState().commands!, run, dialogue, unbind };
}

let teardown: (() => void)[] = [];
afterEach(() => {
  teardown.forEach((off) => off());
  teardown = [];
});

describe("React ↔ game bridge round trip", () => {
  it("startRace from the UI drives HUD state and dialogue back into the UI", () => {
    const { commands, run, dialogue, unbind } = setup();
    teardown = unbind;

    commands.startRace("test_sprint");
    expect(useHudStore.getState().race).toEqual({ raceId: "test_sprint", position: 1, racers: 3 });
    expect(dialogue).toEqual(["start"]);

    run(1);
    const mid = useHudStore.getState();
    expect(mid.vehicle?.speedKmh).toBeGreaterThan(0);
    expect(mid.vehicle?.gear).toBeGreaterThan(0);
    // The 60 m/s rival pulls ahead immediately; the 20 m/s one is still ahead after 1s.
    expect(mid.race?.position).toBe(3);

    run(20);
    const done = useHudStore.getState();
    expect(done.race).toBeNull();
    expect(done.lastResult).toMatchObject({ raceId: "test_sprint", position: 2, racers: 3 });
    expect(done.lastResult?.timeMs).toBeGreaterThan(0);
    expect(dialogue).toEqual(["start", "finish"]);
  });

  it("surfaces refused commands as events instead of throwing into React", () => {
    const { commands, unbind } = setup();
    teardown = unbind;
    const bridgeEvents = useGameUiStore.getState().events!;
    const rejections: string[] = [];
    bridgeEvents.on("commandRejected", ({ reason }) => rejections.push(reason));

    commands.startRace("nope");
    commands.startRace("test_sprint");
    commands.startRace("test_sprint");
    commands.spawnAt("home");

    expect(rejections).toEqual([
      'Unknown race "nope"',
      'Already racing "test_sprint"',
      '"spawnAt" is not available right now',
    ]);
  });

  it("resets stores when unbound", () => {
    const { commands, run, unbind } = setup();
    commands.startRace("test_sprint");
    run(1);

    unbind.forEach((off) => off());

    expect(useHudStore.getState()).toMatchObject({ vehicle: null, race: null, lastResult: null });
    expect(useGameUiStore.getState().commands).toBeNull();
  });
});
