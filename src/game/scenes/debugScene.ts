import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SceneDefinition } from "../engine/types";
import { createDebugSprintSystem } from "./debugSprint";

const SPIN_RADIANS_PER_SECOND = 0.8;
/** Extra spin per m/s of sprint speed, so the marker visibly reacts to the race. */
const SPIN_PER_MPS = 0.15;

const SPAWN_POINTS: Readonly<Record<string, Vector3>> = {
  home: new Vector3(0, 1, 0),
  coffee_shop: new Vector3(-12, 1, 8),
  talyer: new Vector3(12, 1, -8),
};

/**
 * Minimal scene proving the lifecycle and the bridge: renders, runs systems
 * every frame, freezes on pause, tears down cleanly on switch, and handles
 * `spawnAt` / `startRace` (via the debug sprint) from React.
 * Palette follows ART_DIRECTION §5: charcoal night, asphalt ground, sodium-orange fill.
 */
export const debugScene: SceneDefinition = {
  setup({ scene, addSystem, bridge }) {
    scene.clearColor = new Color4(0.06, 0.06, 0.07, 1);

    const camera = new ArcRotateCamera("debugCamera", -Math.PI / 2, Math.PI / 3, 18, Vector3.Zero(), scene);
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 40;
    camera.attachControl(true);

    const light = new HemisphericLight("debugLight", new Vector3(0.2, 1, 0.1), scene);
    light.diffuse = new Color3(1, 0.62, 0.3);
    light.groundColor = new Color3(0.08, 0.1, 0.14);
    light.intensity = 0.7;

    const asphalt = new StandardMaterial("asphalt", scene);
    asphalt.diffuseColor = new Color3(0.22, 0.22, 0.23);
    asphalt.specularColor = Color3.Black();
    CreateGround("ground", { width: 40, height: 40 }, scene).material = asphalt;

    const marker = CreateBox("marker", { size: 2 }, scene);
    marker.position.y = 1;

    const sprint = addSystem(createDebugSprintSystem(bridge));

    bridge.handle("spawnAt", ({ spawnPointId }) => {
      const point = SPAWN_POINTS[spawnPointId];
      if (!point) return { rejected: `Unknown spawn point "${spawnPointId}"` };
      if (sprint.racing) return { rejected: "Can't respawn mid-race" };
      marker.position.copyFrom(point);
      bridge.emit("playerSpawned", { spawnPointId });
    });

    addSystem({
      name: "spinner",
      update(dt) {
        marker.rotation.y += (SPIN_RADIANS_PER_SECOND + sprint.speedMps * SPIN_PER_MPS) * dt;
      },
    });
  },
};
