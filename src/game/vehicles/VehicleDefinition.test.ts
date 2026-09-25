import { describe, expect, it } from "vitest";
import { resolveHandlingPreset } from "./handling/HandlingConfig";
import { HANDLING_PRESETS } from "./handling/presets";
import { STARTER_SEDAN } from "./VehicleDefinition";

/** The game-core spec, the handling preset and the collision shapes describe one car; keep them agreeing. */
describe("STARTER_SEDAN runtime binding", () => {
  const { spec, collision } = STARTER_SEDAN;
  const handling = resolveHandlingPreset(HANDLING_PRESETS, STARTER_SEDAN.handlingPreset);

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
