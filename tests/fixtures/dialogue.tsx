import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DialogueBox } from '@/components/hud/DialogueBox';
import { GameBridge } from '@/game/bridge/GameBridge';
import { InputManager } from '@/game/input/InputManager';
import { InteractionSystem } from '@/game/interaction/InteractionSystem';
import { interactablesFromZones } from '@/game/interaction/Interaction';
import { HUB_LAYOUT } from '@/game/world/hub/hubLayout';
import { DialogueController } from '@/game/social/DialogueController';
import { loadSocialSession, SOCIAL_SESSION_KEY } from '@/game/social/socialStorage';
import { bindGameUiStore } from '@/state/gameUiStore';
import type { GameEventMap } from '@/game/bridge/GameEvents';

const bridge = new GameBridge();
const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
const input = new InputManager(window, undefined, () => [pad as unknown as Gamepad]);
const controller = new DialogueController(bridge.runtime, input, sessionStorage);
const player = { position: new Vector3(137.5, 0, 97.5), mode: 'walking' as const };
const interactions = new InteractionSystem(bridge.runtime, player, [() => interactablesFromZones(HUB_LAYOUT.chunks.flatMap(chunk => chunk.zones))]);
interactions.handle('talk_contact', target => controller.open(target.dialogueId!));
let view: GameEventMap['dialogueViewChanged'] = null;
bridge.ui.events.on('dialogueViewChanged', next => { view = next; });
bindGameUiStore(bridge.ui);
function Harness() {
 useEffect(() => { Object.assign(window, { dialogueReady: true }); }, []);
 return <DialogueBox />;
}
createRoot(document.getElementById('root')!).render(<Harness />);

const tick = () => { input.update(); controller.update(); };
const snapshot = () => loadSocialSession(sessionStorage).snapshot();
Object.assign(window, { dialogueTest: {
 tick, snapshot,
 open: (id = 'casey_intro') => controller.open(id),
 interact: () => interactions.trigger(),
 close: () => controller.close(),
 choose: (id: string) => controller.choose(id),
 view: () => view,
 focus: () => interactions.current,
 axes: () => ({ throttle: input.axis('throttle'), walk: input.axis('moveY'), interact: input.held('interact') }),
 pad: (button: number, pressed: boolean) => { pad.buttons[button] = { pressed, value: pressed ? 1 : 0 }; tick(); },
 seed: (kind: 'fresh' | 'race' | 'low') => {
  controller.close();
  sessionStorage.removeItem(SOCIAL_SESSION_KEY);
  if (kind === 'fresh') return;
  const session = loadSocialSession(sessionStorage);
  session.applyEvent({ type: 'dialogue', eventId: 'fixture:intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  session.applyEvent({ type: 'race', eventId: 'fixture:race', sourceId: 'fixture:race', attemptId: 'fixture:race', npcId: 'casey', raceId: 'pahuway_descent', position: 2, racers: 2, timeMs: 120000 });
  if (kind === 'low') {
   const next = session.snapshot();
   next.npcs.casey.trust = 20;
   sessionStorage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(next));
  }
 },
 invalidate: () => {
  const next = snapshot();
  next.npcs.casey.relationshipFlags.push('hostile');
  sessionStorage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(next));
 },
 sceneExit: () => { controller.dispose(); bridge.runtime.emit('sceneLoading', { sceneId: 'hub' }); },
} });
