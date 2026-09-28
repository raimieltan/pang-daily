import { describe, expect, it } from "vitest";
import { ArcadeHandlingModel, CORNERS, type AxleContact, type DriverInput } from "./ArcadeHandlingModel";
import { resolveHandlingPreset } from "./HandlingConfig";
import { HANDLING_PRESETS } from "./presets";
import { newAssembly, puncture, tireResponse, type TireSurface } from "@/game-core/tires";

const DT = 1 / 120;
const GROUNDED: AxleContact = { front: 1, rear: 1 };
const input = (throttle: number, brake: number, steer: number): DriverInput => ({ throttle, brake, steer });

function car(kmh: number) {
  const m = new ArcadeHandlingModel(resolveHandlingPreset(HANDLING_PRESETS, "fwd_worn_sedan"));
  m.state.vx = kmh / 3.6;
  return m;
}
/** Feeds each corner the response of its tire on its surface, like the runtime tire system. */
function fit(m: ArcadeHandlingModel, tires: ReturnType<typeof newAssembly>[], surfaces: TireSurface[] = ["asphalt", "asphalt", "asphalt", "asphalt"]) {
  tires.forEach((tire, i) => Object.assign(m.tires[i], tireResponse(tire, surfaces[i])));
}
/** Heading change (rad, + = right) after `seconds`. */
function drift(m: ArcadeHandlingModel, seconds: number, driver: DriverInput, contact = GROUNDED) {
  let heading = 0;
  for (let t = 0; t < seconds; t += DT) { m.step(DT, driver, contact); heading += m.state.yawRate * DT; }
  return heading;
}
const set = () => CORNERS.map((_, i) => newAssembly(`t${i}`));

describe("per-corner tires", () => {
  it("four healthy tires match the plain axle model exactly and stay symmetric", () => {
    const plain = car(80), fitted = car(80);
    fit(fitted, set());
    for (let t = 0; t < 3; t += DT) {
      plain.step(DT, input(.6, 0, .3), GROUNDED);
      fitted.step(DT, input(.6, 0, .3), GROUNDED);
    }
    expect(fitted.state).toEqual(plain.state);
    const straight = car(80);
    fit(straight, set());
    expect(Math.abs(drift(straight, 3, input(.4, 0, 0)))).toBeLessThan(1e-9);
    expect(straight.corners[0].fx).toBeCloseTo(straight.corners[1].fx, 6);
  });

  it("a front-left puncture pulls the car left through its own drag and grip, not injected yaw", () => {
    const m = car(80);
    const tires = set();
    puncture(tires[0], "BLOWOUT");
    fit(m, tires);
    const heading = drift(m, 2, input(.3, 0, 0));
    expect(heading).toBeLessThan(-.015);
    expect(m.corners[0].capN).toBeLessThan(m.corners[1].capN * .6);
    expect(m.corners[0].rollingN).toBeGreaterThan(0);
    // Light braking still pulls toward the dragging flat; hard braking saturates it and pulls away.
    const light = car(80), hard = car(80);
    fit(light, tires); fit(hard, tires);
    expect(drift(light, 1, input(0, .15, 0))).toBeLessThan(0);
    expect(drift(hard, 1, input(0, 1, 0))).toBeGreaterThan(0);
  });

  it("a rear flat hurts rear stability more than steering; a front flat hurts steering more", () => {
    const turn = (corner: number) => {
      const m = car(60);
      const tires = set();
      if (corner >= 0) puncture(tires[corner], "BLOWOUT");
      fit(m, tires);
      drift(m, 2.5, input(.4, 0, .5));
      return m;
    };
    const healthy = turn(-1), front = turn(1), rear = turn(3);
    expect(Math.abs(front.state.yawRate)).toBeLessThan(Math.abs(healthy.state.yawRate));
    expect(Math.abs(rear.diagnostics.bodySlip)).toBeGreaterThan(Math.abs(front.diagnostics.bodySlip));
  });

  it("mixed surfaces act per wheel: two right wheels on grass pull toward the grass under braking", () => {
    const m = car(70);
    fit(m, set(), ["asphalt", "grass", "asphalt", "grass"]);
    expect(m.tires[1].grip).toBeLessThan(m.tires[0].grip);
    expect(m.surfaceGrip).toBe(1);
    expect(drift(m, 1, input(0, 1, 0))).not.toBe(0);
  });

  it("a jacked corner carries no load and makes no force", () => {
    const m = car(0);
    m.tires[0].raised = true;
    m.step(DT, input(1, 0, 0), { ...GROUNDED, wheels: [true, true, true, true] });
    expect(m.corners[0].grounded).toBe(false);
    expect(m.corners[0].fx).toBe(0);
    expect(m.corners[0].normalLoadN).toBe(0);
  });

  it("the handbrake works through rear brake force alone", () => {
    const m = car(60);
    drift(m, .5, { ...input(0, 0, 0), handbrake: true });
    expect(m.corners[2].brakeN).toBeGreaterThan(0);
    expect(m.corners[2].brakeN).toBeGreaterThan(m.corners[0].brakeN * 3);
    expect(Math.abs(m.state.yawRate)).toBeLessThan(1e-9);
  });
});
