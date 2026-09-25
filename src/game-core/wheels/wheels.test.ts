import { describe, expect, it } from "vitest";
import { partDefinition } from "../parts/parts";
import { BANWA_DALAGAN_1996 } from "../vehicles/catalog";
import { parseVehicleDefinition, wheelSocketName, WHEEL_IDS, type VehicleDefinition } from "../vehicles/VehicleDefinition";
import { resolveVehicleStats } from "../vehicles/vehicleStats";
import { calculateFitment } from "./fitment";
import { BENT_RIM_GRIP_LOSS, wheelModifiers } from "./modifiers";
import { WHEEL_PARTS, wheelPart } from "./catalog";
import { parseWheelPart } from "./WheelPart";

const car = BANWA_DALAGAN_1996;
const part = (id: string) => wheelPart(id)!;

describe("wheel part schema", () => {
  it("accepts every catalog entry, survives JSON and has a marketplace listing", () => {
    for (const wheel of WHEEL_PARTS) {
      expect(parseWheelPart(JSON.parse(JSON.stringify(wheel)))).toEqual(wheel);
      const listing = partDefinition(wheel.id);
      expect(listing).toMatchObject({ category: "wheels", slots: ["wheels"], priceRange: wheel.market.priceRangePhp });
    }
    expect(WHEEL_PARTS.map((w) => w.id)).toEqual(["steelies_14", "mags_15_4x100", "oversized_17_deep_dish"]);
  });

  it("rejects bad data with a path", () => {
    const valid = structuredClone(part("mags_15_4x100"));
    expect(() => parseWheelPart({ ...valid, assetPath: "/model/wheels/mags.fbx" })).toThrow(/glb/);
    expect(() => parseWheelPart({ ...valid, fit: { ...valid.fit, offsetMm: 120 } })).toThrow(/offsetMm/);
    expect(() => parseWheelPart({ ...valid, modifiers: { ...valid.modifiers, grip: 0.9 } })).toThrow(/grip/);
    expect(() => parseWheelPart({ ...valid, market: { ...valid.market, priceRangePhp: [9000, 100] } })).toThrow(/min, max/);
    expect(() => parseWheelPart({ ...valid, spacerMm: 10 })).toThrow(/spacerMm/);
  });
});

describe("vehicle wheel sockets", () => {
  it("follows the wheel_<id>_socket convention on the starter", () => {
    for (const id of WHEEL_IDS) expect(car.wheels.sockets[id]).toBe(wheelSocketName(id));
  });

  it("rejects duplicate socket names and an inverted arch", () => {
    const copy = (change: (d: VehicleDefinition) => void) => {
      const d = structuredClone(car);
      change(d);
      return d;
    };
    expect(() => parseVehicleDefinition(copy((d) => (d.wheels.sockets.fr = d.wheels.sockets.fl)))).toThrow(/unique/);
    expect(() => parseVehicleDefinition(copy((d) => (d.wheels.arch.innerM = 0.9)))).toThrow(/innerM/);
  });
});

describe("calculateFitment", () => {
  it("reads stock wheels at stock height as clean", () => {
    const fit = calculateFitment(car, car.wheels.stock);
    expect(fit).toMatchObject({ state: "clean", issues: [], hubLiftM: 0, lateralShiftM: 0 });
    expect(fit.archGapM).toBeCloseTo(car.wheels.arch.gapM);
  });

  it("classifies the example sets: sunken steelies, flush mags, poking deep dish", () => {
    const steelies = calculateFitment(car, part("steelies_14").fit);
    expect(steelies.state).toBe("sunken");
    expect(steelies.lipM).toBeLessThan(-0.02);
    expect(calculateFitment(car, part("mags_15_4x100").fit).state).toBe("clean");
    const dish = calculateFitment(car, part("oversized_17_deep_dish").fit);
    expect(dish.state).toBe("poke");
    expect(dish.hubLiftM).toBeCloseTo(0.02);
    expect(dish.lateralShiftM).toBeCloseTo(0.03);
  });

  it("rubs when lowered too far, and harder when poking", () => {
    expect(calculateFitment(car, car.wheels.stock, -0.045).state).toBe("rubbing");
    expect(calculateFitment(car, car.wheels.stock, -0.03).state).toBe("clean");
    const dish = calculateFitment(car, part("oversized_17_deep_dish").fit, -0.02);
    expect(dish.issues).toEqual(["rubbing", "poke"]);
  });

  it("rubs the strut with a wide high-offset wheel", () => {
    const fit = calculateFitment(car, { diameterM: 0.6, widthM: 0.235, offsetMm: 70 });
    expect(fit.innerM).toBeLessThan(0);
    expect(fit.state).toBe("rubbing");
  });

  it("calls a jacked-up car a monster truck", () => {
    const fit = calculateFitment(car, part("steelies_14").fit, 0.03);
    expect(fit.issues).toEqual(["excessive_gap", "sunken"]);
    expect(fit.state).toBe("excessive_gap");
  });
});

describe("wheelModifiers", () => {
  it("is neutral for stock wheels", () => {
    expect(resolveVehicleStats(car, undefined, wheelModifiers(car, null))).toEqual(resolveVehicleStats(car));
  });

  it("applies grip/braking/acceleration and the weight of four wheels against stock", () => {
    const dish = part("oversized_17_deep_dish");
    const stats = resolveVehicleStats(car, undefined, wheelModifiers(car, dish));
    expect(stats.weightKg).toBeCloseTo(car.weight.curbKg + 4 * (dish.massKg - car.wheels.stock.massKg));
    expect(stats.tireGrip).toBeCloseTo(car.grip.tireGrip * 1.04);
    expect(stats.brakeDecelerationMps2).toBeCloseTo(car.braking.decelerationMps2 * 0.96);
    expect(stats.acceleration).toBeCloseTo(0.94);
    expect(stats.powerHp).toBe(car.power.peakPowerHp);
  });

  it("loses a little grip on a battered set and clamps condition", () => {
    const mags = part("mags_15_4x100");
    expect(wheelModifiers(car, mags, 0).grip).toBeCloseTo(1.06 * (1 - BENT_RIM_GRIP_LOSS));
    expect(wheelModifiers(car, mags, 2)).toEqual(wheelModifiers(car, mags, 1));
    expect(wheelModifiers(car, mags, null)).toEqual(wheelModifiers(car, mags, 1));
  });
});
