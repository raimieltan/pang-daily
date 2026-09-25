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
import { Race, type RaceProgress, type RaceDefinition } from "./Race";
import { LOCAL_ROUTE } from "./localRoute";

export class RaceSystem implements GameSystem {
  readonly name = "race";
  race = new Race(LOCAL_ROUTE);
  private selected = LOCAL_ROUTE;
  private releases: (() => void)[] = [];
  private publisher: SummaryPublisher<RaceProgress>;
  private lastStanding = 0;
  private root: TransformNode;
  private visual?: VehicleVisual;
  private disposed = false;
  private gates;
  private materials: StandardMaterial[];
  private resultSent = false;
  introRemaining = 0;
  constructor(scene: Scene, private bridge: RuntimePort, private player: PlayerVehicle,
    private controls: DriverControls, private modes: PlayerModes, private routes: readonly RaceDefinition[] = [LOCAL_ROUTE]) {
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
    this.gates = routes.flatMap(route => [...route.checkpoints, route.finish].map((gate) => {
      const mesh = MeshBuilder.CreateBox(gate.id, { width: gate.halfSize.x * 2, height: 0.12, depth: gate.halfSize.z * 2 }, scene);
      mesh.position.set(gate.center.x, gate.center.y + 0.06, gate.center.z); mesh.isPickable = false;
      mesh.metadata = { routeId: route.id }; mesh.setEnabled(false); return mesh;
    }));
    for (const route of routes) {
      const start = MeshBuilder.CreateBox(`race-start-${route.id}`, { width: 6, height: .06, depth: .3 }, scene);
      start.position.set(route.start.x, route.start.y + .04, route.start.z);
      start.rotation.y = route.heading; start.material = this.materials[0];
      this.releases.push(() => start.dispose());
    }
    this.releases.push(bridge.handle("startRace", ({ raceId }) => {
      const route = this.routes.find(r => r.id === raceId);
      if (!route) return { rejected: "Unknown race" };
      if (!this.atStart(route)) return { rejected: "Drive to this race's start line" };
      return this.start(route);
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
  private atStart(route: RaceDefinition) { return Math.hypot(this.modes.position.x-route.start.x, this.modes.position.y-route.start.y, this.modes.position.z-route.start.z) <= 12; }
  readonly interactions = (): Interactable[] => this.active ? [] : this.routes.map(route => ({
    id: `race:${route.id}`, target: route.id, action: "start_race", label: `Race · ${route.name}`, priority: 20,
    modes: ["driving"], area: { kind: "circle", x: route.start.x, z: route.start.z, radius: 12 },
  }));
  connect(interactions: InteractionSystem) { this.releases.push(interactions.handle("start_race", i => {
    const route=this.routes.find(r=>r.id===i.target);
    return route ? this.start(route) : { rejected: "Unknown race" };
  })); }
  private start(route: RaceDefinition) {
    if (this.active) return { rejected: "Race already in progress" };
    if (this.modes.mode !== "driving") return { rejected: "Get into your car to race" };
    if (!this.player.placeAt({ position: new Vector3(route.start.x, route.start.y, route.start.z), headingRad: route.heading })) return { rejected: "Start grid is unavailable" };
    this.selected=route; this.race=new Race(route);
    this.gates.forEach(g=>g.setEnabled(g.metadata.routeId===route.id));
    this.race.reset(); this.bridge.emit("raceProgress", this.race.snapshot());
    this.race.start(); this.resultSent = false; this.lastStanding = 0;
    this.controls.enabled = false; this.root.setEnabled(true);
    this.introRemaining = 3.2;
    this.bridge.emit("raceIntro", { title: route.name });
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  private reset() {
    this.introRemaining = 0;
    this.bridge.emit("raceIntro", null);
    this.race.reset(); this.controls.enabled = this.modes.mode === "driving";
    this.gates.forEach(gate => gate.setEnabled(false));
    this.root.setEnabled(false); this.resultSent = false;
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  update(dt: number) {
    if (this.introRemaining > 0) {
      this.introRemaining = Math.max(0, this.introRemaining - dt);
      const p = this.race.rival.position;
      this.root.position.set(p.x, p.y + 0.1, p.z);
      this.root.rotation.y = this.race.rival.heading;
      if (this.introRemaining === 0) this.bridge.emit("raceIntro", null);
      return;
    }
    const phase = this.race.phase;
    this.race.update(dt, this.player.position);
    if (phase === "COUNTDOWN" && this.race.phase === "RUNNING") {
      this.controls.enabled = true;
      this.bridge.emit("raceStarted", this.standing());
    }
    const p = this.race.rival.position;
    this.root.position.set(p.x, p.y + 0.1, p.z); this.root.rotation.y = this.race.rival.heading;
    if (this.race.rival.departed) this.root.setEnabled(false);
    this.visual?.update(dt, 0, this.root.isEnabled() ? this.race.rival.speed : 0);
    this.gates.filter(g=>g.metadata.routeId===this.selected.id).forEach((gate, i) => { gate.material = this.materials[i < this.race.player.next ? 2 : i === this.race.player.next ? 0 : 1]; });
    if (this.race.phase === "RUNNING" && this.lastStanding !== this.race.position) {
      this.lastStanding = this.race.position; this.bridge.emit("raceStandingChanged", this.standing());
    }
    if (this.race.phase === "FINISHED" && !this.resultSent) {
      this.resultSent = true;
      this.gates.forEach(gate => gate.setEnabled(false));
      this.bridge.emit("raceFinished", { ...this.standing(), timeMs: Math.round(this.race.playerTime! * 1000) });
    }
    if (phase !== this.race.phase) this.publisher.flush(this.race.snapshot());
    else this.publisher.tick(dt, () => this.race.snapshot());
  }
  private standing() { return { raceId: this.selected.id, position: this.race.position, racers: 2 }; }
  dispose() {
    this.disposed = true; this.releases.forEach((release) => release());
    this.player.canReposition = undefined; this.modes.canExit = undefined;
    this.controls.enabled = this.modes.mode === "driving";
    this.visual?.dispose(); this.root.dispose(); this.gates.forEach((gate) => gate.dispose()); this.materials.forEach((m) => m.dispose());
  }
}
