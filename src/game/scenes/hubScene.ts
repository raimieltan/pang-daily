import { FuelSystem } from "../maintenance/FuelSystem";
import { JobMarker } from "../jobs/JobMarker";
import { JobSystem } from "../jobs/JobSystem";
import { fuelRejection } from "../maintenance/fuelAccess";
import { TRAFFIC_LANES } from "../traffic/trafficRoutes";
import { TrafficSystem } from "../traffic/TrafficSystem";
import { RoadsideAnimals } from "../traffic/RoadsideAnimals";
import { RoadsidePeople } from "../traffic/RoadsidePeople";
import { CafeCustomers } from "../traffic/CafeCustomers";
import { CafeParkedCars } from "../traffic/CafeParkedCars";
import { CafeCrew } from "../traffic/CafeCrew";
import { NeighborhoodLife } from "../traffic/NeighborhoodLife";
import { NEIGHBORHOOD_CARS } from "../world/population";
import { MaintenanceSystem } from "../maintenance/MaintenanceSystem";
import { talyerRejection } from "../maintenance/talyerAccess";
import { WeatherSystem } from "../weather/WeatherSystem";
import { WEATHER_TYPES, type WeatherType } from "../weather/Weather";
import { roadAt, ROUTE_LENGTH, OVERLOOK_S } from "../world/mountain/route";
import { MountainWorld } from "../world/mountain/MountainWorld";
import { MOUNTAIN_LAMPS, MOUNTAIN_ZONES } from "../world/mountain/environment";
import { CONNECTED_LAYOUT } from "../world/mountain/layout";
import { MOUNTAIN_RACES } from "../world/mountain/route";
import { LOCAL_ROUTE } from "../races/localRoute";
import { RaceSystem } from "../races/RaceSystem";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup";
import { ChaseCamera } from "../cameras/ChaseCamera";
import { RaceIntroduction } from "../cameras/RaceIntroduction";
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
import { WheelSystem } from "../vehicles/WheelSystem";
import { ExteriorSystem } from "../vehicles/ExteriorSystem";
import { CustomizationSystem } from "../vehicles/CustomizationSystem";
import { PLAYER_CARS, STARTER_SEDAN, playerCar } from "../vehicles/VehicleDefinition";
import { HomeGarage } from "../vehicles/HomeGarage";
import { loadActiveCar, saveActiveCar } from "../vehicles/garageStorage";
import { HOME_SECOND_BAY, HUB_LAYOUT } from "../world/hub/hubLayout";
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
  async setup({ scene, engine, addSystem, bridge, signal, session, jobs, market, inventory, restart }) {
    const params = new URLSearchParams(window.location.search);
    const havok = await loadHavok();
    if (signal.aborted) return;

    let player: PlayerVehicle | null = null;
    let camera: ChaseCamera | null = null;
    const input = addSystem(new InputManager(window));
    const controls = addSystem(
      new DriverControls(input, {
        onHorn: () => bridge.emit("horn"),
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

    const mountain = addSystem(new MountainWorld(scene, kit));
    const quality = params.get("quality");
    const preset = GRAPHICS_PRESETS[quality && quality in GRAPHICS_PRESETS ? (quality as GraphicsQuality) : "high"];
    const lamps = [...HUB_LAYOUT.chunks.flatMap((c) => c.lamps), ...MOUNTAIN_LAMPS];
    const time = params.get("time");
    const timeOfDay = TIMES_OF_DAY.includes(time as TimeOfDay) ? (time as TimeOfDay) : DEFAULT_TIME_OF_DAY;
    const lighting = addSystem(new SceneLighting(scene, lamps, kit.litMaterials, [kit.glow], preset.lightPoolSize, timeOfDay));
    const sky = addSystem(new Sky(scene, lighting, true));
    // All world meshes share one material, so Babylon's default order (material, then creation)
    // draws far chunks first and the car last, lighting every covered pixel and then painting
    // over it. Nearest-first lets the depth test skip hidden pixels before they are shaded.
    // The sky goes after everything, so its shader only runs where nothing else covered the pixel.
    scene.setRenderingOrder(0, skyLast(sky.mesh, RenderingGroup.frontToBackSortCompare));

    const spawnPoints = Object.fromEntries(CONNECTED_LAYOUT.locations.map((l) => [l.id, toVehiclePose(l.spawn)]));
    const requestedSpawn = params.get("spawn");
    const handling = params.get("handling");
    // `?car=` wins for testing; otherwise whichever car was last picked at home.
    const driven = playerCar(params.get("car") ?? loadActiveCar());
    player = await PlayerVehicle.create(scene, world, controls, bridge, {
      definition: driven,
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
    // The other owned car waits at home; getting in it rebuilds the scene around that car.
    const parked = Object.values(PLAYER_CARS).find((car) => car !== driven)!;
    const garage = await HomeGarage.create(scene, parked, toVehiclePose(HOME_SECOND_BAY), modes, inventory, (car) => {
      saveActiveCar(car.spec.id);
      const url = new URL(window.location.href);
      url.searchParams.delete("car");
      url.searchParams.delete("spawn");
      window.history.replaceState(window.history.state, "", url);
      restart();
    });
    if (signal.aborted) return garage.dispose();
    addSystem(garage);
    const lightCar = (car: PlayerVehicle) => lighting.attachCar(modes, [...car.visual.model.root.getChildMeshes(), ...character.mesh.getChildMeshes()]);
    const litCar = player;
    lightCar(litCar);
    litCar.onVisualsChanged = () => lightCar(litCar);
    addSystem(new HubLocations(CONNECTED_LAYOUT, modes, bridge));
    const race = addSystem(new RaceSystem(scene, bridge, player, controls, modes, [LOCAL_ROUTE, ...MOUNTAIN_RACES]));
    const zones = interactablesFromZones([...HUB_LAYOUT.chunks.flatMap((chunk) => chunk.zones), ...MOUNTAIN_ZONES]);
    const maintainedCar = player;
    const jobSystem = new JobSystem(bridge, jobs, {
      player: modes, vehicle: maintainedCar, racing: () => race.active,
      fuelLiters: () => session.summary(maintainedCar.definition.spec).fuelLiters ?? 0,
      boards: zones.filter((zone) => zone.action === "browse_jobs"), marker: new JobMarker(scene),
    });
    const interactions = addSystem(new InteractionSystem(bridge, modes, [() => zones, modes.vehicleInteractables, garage.interactions, race.interactions, jobSystem.interactions]));
    modes.useInteractions(interactions);
    garage.connect(interactions);
    race.connect(interactions);
    jobSystem.connect(interactions);
    const talyer = () => talyerRejection({
      mode: modes.mode, player: modes.position, car: maintainedCar.position,
      speedKmh: maintainedCar.speedKmh, racing: race.active,
    });
    addSystem(new MaintenanceSystem(bridge, session, maintainedCar, () => modes.mode === 'driving',
      () => race.race.phase === 'RUNNING', { interactions, rejection: talyer }));
    // Marketplace parts ride in the trunk: bring the car to Mang Boy to have one inspected.
    market.useWorkshop({ rejection: talyer });
    addSystem(new FuelSystem(bridge, session, maintainedCar.definition.spec, {
      interactions, rejection: () => fuelRejection({ mode: modes.mode, player: modes.position,
        car: maintainedCar.position, speedKmh: maintainedCar.speedKmh, racing: race.active }, zones),
    }));
    addSystem(jobSystem);
    addSystem(new CustomizationSystem(bridge, inventory, maintainedCar, talyer));
    addSystem(new WheelSystem(bridge, inventory, maintainedCar));
    addSystem(new ExteriorSystem(bridge, inventory, maintainedCar, talyer));
    let footstepTime = 0;
    let footstepDistance = 0;
    addSystem({ name: "footstepAudio", update(dt) {
      footstepDistance += character.speed * dt;
      footstepTime += dt;
      if (footstepTime >= .1) {
        if (footstepDistance > 0) bridge.emit("footsteps", { distance: footstepDistance });
        footstepTime = footstepDistance = 0;
      }
    }, dispose() {} });
    const car = player;
    const roadUser = () => ({ x: car.position.x, y: car.position.y, z: car.position.z, speed: car.speed, heading: Math.atan2(car.forward.x, car.forward.z) });
    const sedanModel = driven === STARTER_SEDAN ? player.visual.model : garage.model;
    const traffic = addSystem(new TrafficSystem(scene, kit, world, sedanModel, TRAFFIC_LANES, roadUser, () => lighting.mood.headlight));
    const listener = () => modes.position;
    const npcSound = (sound: import('../traffic/RoadsidePeople').NpcSound) => bridge.emit('npcSound', sound);
    addSystem(new CafeCustomers(scene, kit, listener, npcSound));
    addSystem(new CafeParkedCars(scene, sedanModel, listener));
    addSystem(new CafeCrew(scene, kit, listener, npcSound));
    addSystem(new NeighborhoodLife(scene, kit, listener, npcSound));
    addSystem(new CafeParkedCars(scene, sedanModel, listener, NEIGHBORHOOD_CARS, 'neighborhood-parked'));
    addSystem(new RoadsidePeople(scene, kit, [
      { from: 100, to: 125, side: 1 }, { from: 390, to: 415, side: -1 },
      { from: OVERLOOK_S - 55, to: OVERLOOK_S - 30, side: -1 },
      { from: ROUTE_LENGTH - 230, to: ROUTE_LENGTH - 205, side: 1 },
    ], roadAt, listener, false, npcSound));
    addSystem(new RoadsidePeople(scene, kit, [
      { from: 25, to: 48, side: 1 }, { from: 115, to: 138, side: -1 },
    ], (s, offset) => ({ x: s, y: -.03, z: -offset, heading: Math.PI / 2, width: 12 }), listener, true, npcSound));
    addSystem(new RoadsideAnimals(scene, kit, [
      {s:230,kind:"dog",side:1,crosses:false}, {s:550,kind:"cat",side:-1,crosses:true},
      {s:OVERLOOK_S-40,kind:"dog",side:1,crosses:true}, {s:ROUTE_LENGTH-420,kind:"cat",side:1,crosses:true},
    ], roadAt, () => [roadUser(), ...traffic.flow.actors.filter(a=>a.active).map(a=>({...a.follower.position,speed:a.follower.speed,heading:a.follower.heading}))]));
    const weather = params.get("weather") as WeatherType;
    addSystem(new WeatherSystem(scene, kit, lighting, player, bridge, WEATHER_TYPES.includes(weather) ? weather : "clear"));
    addSystem(new VehicleLights(scene, player, lighting));
    addSystem(chase);
    addSystem(walkCamera);
    addSystem(new RaceIntroduction(race, player, chase));
    const pools = [...chunks, ...mountain.chunks].map((c) => c.pools).filter((m): m is Mesh => m !== null);
    const graphics = addSystem(new GraphicsSystem(scene, engine, chase.camera, bridge, lighting, pools, preset.quality, {
      get speedKmh() { return modes.mode === "driving" ? car.speedKmh : 0; },
      get gear() { return car.gear; },
      get impactSerial() { return car.impactSerial; },
      get impactStrength() { return modes.mode === "driving" ? car.impactStrength : 0; },
      get intro() { return race.introRemaining > 0; },
    }));
    addSystem({ name: "recordingCameraSettings", update() {
      chase.analogIntensity = graphics.current.analog && graphics.current.analogPreset !== "CLEAN" ? graphics.current.analogIntensity : 0;
      chase.reducedMotion = graphics.current.reducedMotion;
    } });
  },
};
