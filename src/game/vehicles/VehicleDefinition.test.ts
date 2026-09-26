import { describe, expect, it } from "vitest";
import { resolveHandlingPreset } from "./handling/HandlingConfig";
import { HANDLING_PRESETS } from "./handling/presets";
import { PLAYER_CARS, STARTER_SEDAN, playerCar } from "./VehicleDefinition";

/** The game-core spec, the handling preset and the collision shapes describe one car; keep them agreeing. */
describe.each(Object.values(PLAYER_CARS))("$spec.id runtime binding", (car) => {
  const { spec, collision } = car;
  const handling = resolveHandlingPreset(HANDLING_PRESETS, car.handlingPreset);

  it("tunes handling from the spec's drivetrain, weight and brakes", () => {
    expect(handling.drive.drivetrain).toBe(spec.drivetrain.layout);
    expect(handling.chassis.massKg).toBe(spec.weight.curbKg);
    expect(handling.chassis.frontWeight).toBe(spec.weight.frontWeightRatio);
    expect(handling.chassis.wheelbaseM).toBe(spec.dimensions.wheelbaseM);
    expect(handling.brakes.decelerationMps2).toBe(spec.braking.decelerationMps2);
    expect(handling.brakes.frontBias).toBe(spec.braking.frontBias);
  });

  it("places collision wheels where the spec says the wheels are", () => {
    expect(collision.wheels.radius).toBe(spec.dimensions.wheelRadiusM);
    expect(collision.wheels.frontZ - collision.wheels.rearZ).toBeCloseTo(spec.dimensions.wheelbaseM, 5);
    expect(collision.wheels.halfTrack * 2).toBeCloseTo(spec.dimensions.trackM, 5);
  });
});

describe("playerCar", () => {
  it("picks a car by spec id and falls back to the sedan", () => {
    expect(playerCar("hiraya_kidlat_1997").spec.id).toBe("hiraya_kidlat_1997");
    expect(playerCar("nope")).toBe(STARTER_SEDAN);
    expect(playerCar(null)).toBe(STARTER_SEDAN);
  });
});
