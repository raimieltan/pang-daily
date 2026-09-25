import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CommandOutcome, GameCommandName, RuntimePort } from "../bridge";
import type { ChaseCamera } from "../cameras/ChaseCamera";
import type { WalkCamera } from "../cameras/WalkCamera";
import type { WalkingCharacter } from "../characters/WalkingCharacter";
import type { GameSystem } from "../engine/types";
import type { DriverControls } from "../input/DriverControls";
import type { WalkControls } from "../input/WalkControls";
import type { Interactable } from "../interaction/Interaction";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import { CollisionGroup, type PhysicsWorld } from "../physics/PhysicsWorld";
import type { VehiclePose } from "../vehicles/VehicleBody";
import type { PlayerVehicle } from "../vehicles/PlayerVehicle";
import type { PlayerMode } from "./PlayerMode";
import { findExitSpot } from "./vehicleExit";

export type PlayerModeConfig = {
  /** Getting out is refused above this. Low enough that the car is stopped or crawling. */
  maxExitSpeedKmh: number;
  /** Maximum distance from a reachable door interaction point. */
  enterRadius: number;
};

export const DEFAULT_PLAYER_MODES: PlayerModeConfig = { maxExitSpeedKmh: 3, enterRadius: 1.2 };

/** Getting in beats anything else on offer while standing at the car. */
const ENTER_PRIORITY = 10;

export type PlayerModeParts = {
  vehicle: PlayerVehicle;
  character: WalkingCharacter;
  driverControls: DriverControls;
  walkControls: WalkControls;
  chaseCamera: ChaseCamera;
  walkCamera: WalkCamera;
  world: PhysicsWorld;
};

/**
 * The player's one state machine: DRIVING ⇄ WALKING. Each mode owns exactly one input
 * context, one camera rig and one moving body; a transition hands all three over at once:
 *
 *   DRIVING → WALKING   `enterExit` / `exitVehicle`. Refused above `maxExitSpeedKmh` or
 *                       with no room beside the car. Car parks (handbrake), the character
 *                       controller is built at a door-side spot, the walk camera takes over.
 *   WALKING → DRIVING   the car's "Get in" interaction / `enterVehicle`. Refused for a car the
 *                       player doesn't own or out of reach. The character controller is
 *                       disposed, driver input and the chase camera resume.
 *
 * Nothing is created per transition except the character's controller, which is disposed
 * on the way back, so any number of round trips leaves the same systems, listeners, camera
 * and physics bodies as the first.
 *
 * Also the "where is the player" for systems that don't care how they travel (location
 * tracking, lamp selection, interactions): `position` and `forward` follow the active body.
 */
export class PlayerModes implements GameSystem {
  readonly name = "playerModes";
  private current: PlayerMode = "driving";
  private interactions: InteractionSystem | null = null;
  private readonly releases: (() => void)[] = [];
  private readonly enterInteraction: { -readonly [K in keyof Interactable]: Interactable[K] };

  constructor(
    private readonly bridge: RuntimePort,
    private readonly parts: PlayerModeParts,
    private readonly config: PlayerModeConfig = DEFAULT_PLAYER_MODES,
  ) {
    const { vehicle } = parts;
    this.enterInteraction = {
      id: `vehicle:${vehicle.id}`,
      action: "enter_vehicle",
      label: "Get in",
      area: { kind: "circle", x: 0, z: 0, radius: config.enterRadius },
      priority: ENTER_PRIORITY,
      target: vehicle.id,
    };
    this.releases.push(bridge.handle("exitVehicle", () => this.exit()));
    this.releases.push(bridge.handle("enterVehicle", ({ vehicleId }) => this.enter(vehicleId)));
    this.apply("driving");
  }

  get mode(): PlayerMode {
    return this.current;
  }

  get position(): Vector3 {
    return this.current === "driving" ? this.parts.vehicle.position : this.parts.character.position;
  }

  get forward(): Vector3 {
    return this.current === "driving" ? this.parts.vehicle.forward : this.parts.character.forward;
  }

  /** Puts whichever body is active at `pose` (used by `HubLocations` to bring the player back). */
  placeAt(pose: VehiclePose): boolean {
    return this.current === "driving" ? this.parts.vehicle.placeAt(pose) : this.parts.character.placeAt(pose);
  }

  /** The car's "Get in" prompt, while on foot. Pass to `InteractionSystem` as a source. */
  readonly vehicleInteractables = (): Interactable[] => {
    if (this.current !== "walking") return [];
    return this.doors().filter((door) => this.doorReachable(door)).map((door, index) => ({
      ...this.enterInteraction,
      id: `${this.enterInteraction.id}:door:${index}`,
      area: { kind: "circle", x: door.x, z: door.z, radius: this.config.enterRadius },
    }));
  };

  /** Connects the interaction system: its `enter_vehicle` action gets you in. */
  useInteractions(interactions: InteractionSystem): void {
    this.interactions = interactions;
    this.releases.push(interactions.handle("enter_vehicle", (target) => this.enter(target.target ?? "")));
  }

  /**
   * The car was teleported (spawn point, reset). A spawn is the player spawning, so someone on
   * foot is put back behind the wheel; the chase camera jumps with the car either way.
   */
  vehiclePlaced(): void {
    if (this.current === "walking") this.toDriving();
    else this.parts.chaseCamera.snap();
  }

  update(): void {
    const { driverControls, walkControls } = this.parts;
    if (this.current === "driving" && driverControls.enterExitPressed) this.report("exitVehicle", this.exit());
    else if (this.current === "walking" && walkControls.interactPressed && this.interactions) {
      this.report("interact", this.interactions.trigger());
    }
  }

  exit(): CommandOutcome {
    const { vehicle, character, world } = this.parts;
    if (this.current !== "driving") return { rejected: "Already on foot" };
    if (!this.safeSpeed()) return { rejected: "Stop the car to get out" };
    const spot = findExitSpot(world, vehicle.body, vehicle.definition.collision, character.capsuleRadius, character.capsuleHeight);
    if (!spot || !character.spawn(spot)) return { rejected: "No room to get out here" };
    this.apply("walking");
    this.parts.walkCamera.snap(spot.headingRad);
  }

  enter(vehicleId: string): CommandOutcome {
    const { vehicle } = this.parts;
    if (this.current !== "walking") return { rejected: "Already driving" };
    if (vehicleId !== vehicle.id) return { rejected: "That's not your car" };
    if (!this.safeSpeed()) return { rejected: "Wait for the car to stop" };
    if (!this.doors().some((door) => this.doorReachable(door))) return { rejected: "Walk up to a car door to get in" };
    this.toDriving();
  }

  private toDriving(): void {
    this.parts.character.despawn();
    this.apply("driving");
    this.parts.chaseCamera.snap();
  }

  dispose(): void {
    this.releases.forEach((release) => release());
    this.interactions = null;
  }

  private safeSpeed(): boolean {
    return this.parts.vehicle.body.body.getLinearVelocity().length() * 3.6 <= this.config.maxExitSpeedKmh;
  }

  private doors(): Vector3[] {
    const { vehicle } = this.parts;
    const { width, centerZ } = vehicle.definition.collision.body;
    return [-1, 1].map((side) => vehicle.body.toWorld(
      new Vector3(side * (width / 2 + 0.35), 0, centerZ + 0.2), new Vector3(),
    ));
  }

  private doorReachable(door: Vector3): boolean {
    const { character, world } = this.parts;
    if (!this.safeSpeed() || Vector3.Distance(character.position, door) > this.config.enterRadius) return false;
    return !world.raycast(character.position.add(new Vector3(0, 1, 0)), door.add(new Vector3(0, 1, 0)), {
      collideWith: CollisionGroup.STATIC,
    });
  }

  /** Hands input, camera and prompts to `mode`, then tells React. */
  private apply(mode: PlayerMode): void {
    const { driverControls, walkControls, chaseCamera, walkCamera, vehicle } = this.parts;
    this.current = mode;
    const driving = mode === "driving";
    driverControls.enabled = driving;
    walkControls.enabled = !driving;
    chaseCamera.active = driving;
    walkCamera.active = !driving;
    this.interactions?.refresh();
    this.bridge.emit("playerModeChanged", { mode, vehicleId: driving ? vehicle.id : null });
  }

  private report(command: GameCommandName, outcome: CommandOutcome): void {
    if (outcome) this.bridge.emit("commandRejected", { command, reason: outcome.rejected });
  }
}
