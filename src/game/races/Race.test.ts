import { describe, expect, it } from "vitest";
import { Race } from "./Race";
import { LOCAL_ROUTE } from "./localRoute";

function finishPlayer(race: Race) {
  for (const gate of [...LOCAL_ROUTE.checkpoints, LOCAL_ROUTE.finish]) {
    race.update(1 / 60, gate.center);
  }
}

describe("rival departure", () => {
  it("keeps driving after the player finishes, preserving results", () => {
    const race = new Race(LOCAL_ROUTE);
    race.start();
    race.update(3, LOCAL_ROUTE.start);
    finishPlayer(race);
    expect(race.phase).toBe("FINISHED");
    const result = [race.playerTime, race.opponentTime, race.elapsed, race.position];
    const position = { ...race.rival.position };
    race.update(1, LOCAL_ROUTE.finish.center);
    expect(race.rival.position).not.toEqual(position);
    expect(race.rival.departed).toBe(false);
    race.update(60, LOCAL_ROUTE.finish.center);
    expect(race.rival.departed).toBe(true);
    expect([race.playerTime, race.opponentTime, race.elapsed, race.position]).toEqual(result);
    race.start();
    expect(race.rival.departed).toBe(false);
    expect(race.rival.speed).toBe(0);
  });

  it("drives beyond the finish and departs while waiting for the player", () => {
    const race = new Race(LOCAL_ROUTE);
    race.start();
    race.update(3, LOCAL_ROUTE.start);
    for (let i = 0; i < 3600 && race.opponentTime === null; i++) {
      race.update(1 / 60, LOCAL_ROUTE.start);
    }
    expect(race.opponentTime).not.toBeNull();
    expect(race.rival.departed).toBe(false);
    const finishZ = race.rival.position.z;
    race.update(1, LOCAL_ROUTE.start);
    expect(race.rival.position.z).toBeLessThan(finishZ);
    race.update(10, LOCAL_ROUTE.start);
    expect(race.rival.departed).toBe(true);
    expect(race.phase).toBe("RUNNING");
    finishPlayer(race);
    expect(race.position).toBe(2);
  });
});
