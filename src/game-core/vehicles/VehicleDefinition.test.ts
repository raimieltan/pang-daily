import { describe, expect, it } from "vitest";
import { BANWA_DALAGAN_1996, VEHICLE_CATALOG, getVehicleDefinition } from "./catalog";
import { parseVehicleDefinition, type VehicleDefinition } from "./VehicleDefinition";
import { PRISTINE_CONDITION, resolveVehicleStats } from "./vehicleStats";

const REAL_MAKES = ["mitsubishi", "honda", "toyota", "nissan", "mazda", "hyundai", "kia", "suzuki", "isuzu"];

function withChanges(change: (d: VehicleDefinition) => void): unknown {
  const copy = structuredClone(BANWA_DALAGAN_1996);
  change(copy);
  return copy;
}

describe("vehicle definition schema", () => {
  it("accepts every catalog entry and survives a JSON round trip (backend persistence)", () => {
    for (const definition of Object.values(VEHICLE_CATALOG)) {
      expect(parseVehicleDefinition(JSON.parse(JSON.stringify(definition)))).toEqual(definition);
    }
  });

  it("keeps catalog ids and keys in sync", () => {
    for (const [key, definition] of Object.entries(VEHICLE_CATALOG)) expect(definition.id).toBe(key);
    expect(getVehicleDefinition("banwa_dalagan_1996")).toBe(BANWA_DALAGAN_1996);
    expect(() => getVehicleDefinition("nope")).toThrow('Unknown vehicle definition "nope"');
  });

  it("never names a real manufacturer", () => {
    for (const { identity } of Object.values(VEHICLE_CATALOG)) {
      const text = `${identity.make} ${identity.model} ${identity.trim} ${identity.description}`.toLowerCase();
      for (const make of REAL_MAKES) expect(text).not.toContain(make);
    }
  });

  it("rejects unknown keys, bad ranges and inconsistent data with a path", () => {
    expect(() => parseVehicleDefinition(withChanges((d) => Object.assign(d, { topSpeed: 200 })))).toThrow(/topSpeed/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.reliability.baseline = 1.2)))).toThrow(/baseline/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.power.peakPowerRpm = 9000)))).toThrow(/redline/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.visual.rideHeight.defaultM = 0.2)))).toThrow(
      /rideHeight/,
    );
    expect(() =>
      parseVehicleDefinition(withChanges((d) => d.visual.model.attachments.push({ ...d.visual.model.attachments[0] }))),
    ).toThrow(/unique/);
    expect(() =>
      parseVehicleDefinition(withChanges((d) => (d.visual.model.attachments[0] = { slot: "hood", socket: "hood_socket", stockNode: null, anchor: null }))),
    ).toThrow(/anchor/);
    expect(() =>
      parseVehicleDefinition(withChanges((d) => (d.visual.model.attachments[1].socket = d.visual.model.attachments[0].socket))),
    ).toThrow(/socket names must be unique/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.tags = [])))).toThrow(/tags/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.visual.defaultPaint = "silver")))).toThrow(/rrggbb/);
    expect(() => parseVehicleDefinition(withChanges((d) => (d.id = "Banwa Dalagan")))).toThrow(/snake_case/);
  });
});

describe("resolveVehicleStats", () => {
  const stock = BANWA_DALAGAN_1996;

  it("returns the definition's numbers for a pristine car", () => {
    expect(resolveVehicleStats(stock, PRISTINE_CONDITION)).toEqual({
      powerHp: 98,
      torqueNm: 130,
      weightKg: 1080,
      tireGrip: 1,
      brakeDecelerationMps2: 8,
      reliability: 0.8,
      acceleration: 1,
    });
  });

  it("scales each stat by its components and multiplies effects on the same stat", () => {
    const stats = resolveVehicleStats(stock, { ...PRISTINE_CONDITION, engine: 0.5, transmission: 0 });
    // power: (1 - 0.35 * 0.5) * (1 - 0.1 * 1)
    expect(stats.powerHp).toBeCloseTo(98 * 0.825 * 0.9);
    expect(stats.torqueNm).toBeCloseTo(130 * 0.825 * 0.9);
    // reliability: (1 - 0.5 * 0.5) * (1 - 0.2 * 1)
    expect(stats.reliability).toBeCloseTo(0.8 * 0.75 * 0.8);
    expect(stats.tireGrip).toBe(1);
  });

  it("clamps out-of-range condition and leaves unhooked components inert", () => {
    const overHealed = resolveVehicleStats(stock, { ...PRISTINE_CONDITION, tires: 1.5, body: 0 });
    expect(overHealed).toEqual(resolveVehicleStats(stock, PRISTINE_CONDITION));
  });

  it("makes the typical starter noticeably worse than a fresh one", () => {
    const typical = resolveVehicleStats(stock, stock.condition.typical);
    expect(typical.powerHp).toBeLessThan(90);
    expect(typical.tireGrip).toBeLessThan(0.9);
    expect(typical.reliability).toBeLessThan(0.6);
  });
});
