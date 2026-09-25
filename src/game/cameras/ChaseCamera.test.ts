import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { ChaseCamera, type ChaseTarget } from "./ChaseCamera";
import { DEFAULT_CHASE_CAMERA as C } from "./ChaseCameraConfig";

const DEG = Math.PI / 180;

type Car = { position: Vector3; forward: Vector3; speed: number; lookX: number };

let engine: NullEngine | null = null;
afterEach(() => {
  engine?.dispose();
  engine = null;
});

function setup(car: Partial<Car> = {}) {
  engine = new NullEngine();
  const scene = new Scene(engine);
  const target: Car = { position: Vector3.Zero(), forward: new Vector3(0, 0, 1), speed: 0, lookX: 0, ...car };
  const rig = new ChaseCamera(scene, target as ChaseTarget, C, target);
  return { target, rig, cam: rig.camera };
}

function setHeading(car: Car, yaw: number, pitch = 0) {
  car.forward.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/** Ground distance from the car to the camera, and the camera's yaw lag behind the car's heading. */
function measure(cam: ChaseCamera["camera"], car: Car) {
  const dx = car.position.x - cam.position.x;
  const dz = car.position.z - cam.position.z;
  const camYaw = Math.atan2(dx, dz);
  const carYaw = Math.atan2(car.forward.x, car.forward.z);
  let lag = carYaw - camYaw;
  lag -= 2 * Math.PI * Math.round(lag / (2 * Math.PI));
  return { distance: Math.hypot(dx, dz), lag };
}

describe("ChaseCamera", () => {
  it("snaps to the slow pose, directly behind the car", () => {
    const { cam, target } = setup({ position: new Vector3(10, 2, 5) });
    const m = measure(cam, target);
    expect(m.distance).toBeCloseTo(C.distance.slow, 5);
    expect(m.lag).toBeCloseTo(0, 5);
    expect(cam.position.y).toBeCloseTo(2 + C.height.slow, 5);
    expect(cam.fov).toBeCloseTo(C.fovDeg.slow * DEG, 5);
  });

  it("eases out distance and FOV with speed and stays inside the configured ranges", () => {
    const { cam, rig, target } = setup();
    const samples: number[] = [];
    for (let i = 0; i < 900; i++) {
      target.speed = Math.min(60, (i / 60) * 4); // 4 m/s², a strong launch for the sedan
      target.position.z += target.speed / 60;
      rig.update(1 / 60);
      samples.push(measure(cam, target).distance);
    }
    // Monotonic pull-back, no overshoot.
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    expect(samples.at(-1)).toBeCloseTo(C.distance.fast, 2);
    expect(cam.fov).toBeCloseTo(C.fovDeg.fast * DEG, 2);
    // Two seconds in (~30 km/h) it has hardly moved: no lurch on launch.
    expect(samples[119] - C.distance.slow).toBeLessThan((C.distance.fast - C.distance.slow) * 0.1);
  });

  it("barely moves at parking speeds", () => {
    const { cam, rig, target } = setup({ speed: 3 });
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    expect(measure(cam, target).distance - C.distance.slow).toBeLessThan(0.02);
  });

  it("trails a turn by a bounded lag and settles behind the car", () => {
    const { cam, rig, target } = setup({ speed: 20 });
    let yaw = 0;
    let maxLag = 0;
    for (let i = 0; i < 120; i++) {
      yaw += 1.2 / 60; // 1.2 rad/s, a hard arcade turn
      setHeading(target, yaw);
      rig.update(1 / 60);
      const { lag } = measure(cam, target);
      expect(lag).toBeGreaterThan(0); // the camera is always behind the turn, never ahead of it
      maxLag = Math.max(maxLag, lag);
    }
    expect(maxLag).toBeLessThanOrEqual(C.maxHeadingLagDeg * DEG + 1e-9);
    for (let i = 0; i < 180; i++) rig.update(1 / 60);
    expect(Math.abs(measure(cam, target).lag)).toBeLessThan(0.5 * DEG);
  });

  it("caps the lag when the car spins", () => {
    const { cam, rig, target } = setup({ speed: 10 });
    setHeading(target, Math.PI * 0.9);
    rig.update(1 / 60);
    expect(measure(cam, target).lag).toBeCloseTo(C.maxHeadingLagDeg * DEG, 5);
  });

  it("is frame-rate independent", () => {
    const run = (fps: number) => {
      const { cam, rig, target } = setup({ speed: 30 });
      let yaw = 0;
      for (let i = 0; i < fps * 2; i++) {
        yaw += 0.8 / fps;
        setHeading(target, yaw);
        target.position.addInPlace(target.forward.scale(30 / fps));
        target.position.y = i < fps ? 0 : 1.5;
        rig.update(1 / fps);
      }
      return cam.position.subtract(target.position);
    };
    // The car's own path differs with the step size, so compare the camera relative to the car.
    // What remains is the half-frame sampling lag of the turn: a few centimetres at 30 fps.
    expect(Vector3.Distance(run(30), run(144))).toBeLessThan(0.1);
  });

  it("swallows bumps but follows the car's height", () => {
    const { cam, rig, target } = setup({ speed: 25 });
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 600; i++) {
      const t = i / 120;
      target.position.y = 0.12 * Math.sin(2 * Math.PI * 10 * t); // 10 Hz, ±12 cm chatter
      setHeading(target, 0, 3 * DEG * Math.sin(2 * Math.PI * 10 * t));
      rig.update(1 / 120);
      if (t > 1) {
        lo = Math.min(lo, cam.position.y);
        hi = Math.max(hi, cam.position.y);
      }
    }
    expect(hi - lo).toBeLessThan(0.05);

    target.position.y = 4;
    setHeading(target, 0);
    for (let i = 0; i < 240; i++) rig.update(1 / 120);
    // 25 m/s for 5 s: the speed blend has settled.
    const t = 25 / C.topSpeed;
    const s = t * t * (3 - 2 * t);
    expect(cam.position.y).toBeCloseTo(4 + C.height.slow + (C.height.fast - C.height.slow) * s, 3);
  });

  it("never lets a drop leave the car behind", () => {
    const { rig, target } = setup();
    target.position.y = -20;
    rig.update(1 / 60);
    expect(rig.camera.position.y).toBeLessThanOrEqual(-20 + C.maxVerticalLag + C.height.slow + 1e-9);
  });

  it("rides a slope without dipping under the road behind the car", () => {
    const slope = 8 * DEG;
    const { cam, rig, target } = setup({ speed: 20 });
    setHeading(target, 0, slope);
    for (let i = 0; i < 360; i++) {
      target.position.addInPlace(target.forward.scale(20 / 120));
      rig.update(1 / 120);
      const roadUnderCamera = Math.max(0, cam.position.z) * Math.tan(slope);
      expect(cam.position.y - roadUnderCamera).toBeGreaterThan(1);
    }
    // Settled: the camera has tilted with the road, sitting lower relative to the car than on the flat.
    expect(cam.position.y - target.position.y).toBeLessThan(C.height.slow - 0.3);
  });

  it("looks around on input, springs back, and recenters instantly", () => {
    const { cam, rig, target } = setup();
    target.lookX = 1;
    for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(measure(cam, target).lag).toBeCloseTo(-C.lookYawDeg * DEG, 1);

    rig.recenter();
    rig.update(1 / 60);
    // Still holding the stick, so it starts swinging out again, but from behind the car.
    expect(Math.abs(measure(cam, target).lag)).toBeLessThan(C.lookYawDeg * DEG * 0.2);

    target.lookX = 0;
    for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(Math.abs(measure(cam, target).lag)).toBeLessThan(0.5 * DEG);
  });

  it("keeps its heading when the car points straight up", () => {
    const { cam, rig, target } = setup();
    target.forward.set(0, 1, 0);
    rig.update(1 / 60);
    expect(Number.isFinite(cam.position.x) && Number.isFinite(cam.position.z)).toBe(true);
    expect(cam.position.z).toBeLessThan(0);
  });
});
