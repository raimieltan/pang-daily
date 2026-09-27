import type { SocialStoragePort } from '../social/socialStorage';
import type { PersistenceFactory, RuntimePersistence } from '../../game-core/persistence/PersistenceFactory';
import { SocialOpportunityService } from '../social/SocialOpportunityService';
import { Engine } from "@babylonjs/core/Engines/engine";
import { GameBridge, type GameCommands, type GameEventSource } from "../bridge";
import { INITIAL_SCENE, scenes, type SceneId } from "../scenes";
import { SceneManager } from "./SceneManager";
import { GameAudio } from "../audio/GameAudio";
import { loadVehicleSession } from "../maintenance/sessionStorage";
import { loadJobSession } from "../jobs/jobStorage";
import { HUB_JOBS } from "../jobs/hubJobs";
import { loadInventorySession, loadMarketplaceSession } from "../marketplace/marketStorage";
import { SocialEventBridge } from "../social/SocialEventBridge";
import { MarketplaceService } from "../marketplace/MarketplaceService";
import { grantCustomizationTestKit } from '../vehicles/developmentParts';
import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
import { InventorySession } from '../../game-core/inventory/InventorySession';
import { JobSession } from '../../game-core/jobs/JobSession';
import { SOCIAL_SESSION_KEY } from '../social/socialStorage';
import { saveActiveCar } from '../vehicles/garageStorage';
import type { RuntimeBootstrap } from '../../game-core/persistence/RuntimeBootstrap';

const STATS_INTERVAL_MS = 500;
/** Clamp so a backgrounded tab doesn't produce one giant simulation step on return. */
const MAX_FRAME_DT_SECONDS = 0.1;
/** `next dev` only: keep the wallet topped up so paid features can be tried freely. */
const DEV_WALLET_PHP = 1_000_000;

export type GameRuntimeOptions = {
  initialScene?: SceneId;
  bootstrap?: RuntimeBootstrap;
  persistence?: PersistenceFactory;
};

/**
 * Owns the Babylon engine, resize handling, render loop, and scene manager.
 * All frame-level state lives here; React only sees the bridge's UI half
 * (`events` to subscribe, `commands` to send intents).
 *
 * Lifecycle: constructor (engine + resize) → start() (loop + initial scene) → dispose().
 */
export class GameRuntime {
  private readonly bridge = new GameBridge();
  readonly events: GameEventSource = this.bridge.ui.events;
  readonly commands: GameCommands = this.bridge.ui.commands;

  private readonly engine: Engine;
  private readonly audio: GameAudio;
  private readonly scenes: SceneManager<SceneId>;
  private readonly market: MarketplaceService;
  private readonly social: SocialEventBridge;
  private readonly resizeObserver: ResizeObserver;
  private readonly initialScene: SceneId;
  private paused = false;
  private contactsOpen = false;
  private dialogueOpen = false;
  private contactsWasPaused = false;
  private lastStatsAt = 0;
  private readonly opportunities: SocialOpportunityService;
  private started = false;
  private disposed = false;
  private persistence?: RuntimePersistence;
  private saveElapsed = 0;

  constructor(canvas: HTMLCanvasElement, options: GameRuntimeOptions = {}) {
    if (options.bootstrap && !options.persistence) throw new Error('Server bootstrap requires server persistence.');
    if (!options.bootstrap && process.env.NODE_ENV === 'production') throw new Error('Sign in to load a server save.');
    this.initialScene = options.initialScene ?? INITIAL_SCENE;
    this.engine = new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" }, true);
    this.audio = new GameAudio(this.events);

    const { emit, handle } = this.bridge.runtime;
    let storage: Storage | undefined;
    if (!options.bootstrap) {
      try { storage = window.sessionStorage; } catch { /* The runtime still keeps session state in memory. */ }
    }
    const session = options.bootstrap ? new VehicleSession(options.bootstrap.vehicles) : loadVehicleSession(storage);
    const devTopUp = DEV_WALLET_PHP - session.snapshot().walletPhp;
    if (!options.bootstrap && process.env.NODE_ENV === "development" && devTopUp > 0) {
      session.earn(Math.round(devTopUp * 100) / 100, { kind: "dev_grant", description: "Dev cash top-up", source: "dev" });
    }

    // The phone outlives scenes, so the marketplace is runtime-wide like pause.
    const inventory = options.bootstrap ? new InventorySession(options.bootstrap.inventory) : loadInventorySession(storage);
    if (!options.bootstrap && process.env.NODE_ENV === 'development') grantCustomizationTestKit(inventory);
    const socialFallback = new Map<string, string>();
    let loadedSocial = options.bootstrap?.social;
    const baseSocialStorage = storage ?? {
      getItem: (key: string) => socialFallback.get(key) ?? null,
      setItem: (key: string, value: string) => { socialFallback.set(key, value); },
    };
    const socialStorage: SocialStoragePort = options.bootstrap ? {
      getItem: key => key === SOCIAL_SESSION_KEY ? JSON.stringify(loadedSocial) : baseSocialStorage.getItem(key),
      setItem: (key, value) => { if (key === SOCIAL_SESSION_KEY) throw new Error('Social state is server-owned.'); baseSocialStorage.setItem(key, value); },
    } : baseSocialStorage;
    if (options.bootstrap) {
      saveActiveCar(options.bootstrap.activeDefinitionId, socialStorage);
    }
    this.opportunities = new SocialOpportunityService(this.bridge.runtime, socialStorage);
    const access = this.opportunities.access;
    session.useSocialAccess(access);
    const jobs = options.bootstrap ? new JobSession(session, HUB_JOBS, options.bootstrap.jobs) : loadJobSession(session, HUB_JOBS, storage);
    if (options.bootstrap && options.persistence) {
      this.persistence = options.persistence({ initial: options.bootstrap, wallet: session, inventory, jobs, report: message => emit('persistenceError', message), refresh: fresh => { loadedSocial = fresh.social; } });
      socialStorage.executeSocial = intent => this.persistence!.execute(intent);
      session.usePersistence(this.persistence); inventory.usePersistence(this.persistence);
      for (const race of options.bootstrap.interruptedRaces ?? []) void this.persistence.execute({ type: 'race_complete', ...race, finish: false }).catch(error => emit('persistenceError', `Interrupted race could not be saved: ${error instanceof Error ? error.message : String(error)}`));
    }
    const marketplace = loadMarketplaceSession(session, inventory, storage);
    marketplace.useSocialAccess(access);
    if (this.persistence) marketplace.usePersistence(this.persistence);
    this.market = new MarketplaceService(this.bridge.runtime, marketplace);
    this.social = new SocialEventBridge(this.events, socialStorage, error => emit('error', { message: `Social event rejected: ${error.message}` }), (progress, tierChange) => {
      emit('socialReputationUpdated', progress);
      if (tierChange) emit('socialTierChanged', tierChange);
    });
    this.events.on('dialogueViewChanged', view => { this.dialogueOpen = view !== null; });
    this.scenes = new SceneManager(this.engine, scenes, this.bridge.runtime, {
      onLoading: (sceneId) => emit("sceneLoading", { sceneId }),
      onReady: (sceneId) => emit("sceneReady", { sceneId }),
      onError: (sceneId, error) => {
        const reason = error instanceof Error ? error.message : String(error);
        emit("error", { message: `Scene "${sceneId}" failed: ${reason}` });
      },
    }, session, jobs,
      this.market, inventory, socialStorage, options.bootstrap ? { ownedVehicleDefinitionIds: options.bootstrap.ownedDefinitionIds, garageStorage: socialStorage } : undefined);

    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);

    handle('openContacts', () => {
      if (this.contactsOpen) return;
      if (this.dialogueOpen) this.commands.closeDialogue();
      this.commands.closeMarketplace();
      this.contactsWasPaused = this.paused;
      this.contactsOpen = true;
      this.opportunities.update(1);
      this.setPaused(true);
      emit('contactsOpened', true);
    });
    handle('closeContacts', () => {
      if (!this.contactsOpen) return;
      this.contactsOpen = false;
      emit('contactsOpened', false);
      this.setPaused(this.contactsWasPaused);
    });
    // Runtime-wide commands; gameplay commands are registered by scene systems.
    handle('retryPersistence', () => this.persistence?.checkpoint());
    handle("pause", () => this.setPaused(true));
    handle("resume", () => this.setPaused(false));
    handle("switchScene", ({ sceneId }) => void this.scenes.switchTo(sceneId));
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.engine.runRenderLoop(() => this.frame());
    this.bridge.runtime.emit("ready");
    void this.scenes.switchTo(this.initialScene);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.persistence?.dispose();
    this.audio.dispose();
    this.market.dispose();
    this.engine.stopRenderLoop();
    this.scenes.dispose();
    this.social.dispose();
    this.engine.dispose();
    this.bridge.dispose();
  }

  private frame(): void {
    const scene = this.scenes.activeScene;
    if (scene) {
      scene.metadata ??= {};
      scene.metadata.analogPaused = this.paused;
    }
    if (!this.paused) {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, MAX_FRAME_DT_SECONDS);
      this.scenes.update(dt);
      this.market.update(dt);
      this.opportunities.update(dt);
      this.saveElapsed += dt;
      if (this.saveElapsed >= 20) { this.saveElapsed = 0; this.persistence?.checkpoint(); }
    }
    // Keep rendering while paused so resizes and camera orbit still draw; systems stay frozen.
    this.scenes.render();

    const now = performance.now();
    if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
      this.lastStatsAt = now;
      this.bridge.runtime.emit("statsUpdated", { fps: Math.round(this.engine.getFps()) });
    }
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.scenes.setPaused(paused);
    this.bridge.runtime.emit("paused", { paused });
  }
}
