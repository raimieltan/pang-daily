import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup";
import { ChaseCamera } from "../cameras/ChaseCamera";
import { DEFAULT_CHASE_CAMERA } from "../cameras/ChaseCameraConfig";
import type { SceneDefinition } from "../engine/types";
import { DriverControls } from "../input/DriverControls";
import { InputManager } from "../input/InputManager";
import { loadHavok } from "../physics/havok";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { GraphicsSystem } from "../rendering/GraphicsSystem";
import { GRAPHICS_PRESETS, type GraphicsQuality } from "../rendering/LightingConfig";
import { NightLighting } from "../rendering/NightLighting";
import { VehicleLights } from "../rendering/VehicleLights";
import { isHandlingPresetId } from "../vehicles/handling/presets";
import { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { STARTER_SEDAN } from "../vehicles/VehicleDefinition";
import { HUB_LAYOUT } from "../world/hub/hubLayout";
import { HubLocations, toVehiclePose } from "../world/hub/HubLocations";
import { buildChunk, WorldKit } from "../world/WorldChunk";

/**
 * The vertical-slice hub at night (docs/HUB_LAYOUT.md, docs/NIGHT_LIGHTING.md): home,
 * tambay coffee shop, talyer, gas station and convenience store on one driveable loop, with
 * the main road running out east toward the future mountain route.
 *
 * Every chunk is built up front for now; each is self-contained (geometry, props, colliders),
 * so streaming later only changes when `buildChunk` / `dispose` run.
 * `?spawn=<locationId>` picks the start, `?quality=high|medium|low` the graphics preset,
 * `?handling=<presetId>` the handling preset.
 */
export const hubScene: SceneDefinition = {
  async setup({ scene, engine, addSystem, bridge, signal }) {
    const params = new URLSearchParams(window.location.search);
    const havok = await loadHavok();
    if (signal.aborted) return;

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

    // All world meshes share one material, so Babylon's default order (material, then creation)
    // draws far chunks first and the car last, lighting every covered pixel and then painting
    // over it. Nearest-first lets the depth test skip hidden pixels before they are shaded.
    scene.setRenderingOrder(0, RenderingGroup.frontToBackSortCompare);
    const kit = new WorldKit(scene);
    const chunks = HUB_LAYOUT.chunks.map((chunk) => buildChunk(scene, chunk, kit));
    addSystem({ name: "hubChunks", dispose: () => (chunks.forEach((c) => c.dispose()), kit.dispose()) });

    const quality = params.get("quality");
    const preset = GRAPHICS_PRESETS[quality && quality in GRAPHICS_PRESETS ? (quality as GraphicsQuality) : "high"];
    const lamps = HUB_LAYOUT.chunks.flatMap((c) => c.lamps);
    const lighting = addSystem(new NightLighting(scene, lamps, kit.litMaterials, preset.lightPoolSize));

    const spawnPoints = Object.fromEntries(HUB_LAYOUT.locations.map((l) => [l.id, toVehiclePose(l.spawn)]));
    const requestedSpawn = params.get("spawn");
    const handling = params.get("handling");
    player = await PlayerVehicle.create(scene, world, controls, bridge, {
      definition: STARTER_SEDAN,
      spawnPoints,
      initialSpawn: requestedSpawn && requestedSpawn in spawnPoints ? requestedSpawn : "home",
      presetId: handling && isHandlingPresetId(handling) ? handling : undefined,
    });
    if (signal.aborted) return;

    const chase = new ChaseCamera(scene, player, DEFAULT_CHASE_CAMERA, controls);
    camera = chase;
    player.onPlaced = () => chase.snap();
    lighting.attachCar(player, player.visual.model.root.getChildMeshes());

    // Order: car state → locations (may teleport) → lights follow → camera → graphics readout.
    addSystem(player);
    addSystem(new HubLocations(HUB_LAYOUT, player, bridge));
    addSystem(new VehicleLights(scene, player));
    addSystem(chase);
    const pools = chunks.map((c) => c.pools).filter((m): m is Mesh => m !== null);
    addSystem(new GraphicsSystem(scene, engine, chase.camera, bridge, lighting, pools, preset.quality));
  },
};
