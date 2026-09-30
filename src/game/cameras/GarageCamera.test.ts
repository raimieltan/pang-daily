import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { GarageCamera } from "./GarageCamera";

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });

function setup(options: { open?: boolean; reducedMotion?: boolean } = {}) {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new UniversalCamera("cam", new Vector3(0, 30, -30), scene);
  // Parked facing +x, away from the origin, so the tests don't depend on an identity frame.
  const car = { position: new Vector3(10, 0, 5), forward: new Vector3(1, 0, 0) };
  const state = { open: options.open ?? true, reducedMotion: options.reducedMotion ?? false };
  const garage = new GarageCamera(scene, camera, car, () => null, () => state.open, () => state.reducedMotion);
  const run = (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) garage.update(1 / 60); };
  /** Eye position in the car's frame: forward, right (+ = car's right) and height. */
  const local = () => {
    const d = camera.position.subtract(car.position);
    return { forward: d.x, right: -d.z, up: d.y, distance: Math.hypot(d.x, d.z) };
  };
  return { garage, camera, car, state, run, local };
}

describe("garage camera", () => {
  it("leaves the camera alone while the talyer panel is closed", () => {
    const { camera, run } = setup({ open: false });
    run(2);
    expect(camera.position.equals(new Vector3(0, 30, -30))).toBe(true);
  });

  it("frames the wheels from a low side profile for suspension", () => {
    const { garage, run, local } = setup();
    garage.setSection("suspension");
    run(3);
    const eye = local();
    expect(Math.abs(eye.right)).toBeGreaterThan(Math.abs(eye.forward) * 3);
    expect(eye.up).toBeLessThan(1.2);
    expect(eye.distance).toBeGreaterThan(3);
  });

  it("swings behind the car for exterior parts and in front for repairs", () => {
    const { garage, run, local } = setup();
    garage.setSection("exterior");
    run(3);
    expect(local().forward).toBeLessThan(-2);
    garage.setSection("repairs");
    run(3);
    expect(local().forward).toBeGreaterThan(2);
  });

  it("turns the paint booth slowly around the car", () => {
    const { garage, run, local } = setup();
    garage.setSection("paint");
    run(2);
    const a = local();
    run(2);
    const b = local();
    expect(Math.atan2(a.right, a.forward)).not.toBeCloseTo(Math.atan2(b.right, b.forward), 1);
  });

  it("keeps a dragged view until the player picks another tab", () => {
    const { garage, run, local } = setup();
    garage.setSection("suspension");
    run(3);
    const shot = local();
    garage.drag(250, 0);
    run(2);
    const dragged = local();
    expect(Math.atan2(dragged.right, dragged.forward)).not.toBeCloseTo(Math.atan2(shot.right, shot.forward), 1);
    garage.zoom(-800);
    run(2);
    expect(local().distance).toBeLessThan(dragged.distance - .5);
    garage.setSection("suspension");
    run(3);
    expect(local().right).toBeCloseTo(shot.right, 1);
  });

  it("cuts straight to the shot, without the turntable, under reduced motion", () => {
    const { garage, local } = setup({ reducedMotion: true });
    garage.setSection("paint");
    garage.update(1 / 60);
    const a = local();
    expect(a.distance).toBeGreaterThan(3);
    for (let i = 0; i < 120; i++) garage.update(1 / 60);
    expect(local().right).toBeCloseTo(a.right, 3);
  });

  it("hands the camera back when the panel closes", () => {
    const { run, state, camera } = setup();
    run(2);
    state.open = false;
    run(2);
    camera.position.set(1, 2, 3);
    run(.5);
    expect(camera.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });
});
