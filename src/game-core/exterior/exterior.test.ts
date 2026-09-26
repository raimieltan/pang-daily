import { describe, expect, it } from "vitest";
import { BANWA_DALAGAN_1996, EXTERIOR_SLOTS } from "../vehicles";
import { PART_TEMPLATES } from "../parts/parts";
import {
  BODY_PARTS, BODY_PART_CATEGORIES, CATEGORY_SOCKETS, bodyPart, canRefinish, exteriorEffects, fitsVehicle,
  parseBodyPart, partReputation, resolveBodyPartLook, type BodyPartInput, type FittedBodyPart,
} from ".";

const car = BANWA_DALAGAN_1996;
const look = (id: string, condition: number | null, finish: Parameters<typeof resolveBodyPartLook>[1]["finish"] = null) =>
  resolveBodyPartLook(bodyPart(id)!, { condition, finish, bodyColor: "#2f5d8a", vehicleTags: car.tags });
const fitted = (id: string, condition: number | null, finish?: Parameters<typeof look>[2]): FittedBodyPart =>
  ({ part: bodyPart(id)!, look: look(id, condition, finish) });

const base: BodyPartInput = {
  id: "test_lip", name: "Test lip", description: "For tests.", fits: "Anything",
  category: "front_lip", socket: "front_lip", assetPath: "/model/body/test.glb",
  compatibleTags: ["universal"], construction: "polyurethane", rarity: "common", fitment: 0.5,
  paint: { paintable: true, finish: "primer", mismatchColor: null },
  market: { priceRangePhp: [100, 200], conditionRange: [0.5, 1] },
  effects: { weightKg: 1, drag: 0, downforce: 0, cooling: 0, reputation: 0 },
};

describe("body part schema", () => {
  it("parses a valid part and defaults the transform", () => {
    expect(parseBodyPart(base).transform).toEqual({ positionM: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 });
  });

  it("rejects a socket outside the category, painted non-paintables and mismatched without a colour", () => {
    expect(() => parseBodyPart({ ...base, socket: "spoiler" })).toThrow(/category's sockets/);
    expect(() => parseBodyPart({ ...base, paint: { paintable: false, finish: "primer", mismatchColor: null } })).toThrow(/non-paintable/);
    expect(() => parseBodyPart({ ...base, paint: { paintable: true, finish: "mismatched", mismatchColor: null } })).toThrow(/mismatchColor/);
    expect(() => parseBodyPart({ ...base, assetPath: "/model/body/test.obj" })).toThrow(/\.glb/);
    expect(() => parseBodyPart({ ...base, effects: { ...base.effects, drag: 0.5 } })).toThrow();
  });

  it("maps every category to real exterior sockets the starter car has", () => {
    const carSockets = new Set(car.visual.model.attachments.map((a) => a.slot));
    for (const category of BODY_PART_CATEGORIES) {
      for (const socket of CATEGORY_SOCKETS[category]) {
        expect(EXTERIOR_SLOTS).toContain(socket);
        expect(carSockets.has(socket)).toBe(true);
      }
    }
  });

  it("rejects bare-plastic finishes on metal and fiberglass at the data boundary", () => {
    for (const construction of ["steel", "aluminium", "fiberglass"] as const) {
      expect(() => parseBodyPart({ ...base, construction,
        paint: { ...base.paint, finish: "bare_plastic" },
      })).toThrow(/bare plastic requires/);
    }
    for (const construction of ["abs", "polyurethane"] as const) {
      const part = parseBodyPart({ ...base, construction,
        paint: { paintable: false, finish: "bare_plastic", mismatchColor: null },
      });
      expect(canRefinish(part, part.paint.finish)).toBe(true);
    }
  });

  it("rejects invalid condition, fitment and price ranges from external data", () => {
    for (const conditionRange of [[-0.1, 1], [0, 1.1], [0.8, 0.2]]) {
      expect(() => parseBodyPart({ ...base, market: { ...base.market, conditionRange } })).toThrow();
    }
    for (const priceRangePhp of [[0, 100], [200, 100], [1.5, 200]]) {
      expect(() => parseBodyPart({ ...base, market: { ...base.market, priceRangePhp } })).toThrow();
    }
    for (const fitment of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => parseBodyPart({ ...base, fitment })).toThrow();
    }
  });
});

describe("body part catalog", () => {
  it("has the ticket's example parts, all valid, unique, fitting the starter car and sold as parts", () => {
    expect(BODY_PARTS.map((p) => p.category)).toEqual(expect.arrayContaining(["front_lip", "chin", "side_skirt", "spoiler", "front_bumper", "fender", "hood"]));
    expect(new Set(BODY_PARTS.map((p) => p.id)).size).toBe(BODY_PARTS.length);
    const templates = new Map(PART_TEMPLATES.map((t) => [t.id, t]));
    for (const part of BODY_PARTS) {
      expect(parseBodyPart(part)).toEqual(part);
      expect(parseBodyPart(JSON.parse(JSON.stringify(part)))).toEqual(part);
      expect(canRefinish(part, part.paint.finish)).toBe(true);
      expect(fitsVehicle(part, car.tags)).toBe(true);
      expect(templates.get(part.id)).toMatchObject({ category: "body", slots: [part.socket] });
    }
    expect(fitsVehicle(bodyPart("dalagan_ducktail")!, ["kei", "hatchback"])).toBe(false);
    expect(fitsVehicle(bodyPart("marketplace_gt_wing")!, ["kei"])).toBe(true);
  });
});

describe("canRefinish", () => {
  it("lets paintable parts take paint, plastics strip bare, and keeps unpainted parts as they are", () => {
    const hood = bodyPart("vented_carbon_look_hood")!;
    const chin = bodyPart("acp_chin_splitter")!;
    const lip = bodyPart("universal_rubber_lip")!;
    const fender = bodyPart("dalagan_red_fender_fl")!;
    expect(canRefinish(hood, "body_color")).toBe(true);
    expect(canRefinish(hood, "bare_plastic")).toBe(false);
    expect(canRefinish(hood, "mismatched")).toBe(false);
    expect(canRefinish(lip, "bare_plastic")).toBe(true);
    expect(canRefinish(fender, "mismatched")).toBe(true);
    expect(canRefinish(chin, "body_color")).toBe(false);
    expect(canRefinish(chin, "fake_carbon")).toBe(true);
    expect(canRefinish(chin, "damaged")).toBe(true);
  });
});

describe("resolveBodyPartLook", () => {
  it("takes body colour, primer, someone else's paint and fake carbon", () => {
    expect(look("dalagan_ducktail", 1)).toMatchObject({ finish: "body_color", color: "#2f5d8a", wear: "clean" });
    expect(look("dalagan_primer_bumper", 1)).toMatchObject({ finish: "primer", color: "#8b8e89", clearCoat: 0 });
    expect(look("dalagan_red_fender_fl", 1).color).toBe("#8e2a2a");
    expect(look("vented_carbon_look_hood", 1)).toMatchObject({ finish: "fake_carbon", clearCoat: 1 });
    expect(look("dalagan_primer_bumper", 1, "body_color").color).toBe("#2f5d8a");
    expect(look("dalagan_ducktail", 1, "damaged")).toMatchObject({ finish: "damaged", wear: "scratched", roughness: 1 });
  });

  it("scratches worn parts and cracks only brittle ones", () => {
    expect(look("dalagan_ducktail", 0.5).wear).toBe("scratched");
    expect(look("dalagan_ducktail", 0.2).wear).toBe("cracked");
    expect(look("dalagan_primer_bumper", 0.2).wear).toBe("scratched");
    expect(look("dalagan_ducktail", 0.2).color).not.toBe(look("dalagan_ducktail", 1).color);
  });

  it("fits made-for parts tight and hangs universal junk on zip ties", () => {
    const ducktail = look("dalagan_ducktail", 1);
    expect(ducktail).toMatchObject({ fit: 0.85, fitState: "flush" });
    expect(look("dalagan_ducktail", 0).fitState).toBe("gappy");
    const wing = look("marketplace_gt_wing", 0.5);
    expect(wing.fitState).toBe("zip_tied");
    expect(wing.gapM).toBeGreaterThan(ducktail.gapM);
    expect(wing.tiltDeg).toBeGreaterThan(ducktail.tiltDeg);
  });
});

describe("exteriorEffects", () => {
  it("is neutral with nothing fitted", () => {
    expect(exteriorEffects([])).toMatchObject({ drag: 0, reputation: 0, repairCostPhp: 0, modifiers: { grip: 1, acceleration: 1, addedWeightKg: 0 } });
  });

  it("adds light weight, drag, downforce, cooling, reputation and repair cost", () => {
    const effects = exteriorEffects([fitted("marketplace_gt_wing", 0.9), fitted("vented_carbon_look_hood", 1)]);
    expect(effects.modifiers.addedWeightKg).toBe(bodyPart("marketplace_gt_wing")!.effects.weightKg - 6);
    expect(effects.drag).toBeGreaterThan(0.08);
    expect(effects.modifiers.acceleration).toBeLessThan(1);
    expect(effects.modifiers.acceleration).toBeGreaterThan(0.95);
    expect(effects.modifiers.grip).toBeCloseTo(1.02, 5);
    expect(effects.cooling).toBeCloseTo(0.08, 5);
    // The wing sits on zip ties: it needs a refit even when clean.
    expect(effects.repairCostPhp).toBeGreaterThan(0);
    expect(effects.repairCostPhp % 10).toBe(0);
  });

  it("only gives porma for parts that look finished", () => {
    const hood = bodyPart("vented_carbon_look_hood")!;
    expect(partReputation(hood, look("vented_carbon_look_hood", 1))).toBe(hood.effects.reputation);
    expect(partReputation(hood, look("vented_carbon_look_hood", 1, "primer"))).toBe(Math.floor(hood.effects.reputation / 2));
    expect(partReputation(hood, look("vented_carbon_look_hood", 0.2))).toBe(hood.effects.reputation - 2);
    expect(exteriorEffects([fitted("vented_carbon_look_hood", 0.2)]).repairCostPhp)
      .toBeGreaterThan(exteriorEffects([fitted("vented_carbon_look_hood", 1)]).repairCostPhp);
  });
});
