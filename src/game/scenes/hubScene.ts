import { RaceSystem } from "../races/RaceSystem";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup";
import { ChaseCamera } from "../cameras/ChaseCamera";
import { WalkCamera } from "../cameras/WalkCamera";
import { WalkingCharacter } from "../characters/WalkingCharacter";
import { WalkControls } from "../input/WalkControls";
import { interactablesFromZones } from "../interaction/Interaction";
import { InteractionSystem } from "../interaction/InteractionSystem";
import { PlayerModes } from "../player/PlayerModes";
import { DEFAULT_CHASE_CAMERA } from "../cameras/ChaseCameraConfig";
import type { SceneDefinition } from "../engine/types";
import { DriverControls } from "../input/DriverControls";
import { InputManager } from "../input/InputManager";
import { loadHavok } from "../physics/havok";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { GraphicsSystem } from "../rendering/GraphicsSystem";
import { DEFAULT_TIME_OF_DAY, GRAPHICS_PRESETS, TIMES_OF_DAY, type GraphicsQuality, type TimeOfDay } from "../rendering/LightingConfig";
import { SceneLighting } from "../rendering/SceneLighting";
import { Sky, skyLast } from "../rendering/Sky";
import { VehicleLights } from "../rendering/VehicleLights";
import { isHandlingPresetId } from "../vehicles/handling/presets";
import { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { STARTER_SEDAN } from "../vehicles/VehicleDefinition";
import { HUB_LAYOUT } from "../world/hub/hubLayout";
import { HubLocations, toVehiclePose } from "../world/hub/HubLocations";
import { buildChunk, WorldKit } from "../world/WorldChunk";

/**
 * The vertical-slice hub, morning, afternoon or night (docs/HUB_LAYOUT.md, docs/NIGHT_LIGHTING.md): home,
 * tambay coffee shop, talyer, gas station and convenience store on one driveable loop, with
 * the main road running out east toward the future mountain route.
 *
 * Every chunk is built up front for now; each is self-contained (geometry, props, colliders),
 * so streaming later only changes when `buildChunk` / `dispose` run.
 * `?spawn=<locationId>` picks the start, `?quality=high|medium|low` the graphics preset,
 * `?time=morning|afternoon|night` the time of day, `?handling=<presetId>` the handling preset.
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
    const walkControls = addSystem(new WalkControls(input));
    const world = addSystem(new PhysicsWorld(scene, havok));

    const kit = new WorldKit(scene);
    const chunks = HUB_LAYOUT.chunks.map((chunk) => buildChunk(scene, chunk, kit));
    addSystem({ name: "hubChunks", dispose: () => (chunks.forEach((c) => c.dispose()), kit.dispose()) });

    const quality = params.get("quality");
    const preset = GRAPHICS_PRESETS[quality && quality in GRAPHICS_PRESETS ? (quality as GraphicsQuality) : "high"];
    const lamps = HUB_LAYOUT.chunks.flatMap((c) => c.lamps);
    const time = params.get("time");
    const timeOfDay = TIMES_OF_DAY.includes(time as TimeOfDay) ? (time as TimeOfDay) : DEFAULT_TIME_OF_DAY;
    const lighting = addSystem(new SceneLighting(scene, lamps, kit.litMaterials, [kit.glow], preset.lightPoolSize, timeOfDay));
    const sky = addSystem(new Sky(scene, lighting));
    // All world meshes share one material, so Babylon's default order (material, then creation)
    // draws far chunks first and the car last, lighting every covered pixel and then painting
    // over it. Nearest-first lets the depth test skip hidden pixels before they are shaded.
    // The sky goes after everything, so its shader only runs where nothing else covered the pixel.
    scene.setRenderingOrder(0, skyLast(sky.mesh, RenderingGroup.frontToBackSortCompare));

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
    addSystem(player);
    // The two rigs share one camera. The walker reads its heading without owning input.
    const character = addSystem(new WalkingCharacter(scene, world, kit.lit, walkControls, {
      get yaw(): number { return walkCamera?.yaw ?? 0; },
    }));
    const walkCamera: WalkCamera = new WalkCamera(chase.camera, character, world, walkControls);
    const modes = addSystem(new PlayerModes(bridge, {
      vehicle: player, character, driverControls: controls, walkControls,
      chaseCamera: chase, walkCamera, world,
    }));
    player.onPlaced = () => modes.vehiclePlaced();
    lighting.attachCar(modes, [...player.visual.model.root.getChildMeshes(), ...character.mesh.getChildMeshes()]);
    addSystem(new HubLocations(HUB_LAYOUT, modes, bridge));
    const race = addSystem(new RaceSystem(scene, bridge, player, controls, modes));
    const zones = interactablesFromZones(HUB_LAYOUT.chunks.flatMap((chunk) => chunk.zones));
    const interactions = addSystem(new InteractionSystem(bridge, modes, [() => zones, modes.vehicleInteractables, race.interactions]));
    modes.useInteractions(interactions);
    race.connect(interactions);
    addSystem(new VehicleLights(scene, player, lighting));
    addSystem(chase);
    addSystem(walkCamera);
    const pools = chunks.map((c) => c.pools).filter((m): m is Mesh => m !== null);
    addSystem(new GraphicsSystem(scene, engine, chase.camera, bridge, lighting, pools, preset.quality));
  },
};
