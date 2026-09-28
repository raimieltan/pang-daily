import { payRacePrize } from '@/game-core/social/raceOutcomes';
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
import { dressNpcCar, type NpcCar, type NpcCarModels } from "../vehicles/npcCar";
import type { VehicleSession } from "@/game-core/maintenance/VehicleSession";
import { NPC_CAR_BUILDS, npcCarId } from "@/game-core/exterior/npcBuilds";
import { Race, type RaceProgress, type RaceDefinition } from "./Race";
import { LOCAL_ROUTE } from "./localRoute";
import { AIDriver, DRIVER_SKILLS, type NearbyVehicle } from './AIDriver';
import { ObstacleProbes } from './obstacleProbes';
import { rivalCar, rivalLine } from './rivalDriver';
import { buildRacingLine, carLimits } from './racingLine';
import { RaceLineVisual } from './RaceLineVisual';
import { raceLineEnabled } from './raceLineSettings';
import { VehicleBody } from '../vehicles/VehicleBody';
import { VehicleController } from '../vehicles/VehicleController';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { TrafficSystem } from '../traffic/TrafficSystem';

export class RaceSystem implements GameSystem {
  readonly name = "race";
  race = new Race(LOCAL_ROUTE);
  private selected = LOCAL_ROUTE;
  private releases: (() => void)[] = [];
  private publisher: SummaryPublisher<RaceProgress>;
  private lastStanding = 0;
  private root: TransformNode;
  private visual?: VehicleVisual;
  /** Named rivals' dressed cars, built the first time their race starts. */
  private dressed = new Map<string, { car: NpcCar; visual: VehicleVisual }>();
  private current?: VehicleVisual;
  private disposed = false;
  private gates;
  private materials: StandardMaterial[];
  private resultSent = false;
  private attemptId: string | null = null;
  private checkpointSent = 0;
  private starting = false;
  introRemaining = 0;
  private scene: Scene;
  private rivalBody?: VehicleBody;
  private rivalController?: VehicleController;
  private driver?: AIDriver;
  private probes?: ObstacleProbes;
  /** Seconds the rival is held after a respawn, as a small penalty. */
  private respawnHold = 0;
  private pendingRespawn?: number;
  private telemetryAge = 0;
  private raceLine?: RaceLineVisual;
  private traffic?: TrafficSystem;
  setTraffic(traffic: TrafficSystem) { this.traffic = traffic; }
  constructor(scene: Scene, private bridge: RuntimePort, private player: PlayerVehicle,
    private controls: DriverControls, private modes: PlayerModes, private routes: readonly RaceDefinition[] = [LOCAL_ROUTE],
    private garage: { models?: NpcCarModels; wallet?: Pick<VehicleSession, "earn" | "snapshot"> & Partial<Pick<VehicleSession, "persistent" | "execute">>; access?: (raceId: string) => string | null } = {},
    private world?: PhysicsWorld) {
    this.publisher = new SummaryPublisher((progress) => bridge.emit("raceProgress", progress));
    this.root = new TransformNode("local-rival", scene);
    this.root.setEnabled(false);
    this.scene = scene;
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
    this.releases.push(bridge.handle("abandonRace", () => { this.abortAttempt(); }));
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
    id: `race:${route.id}`, target: route.id, action: "start_race", label: route.rival ? `Race ${route.rival.name} · ${route.name} ${"★".repeat(route.rival.tier)} · ₱${route.rival.prizePhp}` : `Race · ${route.name}`, priority: 20,
    modes: ["driving"], area: { kind: "circle", x: route.start.x, z: route.start.z, radius: 12 },
  }));
  connect(interactions: InteractionSystem) { this.releases.push(interactions.handle("start_race", i => {
    const route=this.routes.find(r=>r.id===i.target);
    return route ? this.start(route) : { rejected: "Unknown race" };
  })); }
  private start(route: RaceDefinition) {
    const rejection = this.garage.access?.(route.id);
    if (rejection) return { rejected: rejection };
    if (this.active || this.starting) return { rejected: "Race already in progress" };
    if (this.modes.mode !== "driving") return { rejected: "Get into your car to race" };
    if (!this.player.placeAt({ position: new Vector3(route.start.x, route.start.y, route.start.z), headingRad: route.heading })) return { rejected: "Start grid is unavailable" };
    const attemptId = crypto.randomUUID();
    if (this.garage.wallet?.persistent && this.garage.wallet.execute) {
      this.starting = true;
      return this.garage.wallet.execute({ type: 'race_start', definitionId: route.id, attemptId, vehicleId: this.player.definition.spec.id }).then(() => {
        if (this.disposed) { void this.garage.wallet!.execute!({ type: 'race_complete', attemptId, elapsedMs: 0, finish: false }).catch(() => {}); return { rejected: 'The race scene was closed.' }; }
        this.beginRace(route, attemptId);
      }).finally(() => { this.starting = false; });
    }
    this.beginRace(route, attemptId);
  }
  private beginRace(route: RaceDefinition, attemptId: string) {
    this.raceLine?.dispose(); this.raceLine = undefined;
    this.attemptId = attemptId; this.checkpointSent = 0;
    this.selected=route; this.race=new Race(route);
    this.createRival(route);
    if (route.rival?.npcId && route.rival.vehicleId) this.bridge.emit('raceAttemptStarted', { raceId: route.id, attemptId: this.attemptId, npcId: route.rival.npcId, vehicleId: route.rival.vehicleId, totalCheckpoints: route.checkpoints.length });
    this.gates.forEach(g=>g.setEnabled(g.metadata.routeId===route.id));
    this.race.reset(); this.bridge.emit("raceProgress", this.race.snapshot());
    this.race.start(); this.resultSent = false; this.lastStanding = 0;
    this.controls.enabled = false; this.showRival(route); this.root.setEnabled(true);
    this.introRemaining = 3.2;
    this.bridge.emit("raceIntro", { title: route.rival ? `${route.name} · vs ${route.rival.name}` : route.name });
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  private reset() {
    this.abortAttempt();
    this.raceLine?.dispose(); this.raceLine = undefined;
    this.introRemaining = 0;
    this.bridge.emit("raceIntro", null);
    this.race.reset(); this.controls.enabled = this.modes.mode === "driving";
    this.gates.forEach(gate => gate.setEnabled(false));
    this.root.setEnabled(false); this.resultSent = false;
    this.disposeRival();
    this.bridge.emit("raceProgress", this.race.snapshot());
  }
  update(dt: number) {
    if (this.active && raceLineEnabled()) {
      if (!this.raceLine) {
        const limits = carLimits(this.player.controller.model.config);
        const points = buildRacingLine(this.selected.waypoints, limits, { level: .9, margin: 1.8 });
        this.raceLine = new RaceLineVisual(this.scene, points, limits.brake);
      }
    }
    else { this.raceLine?.dispose(); this.raceLine = undefined; }
    if (this.introRemaining > 0) {
      this.introRemaining = Math.max(0, this.introRemaining - dt);
      this.syncRivalVisual();
      if (this.introRemaining === 0) this.bridge.emit("raceIntro", null);
      return;
    }
    const phase = this.race.phase;
    const body = this.rivalBody;
    const rivalPosition = body?.position ?? this.race.rival.position;
    this.race.update(dt, this.player.position, rivalPosition);
    if (phase === "COUNTDOWN" && this.race.phase === "RUNNING") {
      this.controls.enabled = true;
      this.bridge.emit("raceStarted", this.standing());
    }
    this.syncRivalVisual();
    if (body) {
      const state = this.rivalController!.model.state;
      this.race.rival.speed = Math.max(0, state.vx);
      this.race.rival.heading = Math.atan2(body.forward.x, body.forward.z);
      const road = this.driver!.road;
      const remaining = road.cumulative[road.cumulative.length - 1] -
        road.progress(body.position, road.nearest(body.position));
      this.race.rival.departed = this.race.opponent.finished && remaining < 3 && state.vx < .5;
    }
    if (this.race.rival.departed) { this.root.setEnabled(false); this.disposeRival(); }
    this.respawnHold = Math.max(0, this.respawnHold - dt);
    if (this.pendingRespawn !== undefined) { this.respawnRival(this.pendingRespawn); this.pendingRespawn = undefined; }
    if (this.driver && (this.telemetryAge += dt) >= .2) {
      this.telemetryAge = 0;
      const snapshot = this.driver.debug();
      if (snapshot) this.bridge.emit('aiTelemetry', { driverId: this.selected.rival?.name ?? 'rival', ...snapshot });
    }
    (this.current ?? this.visual)?.update(dt, 0, this.root.isEnabled() ? this.race.rival.speed : 0);
    this.gates.filter(g=>g.metadata.routeId===this.selected.id).forEach((gate, i) => { gate.material = this.materials[i < this.race.player.next ? 2 : i === this.race.player.next ? 0 : 1]; });
    if (this.race.phase === "RUNNING" && this.lastStanding !== this.race.position) {
      this.lastStanding = this.race.position; this.bridge.emit("raceStandingChanged", this.standing());
    }
    while (this.attemptId && this.checkpointSent < this.race.player.next) {
      const checkpointIndex = ++this.checkpointSent, attemptId = this.attemptId, elapsedMs = Math.round((this.race.playerTime ?? this.race.elapsed) * 1000);
      if (this.garage.wallet?.persistent && this.garage.wallet.execute) { void this.garage.wallet.execute({ type: 'race_checkpoint', attemptId, checkpointIndex, elapsedMs }).catch(error => this.bridge.emit('persistenceError', `Race checkpoint was not saved: ${error instanceof Error ? error.message : String(error)}`)); }
    }
    if (this.race.phase === "FINISHED" && !this.resultSent) this.publishResult();
    if (phase !== this.race.phase) this.publisher.flush(this.race.snapshot());
    else this.publisher.tick(dt, () => this.race.snapshot());
  }
  private abortAttempt() {
    if (!this.race.abort()) return;
    this.raceLine?.dispose(); this.raceLine = undefined;
    this.introRemaining = 0;
    this.bridge.emit('raceIntro', null);
    this.controls.enabled = this.modes.mode === 'driving';
    this.root.setEnabled(false);
    this.publishResult();
    this.bridge.emit('raceProgress', this.race.snapshot());
  }
  private publishResult() {
    if (this.resultSent || !this.attemptId) return;
    this.resultSent = true;
    this.gates.forEach(gate => gate.setEnabled(false));
    const outcome = this.race.phase === 'DNF' ? 'dnf' as const : this.race.position === 1 ? 'win' as const : 'loss' as const;
    const result = { ...this.standing(), attemptId: this.attemptId, npcId: this.selected.rival?.npcId, vehicleId: this.selected.rival?.vehicleId,
      outcome, timeMs: Math.round((this.race.playerTime ?? this.race.elapsed) * 1000), validation: this.race.validation() };
    if (this.garage.wallet?.persistent && this.garage.wallet.execute) {
      void this.garage.wallet.execute({ type: 'race_complete', attemptId: result.attemptId, elapsedMs: result.timeMs,
        finish: outcome !== 'dnf' && result.validation.finishValidated && !result.validation.invalidFinish,
        opponentElapsedMs: this.race.opponentTime === null ? null : Math.round(this.race.opponentTime * 1000) }).then(receipt => {
        this.bridge.emit('raceFinished', { ...result, outcome: receipt.details.outcome as 'win' | 'loss' | 'dnf', position: Number(receipt.details.position), prizePhp: Number(receipt.details.prizePhp) });
      }, error => this.bridge.emit('persistenceError', `Race result was not saved: ${error instanceof Error ? error.message : String(error)}. Retry the save before leaving.`));
      return;
    }
    const prizePhp = this.garage.wallet ? payRacePrize(this.garage.wallet, result, this.selected.rival?.prizePhp ?? 0) : 0;
    this.bridge.emit('raceFinished', { ...result, prizePhp });
  }
  /** Swaps in the rival's own build; anonymous races and missing models keep the stock car. */
  private showRival(route: RaceDefinition) {
    let dressed = route.rival && this.dressed.get(route.id);
    const build = route.rival && NPC_CAR_BUILDS[route.rival.build];
    const source = build && this.garage.models?.()[npcCarId(build)];
    if (route.rival && !dressed && source) {
      const car = dressNpcCar(this.scene, source, `race-rival-${route.id}`, route.rival.paint, build);
      car.model.root.parent = this.root;
      dressed = { car, visual: VehicleVisual.wrap(car.model) };
      this.dressed.set(route.id, dressed);
    }
    this.dressed.forEach(d => d.car.model.root.setEnabled(d === dressed));
    this.visual?.model.root.setEnabled(!dressed);
    this.current = dressed ? dressed.visual : this.visual;
  }
  private createRival(route: RaceDefinition) {
    this.disposeRival();
    if (!this.world) return;
    const { definition, config } = rivalCar(route);
    const tier = route.rival?.tier ?? 2;
    const skill = DRIVER_SKILLS[Math.min(3, Math.max(0, tier - 1))];
    const seed = (route.rival?.name ?? route.id).split('').reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 1);
    const temperament = (seed % 101) / 100;
    const preference = (['inside', 'balanced', 'outside'] as const)[seed % 3];
    const personality = { aggression: .25 + temperament * .65, patience: .85 - temperament * .65,
      overtakingPreference: preference, defensiveTendency: .25 + temperament * .7,
      riskTolerance: .2 + temperament * .65, trafficRiskTolerance: .15 + temperament * .4,
      mistakeFrequency: .15 + temperament * .55 };
    const body = new VehicleBody(this.world, definition.collision, config.chassis.massKg, `rival-${route.id}`);
    const first = route.waypoints[0];
    const offset = Math.hypot(first.x - route.start.x, first.z - route.start.z) < 3 ? -2.8 : 0;
    const pose = { position: new Vector3(first.x + Math.cos(route.heading) * offset, first.y,
      first.z - Math.sin(route.heading) * offset), headingRad: route.heading };
    if (!body.place(pose)) { body.dispose(); return; }
    const line = rivalLine(route, config);
    const driver = new AIDriver(line.points, skill, personality, config.brakes.decelerationMps2,
      config.chassis.wheelbaseM, seed, line.limits);
    const probes = new ObstacleProbes(this.world, body, definition.collision.body.width / 2);
    const source = { read: () => {
      if (this.race.phase !== 'RUNNING' && this.race.phase !== 'FINISHED') return { throttle: 0, brake: 0, steer: 0 };
      if (this.respawnHold > 0) return { throttle: 0, brake: 1, steer: 0 };
      const model = this.rivalController!.model;
      // Same weather as the player: the rival gets no extra grip in the rain.
      model.surfaceGrip = this.player.controller.model.surfaceGrip;
      body.updateAxes();
      const nearby: NearbyVehicle[] = [{ position: this.player.position, velocity: {
        x: this.player.forward.x * this.player.speed, y: 0, z: this.player.forward.z * this.player.speed },
        kind: 'opponent', width: this.player.definition.collision.body.width, length: this.player.definition.collision.body.length }];
      for (const actor of this.traffic?.flow.actors ?? []) if (actor.active) nearby.push({
        position: actor.follower.position,
        velocity: { x: Math.sin(actor.follower.heading) * actor.follower.speed, y: 0,
          z: Math.cos(actor.follower.heading) * actor.follower.speed },
        kind: 'traffic', width: actor.kind.width, length: actor.kind.length,
      });
      const step = this.world!.fixedStep;
      const result = driver.drive(step, {
        position: body.position, heading: Math.atan2(body.forward.x, body.forward.z), speed: model.state.vx,
        yawRate: model.state.yawRate, lateralSlip: model.diagnostics.bodySlip,
        frontGripUsage: model.diagnostics.frontGripUse, rearGripUsage: model.diagnostics.rearGripUse,
        grip: model.surfaceGrip, reversing: model.state.reversing,
      }, nearby, probes.sample(step, model.state.vx));
      // Applied in `update`, outside the physics step that is reading this input.
      if (result.respawnRequest) this.pendingRespawn = result.respawnRequest.routeS;
      return result.input;
    } };
    this.rivalBody = body;
    this.driver = driver;
    this.probes = probes;
    this.rivalController = new VehicleController(this.world, body, config, source);
  }
  /**
   * Puts a hopelessly stuck rival back on its line: on pavement, aligned with the road,
   * clear of the player, at rest, then held briefly as a penalty.
   */
  private respawnRival(routeS: number) {
    const body = this.rivalBody, driver = this.driver, controller = this.rivalController;
    if (!body || !driver || !controller) return;
    const road = driver.road, end = road.cumulative[road.cumulative.length - 1];
    for (let s = routeS; s < Math.min(end - 5, routeS + 60); s += 5) {
      const at = road.at(s);
      if (Math.hypot(at.point.x - this.player.position.x, at.point.z - this.player.position.z) < 8) continue;
      const pose = { position: new Vector3(at.point.x, at.point.y + .3, at.point.z),
        headingRad: Math.atan2(at.forward.x, at.forward.z) };
      if (!body.place(pose)) continue;
      controller.reset();
      driver.respawned(s);
      this.respawnHold = 1.5;
      return;
    }
  }
  private syncRivalVisual() {
    if (!this.rivalBody) return;
    this.root.position.copyFrom(this.rivalBody.position);
    this.root.rotationQuaternion ??= this.rivalBody.node.rotationQuaternion!.clone();
    this.root.rotationQuaternion.copyFrom(this.rivalBody.node.rotationQuaternion!);
  }
  private disposeRival() {
    this.rivalController?.dispose(); this.rivalBody?.dispose();
    this.rivalController = undefined; this.rivalBody = undefined; this.driver = undefined; this.probes = undefined;
  }
  private standing() { return { raceId: this.selected.id, position: this.race.position, racers: 2 }; }
  dispose() {
    this.abortAttempt();
    this.raceLine?.dispose(); this.raceLine = undefined;
    this.disposed = true; this.releases.forEach((release) => release());
    this.player.canReposition = undefined; this.modes.canExit = undefined;
    this.controls.enabled = this.modes.mode === "driving";
    this.visual?.dispose(); this.dressed.forEach(d => d.car.dispose()); this.root.dispose(); this.gates.forEach((gate) => gate.dispose()); this.materials.forEach((m) => m.dispose());
    this.disposeRival();
  }
}
