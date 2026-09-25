import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it, vi } from "vitest";
import type { RuntimePort } from "../../bridge";
import type { VehiclePose } from "../../vehicles/VehicleBody";
import { HUB_LAYOUT } from "./hubLayout";
import { HubLocations } from "./HubLocations";

function setup() {
  const emit = vi.fn();
  const bridge = { emit, handle: vi.fn() } as unknown as RuntimePort;
  const placed: VehiclePose[] = [];
  const car = {
    position: new Vector3(),
    placeAt: (pose: VehiclePose) => {
      placed.push(pose);
      car.position.copyFrom(pose.position);
      return true;
    },
  };
  const hub = new HubLocations(HUB_LAYOUT, car, bridge);
  const at = (x: number, y: number, z: number) => {
    car.position.set(x, y, z);
    hub.update();
  };
  const events = () => emit.mock.calls.map(([name, payload]) => `${name}:${payload.locationId}`);
  return { hub, at, placed, events, emit };
}

const location = (id: string) => HUB_LAYOUT.locations.find((l) => l.id === id)!;

describe("HubLocations", () => {
  it("reports arriving at and leaving a location once, not every frame", () => {
    const { at, events } = setup();
    const cafe = location("coffee_shop");
    at(cafe.spawn.x, 0, cafe.spawn.z);
    at(cafe.spawn.x + 1, 0, cafe.spawn.z);
    at(0, 0, 80);
    expect(events()).toEqual(["locationEntered:coffee_shop", "locationExited:coffee_shop"]);
  });

  it("hands over directly between neighbouring locations", () => {
    const { at, events } = setup();
    const home = location("home");
    const talyer = location("talyer");
    at(home.spawn.x, 0, home.spawn.z);
    at(talyer.spawn.x, 0, talyer.spawn.z);
    expect(events()).toEqual(["locationEntered:home", "locationExited:home", "locationEntered:talyer"]);
  });

  it("puts a car that falls through the world back on the nearest return point", () => {
    const { at, placed, events } = setup();
    const gas = location("gas_station");
    at(gas.spawn.x, -12, gas.spawn.z);
    expect(placed).toHaveLength(1);
    expect(placed[0].position.x).toBe(gas.returnPoint.x);
    expect(placed[0].position.z).toBe(gas.returnPoint.z);
    expect(events()).toEqual(["playerReturned:gas_station"]);
  });

  it("returns a car that leaves the map past the mountain exit to the main road", () => {
    const { at, events } = setup();
    at(HUB_LAYOUT.bounds.maxX + 10, 0, 0);
    expect(events()).toEqual(["playerReturned:main_road"]);
  });

  it("sends a car back to its own location's return point when it leaves from there", () => {
    const { hub } = setup();
    for (const l of HUB_LAYOUT.locations) {
      expect(hub.nearest(l.returnPoint.x, l.returnPoint.z).id).toBe(l.id);
    }
  });
});
