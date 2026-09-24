import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SceneDefinition } from "../engine/types";

const SPIN_RADIANS_PER_SECOND = 0.8;

/**
 * Minimal scene proving the lifecycle: renders, runs a system every frame,
 * freezes on pause, and tears down cleanly on switch.
 * Palette follows ART_DIRECTION §5: charcoal night, asphalt ground, sodium-orange fill.
 */
export const debugScene: SceneDefinition = {
  setup({ scene, addSystem }) {
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

    addSystem({
      name: "spinner",
      update(dt) {
        marker.rotation.y += SPIN_RADIANS_PER_SECOND * dt;
      },
    });
  },
};
