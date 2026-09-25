import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { ChaseCamera } from "../cameras/ChaseCamera";
import { DEFAULT_CHASE_CAMERA } from "../cameras/ChaseCameraConfig";
import type { SceneDefinition } from "../engine/types";
import { DriverControls } from "../input/DriverControls";
import { InputManager } from "../input/InputManager";
import { loadHavok } from "../physics/havok";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { isHandlingPresetId } from "../vehicles/handling/presets";
import { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { STARTER_SEDAN } from "../vehicles/VehicleDefinition";
import { buildDebugRoad } from "../world/debugRoad";

/**
 * Handling sandbox: the starter sedan on the debug road with a chase camera.
 * Bindings live in `input/InputActions.ts`: arrows/WASD or RT/LT/left stick to drive,
 * R/Y to recover in place, Backspace/Back to reset to spawn, Q/E or right stick to look, C/R3 to recenter.
 * `?handling=<presetId>` picks the starting preset; the debug panel can swap it live.
 * Palette follows ART_DIRECTION §5: charcoal night, asphalt, sodium-orange fill.
 */
export const drivingScene: SceneDefinition = {
  async setup({ scene, addSystem, bridge, signal }) {
    scene.clearColor = new Color4(0.06, 0.06, 0.07, 1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.004;
    scene.fogColor = new Color3(0.06, 0.06, 0.07);

    const sky = new HemisphericLight("drivingSky", new Vector3(0.2, 1, 0.1), scene);
    sky.diffuse = new Color3(1, 0.62, 0.3);
    sky.groundColor = new Color3(0.08, 0.1, 0.14);
    sky.intensity = 0.65;
    const key = new DirectionalLight("drivingKey", new Vector3(-0.4, -1, 0.6), scene);
    key.diffuse = new Color3(1, 0.85, 0.65);
    key.intensity = 0.5;

    const havok = await loadHavok();
    if (signal.aborted) return;

    // Registered up front so the scene manager tears them down even if setup fails or is aborted.
    // Order matters: sample input → step physics (runs the controller) → visuals/telemetry → camera.
    let player: PlayerVehicle | null = null;
    let camera: ChaseCamera | null = null;
    const input = addSystem(new InputManager(window));
    const controls = addSystem(
      new DriverControls(input, {
        onRecover: () => player?.recover(),
        onResetToSpawn: () => player?.reset(),
        onRecenterCamera: () => camera?.recenter(),
      }),
    );
    const world = addSystem(new PhysicsWorld(scene, havok));
    const road = buildDebugRoad(scene);

    const requested = new URLSearchParams(window.location.search).get("handling");
    player = await PlayerVehicle.create(scene, world, controls, bridge, {
      definition: STARTER_SEDAN,
      spawnPoints: road.spawnPoints,
      initialSpawn: "start",
      presetId: requested && isHandlingPresetId(requested) ? requested : undefined,
    });
    // Superseded while the model loaded: the scene (and the car in it) is already gone.
    if (signal.aborted) return;

    const chase = new ChaseCamera(scene, player, DEFAULT_CHASE_CAMERA, controls);
    camera = chase;
    player.onPlaced = () => chase.snap();
    addSystem(player);
    addSystem(chase);
  },
};
