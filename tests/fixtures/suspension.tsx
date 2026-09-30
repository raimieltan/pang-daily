import { createRoot } from 'react-dom/client';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { loadHavok } from '@/game/physics/havok';
import { PhysicsWorld, CollisionGroup } from '@/game/physics/PhysicsWorld';
import { PlayerVehicle } from '@/game/vehicles/PlayerVehicle';
import { STARTER_SEDAN } from '@/game/vehicles/VehicleDefinition';
import { GameBridge } from '@/game/bridge';
import { InventorySession } from '@/game-core/inventory/InventorySession';
import { CustomizationSystem } from '@/game/vehicles/CustomizationSystem';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindMaintenanceStore } from '@/state/maintenanceStore';
import { TalyerSetupPanel } from '@/components/hud/TalyerSetupPanel';
import { damageCorner } from '@/game-core/suspension/service';
async function start() {
  const canvas = document.getElementById('game') as HTMLCanvasElement, engine = new Engine(canvas, true), scene = new Scene(engine);
  scene.clearColor = new Color4(.06, .085, .075, 1);
  const camera = new ArcRotateCamera('workshop', -Math.PI * .72, Math.PI * .38, 7.7, new Vector3(.8, .55, 0), scene); camera.attachControl(canvas, true);
  const light = new HemisphericLight('bay', new Vector3(-.4, 1, -.5), scene); light.intensity = 2;
  const world = new PhysicsWorld(scene, await loadHavok());
  const floor = MeshBuilder.CreateBox('floor', { width: 1000, depth: 1000, height: .2 }, scene); floor.position.y = -.1;
  const material = new StandardMaterial('floor-material', scene); material.diffuseColor = new Color3(.13, .18, .15); floor.material = material;
  const ground = new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, scene); ground.shape.filterMembershipMask = CollisionGroup.STATIC;
  const bridge = new GameBridge(), inventory = new InventorySession(); bindGameUiStore(bridge.ui); bindMaintenanceStore(bridge.ui.events);
  const input = { steer: 0, throttle: 0, brake: 0 };
  const vehicle = await PlayerVehicle.create(scene, world, { read: () => input }, bridge.runtime, { definition: STARTER_SEDAN,
    spawnPoints: { origin: { position: Vector3.Zero(), headingRad: 0 } }, initialSpawn: 'origin' });
  const customization = new CustomizationSystem(bridge.runtime, inventory, vehicle, () => null);
  createRoot(document.getElementById('root')!).render(<TalyerSetupPanel section="suspension" />);
  Object.assign(window, { suspensionTest: {
    sample: () => ({ suspension: vehicle.suspensionTelemetry, height: vehicle.body.position.y, pose: vehicle.body.node.rotationQuaternion?.toEulerAngles().asArray(),
      wheels: vehicle.visual.model.wheels.map(w => ({ position: w.hub.position.asArray(), rotation: w.hub.rotationQuaternion?.toEulerAngles().asArray() })) }),
    damage: () => damageCorner(vehicle.suspension.saved, 0, 4000, 1), saved: () => inventory.snapshot(), commands: bridge.ui.commands,
  } });
  engine.runRenderLoop(() => { const dt = Math.min(.04, engine.getDeltaTime() / 1000); world.update(dt); vehicle.update(dt); customization.update(dt); scene.render(); });
  window.addEventListener('resize', () => engine.resize());
}
void start();
