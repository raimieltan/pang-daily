import { createRoot } from 'react-dom/client';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameBridge } from '@/game/bridge/GameBridge';
import { InputManager } from '@/game/input/InputManager';
import { InteractionSystem } from '@/game/interaction/InteractionSystem';
import { interactablesFromZones } from '@/game/interaction/Interaction';
import { HUB_LAYOUT } from '@/game/world/hub/hubLayout';
import { RaceSystem } from '@/game/races/RaceSystem';
import { LOCAL_ROUTE } from '@/game/races/localRoute';
import { DialogueController } from '@/game/social/DialogueController';
import { SocialEventBridge } from '@/game/social/SocialEventBridge';
import { SocialOpportunityService } from '@/game/social/SocialOpportunityService';
import { loadSocialSession } from '@/game/social/socialStorage';
import { rivalHistory } from '@/game-core/social/rivalHistory';
import { loadVehicleSession } from '@/game/maintenance/sessionStorage';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import type { PlayerVehicle } from '@/game/vehicles/PlayerVehicle';
import type { PlayerModes } from '@/game/player/PlayerModes';
import type { DriverControls } from '@/game/input/DriverControls';
import { DialogueBox } from '@/components/hud/DialogueBox';
import { DrivingHud } from '@/components/hud/DrivingHud';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindHudStore } from '@/state/hudStore';

const bridge = new GameBridge();
const input = new InputManager(window, undefined, () => []);
const dialogue = new DialogueController(bridge.runtime, input, sessionStorage);
const errors: string[] = [];
new SocialEventBridge(bridge.ui.events, sessionStorage, error => errors.push(error.message));
const opportunities = new SocialOpportunityService(bridge.runtime, sessionStorage);
const wallet = loadVehicleSession(sessionStorage);
const engine = new NullEngine(); const scene = new Scene(engine);
const position = new Vector3(LOCAL_ROUTE.start.x, LOCAL_ROUTE.start.y, LOCAL_ROUTE.start.z);
const player = { definition: { spec: car }, position, placeAt: ({ position: at }: { position: Vector3 }) => { position.copyFrom(at); return true; } } as unknown as PlayerVehicle;
const modes = { position, mode: 'driving' } as PlayerModes;
const race = new RaceSystem(scene, bridge.runtime, player, { enabled: true } as DriverControls, modes, [LOCAL_ROUTE], { wallet, access: opportunities.raceRejection });
const interactions = new InteractionSystem(bridge.runtime, modes, [race.interactions, () => interactablesFromZones(HUB_LAYOUT.chunks.flatMap(chunk => chunk.zones))]);
race.connect(interactions); interactions.handle('talk_contact', target => dialogue.open(target.dialogueId!));
bindGameUiStore(bridge.ui); bindHudStore(bridge.ui.events);
createRoot(document.getElementById('root')!).render(<><DrivingHud /><DialogueBox /></>);

function start() {
 dialogue.close(); (modes as unknown as { mode: string }).mode = 'driving'; position.set(LOCAL_ROUTE.start.x, LOCAL_ROUTE.start.y, LOCAL_ROUTE.start.z);
 bridge.ui.commands.startRace(LOCAL_ROUTE.id);
 for (let i = 0; i < 70; i++) race.update(.1);
 if (race.race.phase !== 'RUNNING') throw new Error('Race failed to start');
}
function finish() {
 for (const gate of [...LOCAL_ROUTE.checkpoints, LOCAL_ROUTE.finish]) {
  position.set(gate.center.x, gate.center.y, gate.center.z); race.update(.1);
 }
}
Object.assign(window, { rivalTest: {
 start,
 play: (outcome: 'win' | 'loss' | 'dnf') => {
  start();
  if (outcome === 'dnf') bridge.ui.commands.abandonRace();
  else {
   if (outcome === 'loss') for (let i = 0; i < 5000 && race.race.opponentTime === null; i++) race.update(.1);
   if (outcome === 'loss' && race.race.opponentTime === null) throw new Error('AI did not finish');
   finish();
  }
 },
 skippedFinish: () => { start(); position.set(LOCAL_ROUTE.finish.center.x, LOCAL_ROUTE.finish.center.y, LOCAL_ROUTE.finish.center.z); race.update(.1); },
 withdraw: () => bridge.ui.commands.abandonRace(),
 meet: () => { (modes as unknown as { mode: string }).mode = 'walking'; position.set(137.5, 0, 97.5); return interactions.trigger(); },
 close: () => dialogue.close(),
 history: () => rivalHistory(loadSocialSession(sessionStorage).snapshot()),
 social: () => loadSocialSession(sessionStorage).snapshot(),
 wallet: () => wallet.snapshot(),
 identity: () => LOCAL_ROUTE.rival,
 errors: () => errors,
 phase: () => race.race.snapshot(),
} });
