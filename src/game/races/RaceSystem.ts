import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { SummaryPublisher, type RuntimePort } from "../bridge";
import type { GameSystem } from "../engine/types";
import type { DriverControls } from "../input/DriverControls";
import type { Interactable } from "../interaction/Interaction";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import type { PlayerModes } from "../player/PlayerModes";
import type { PlayerVehicle } from "../vehicles/PlayerVehicle";
import { VehicleVisual } from "../vehicles/VehicleVisual";
import { Race, type RaceProgress } from "./Race";
import { LOCAL_ROUTE } from "./localRoute";

export class RaceSystem implements GameSystem {
  readonly name = "race";
  readonly race = new Race(LOCAL_ROUTE);
  private releases: (() => void)[] = [];
  private publisher: SummaryPublisher<RaceProgress>;
  private lastStanding = 0;
  private root: TransformNode;
  private visual?: VehicleVisual;
  private disposed = false;
  private gates;
  private materials: StandardMaterial[];
  private resultSent = false;
  constructor(scene: Scene, private bridge: RuntimePort, private player: PlayerVehicle,
    private controls: DriverControls, private modes: PlayerModes) {
    this.publisher = new SummaryPublisher((progress) => bridge.emit("raceProgress", progress));
    this.root = new TransformNode("local-rival", scene);
    this.root.setEnabled(false);
    void VehicleVisual.load(scene, player.definition.spec, this.root).then((visual) => {
      if (this.disposed) visual.dispose(); else this.visual = visual;
    }).catch(() => {
      if (this.disposed) return;
      // Keep the race usable if the optional rival model cannot load.
      const fallback = MeshBuilder.CreateBox("rival", { width: 1.8, height: 1.2, depth: 4 }, scene);
      fallback.position.y = 0.8; fallback.parent = this.root;
    });
    this.materials = ["#ffd05a", "#48debc", "#626b72"].map((hex, i) => {
      const m = new StandardMaterial(`race-gate-${i}`, scene);
      m.emissiveColor = Color3.FromHexString(hex); m.disableLighting = true; m.alpha = 0.55; return m;
    });
    this.gates = [...LOCAL_ROUTE.checkpoints, LOCAL_ROUTE.finish].map((gate) => {
      const mesh = MeshBuilder.CreateBox(gate.id, { width: gate.halfSize.x * 2, height: 0.12, depth: gate.halfSize.z * 2 }, scene);
      mesh.position.set(gate.center.x, 0.16, gate.center.z); mesh.isPickable = false;
      return mesh;
    });
    const start = MeshBuilder.CreateBox("race-start", { width: 2, height: 0.12, depth: 9 }, scene);
    start.position.set(LOCAL_ROUTE.start.x, 0.16, 140); start.material = this.materials[0];
    this.releases.push(() => start.dispose());
    this.releases.push(bridge.handle("startRace", ({ raceId }) => {
      if (raceId !== LOCAL_ROUTE.id) return { rejected: "Unknown local race" };
      if (this.race.phase !== "FINISHED" && !this.atStart()) return { rejected: "Meet the rival at the gold start line east of Home" };
      return this.start();
    }));
    this.releases.push(bridge.handle("resetRace", () => { this.reset(); }));
    const onPlaced = player.onPlaced;
    player.onPlaced = () => {
      // Boundary recovery must not sweep across gates and award a shortcut finish.
      if (this.active) this.reset();
      onPlaced?.();
    };
    this.releases.push(() => { player.onPlaced = onPlaced; });
    player.canReposition = () => !this.active;
    modes.canExit = () => !this.active;
    bridge.emit("raceProgress", this.race.snapshot());
  }
  get active() { return this.race.phase === "COUNTDOWN" || this.race.phase === "RUNNING"; }
  private atStart() { return Math.hypot(this.modes.position.x - LOCAL_ROUTE.start.x, this.modes.position.z - 140) <= 12; }
  readonly interactions = (): Interactable[] => this.active ? [] : [{
    id: "local-race", action: "start_race", label: "Race the local rival · Barangay sprint", priority: 20,
    modes: ["walking", "driving"], area: { kind: "circle", x: LOCAL_ROUTE.start.x, z: 140, radius: 12 },
  }];
  connect(interactions: InteractionSystem) { this.releases.push(interactions.handle("start_race", () => this.start())); }
  private start() {
    if (this.active) return { rejected: "Race already in progress" };
    if (!this.player.placeAt({ position: new Vector3(LOCAL_ROUTE.start.x, 0, LOCAL_ROUTE.start.z), headingRad: LOCAL_ROUTE.heading })) return { rejected: "Start grid is unavailable" };
    this.race.reset(); this.bridge.emit("raceProgress", this.race.snapshot());
    this.race.start(); this.resultSent = false; this.lastStanding = 0;
    this.controls.enabled = false; this.root.setEnabled(true);
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  private reset() {
    this.race.reset(); this.controls.enabled = this.modes.mode === "driving";
    this.root.setEnabled(false); this.resultSent = false;
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  update(dt: number) {
    const phase = this.race.phase;
    this.race.update(dt, this.player.position);
    if (phase === "COUNTDOWN" && this.race.phase === "RUNNING") {
      this.controls.enabled = true;
      this.bridge.emit("raceStarted", this.standing());
    }
    const p = this.race.rival.position;
    this.root.position.set(p.x, p.y + 0.1, p.z); this.root.rotation.y = this.race.rival.heading;
    this.visual?.update(dt, 0, this.active ? this.race.rival.speed : 0);
    this.gates.forEach((gate, i) => { gate.material = this.materials[i < this.race.player.next ? 2 : i === this.race.player.next ? 0 : 1]; });
    if (this.race.phase === "RUNNING" && this.lastStanding !== this.race.position) {
      this.lastStanding = this.race.position; this.bridge.emit("raceStandingChanged", this.standing());
    }
    if (this.race.phase === "FINISHED" && !this.resultSent) {
      this.resultSent = true;
      this.bridge.emit("raceFinished", { ...this.standing(), timeMs: Math.round(this.race.playerTime! * 1000) });
    }
    if (phase !== this.race.phase) this.publisher.flush(this.race.snapshot());
    else this.publisher.tick(dt, () => this.race.snapshot());
  }
  private standing() { return { raceId: LOCAL_ROUTE.id, position: this.race.position, racers: 2 }; }
  dispose() {
    this.disposed = true; this.releases.forEach((release) => release());
    this.player.canReposition = undefined; this.modes.canExit = undefined;
    this.controls.enabled = this.modes.mode === "driving";
    this.visual?.dispose(); this.root.dispose(); this.gates.forEach((gate) => gate.dispose()); this.materials.forEach((m) => m.dispose());
  }
}
