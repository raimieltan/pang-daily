import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Placeholder scene proving the runtime renders. No gameplay.
 * Palette follows ART_DIRECTION §5: charcoal night, asphalt ground, sodium-orange fill.
 */
export function createBootScene(engine: AbstractEngine, canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.06, 0.06, 0.07, 1);

  const camera = new ArcRotateCamera("bootCamera", -Math.PI / 2, Math.PI / 3, 18, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 6;
  camera.upperRadiusLimit = 40;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("bootLight", new Vector3(0.2, 1, 0.1), scene);
  light.diffuse = new Color3(1, 0.62, 0.3);
  light.groundColor = new Color3(0.08, 0.1, 0.14);
  light.intensity = 0.7;

  const asphalt = new StandardMaterial("asphalt", scene);
  asphalt.diffuseColor = new Color3(0.22, 0.22, 0.23);
  asphalt.specularColor = Color3.Black();

  const ground = CreateGround("ground", { width: 40, height: 40 }, scene);
  ground.material = asphalt;

  return scene;
}
