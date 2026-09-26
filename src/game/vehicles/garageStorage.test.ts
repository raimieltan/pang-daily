import { describe, expect, it } from "vitest";
import { loadActiveCar, saveActiveCar } from "./garageStorage";

describe("garageStorage", () => {
  it("remembers the car picked at home", () => {
    const store = new Map<string, string>();
    const port = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadActiveCar(port)).toBeNull();
    saveActiveCar("hiraya_kidlat_1997", port);
    expect(loadActiveCar(port)).toBe("hiraya_kidlat_1997");
  });

  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(() => saveActiveCar("x", broken)).not.toThrow();
    expect(loadActiveCar(broken)).toBeNull();
  });
});
