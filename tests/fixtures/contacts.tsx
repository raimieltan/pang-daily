import { createRoot } from 'react-dom/client';
import { ContactsApp } from '@/components/hud/ContactsApp';
import { DialogueBox } from '@/components/hud/DialogueBox';
import { SocialFeedback } from '@/components/hud/SocialFeedback';
import { GameBridge } from '@/game/bridge/GameBridge';
import { InputManager } from '@/game/input/InputManager';
import { DialogueController } from '@/game/social/DialogueController';
import { SocialOpportunityService } from '@/game/social/SocialOpportunityService';
import { SocialEventBridge } from '@/game/social/SocialEventBridge';
import { loadSocialSession, SOCIAL_SESSION_KEY } from '@/game/social/socialStorage';
import { bindGameUiStore } from '@/state/gameUiStore';
import { bindSocialStore, useSocialStore } from '@/state/socialStore';
import { raceValidation } from './raceValidation';

const bridge = new GameBridge();
const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
const input = new InputManager(window, undefined, () => [pad as unknown as Gamepad]);
const dialogue = new DialogueController(bridge.runtime, input, sessionStorage);
const service = new SocialOpportunityService(bridge.runtime, sessionStorage);
new SocialEventBridge(bridge.ui.events, sessionStorage);
bindGameUiStore(bridge.ui);
bindSocialStore(bridge.ui.events, sessionStorage);
bridge.runtime.handle('openContacts', () => { dialogue.close(); service.update(1); input.setPaused(true); bridge.runtime.emit('contactsOpened', true); });
bridge.runtime.handle('closeContacts', () => { bridge.runtime.emit('contactsOpened', false); input.setPaused(false); });
bridge.runtime.emit('ready');
function App() {
 return <><button id="phone" onClick={() => bridge.ui.commands.openContacts()}>Phone · Contacts</button><button id="talk" onClick={() => { const outcome = dialogue.open('casey_intro'); if (outcome) console.error(outcome); }}>Talk to Casey</button><ContactsApp /><DialogueBox /><SocialFeedback /></>;
}
createRoot(document.getElementById('root')!).render(<App />);
Object.assign(window, { contactsTest: {
 tick: () => { input.update(); dialogue.update(); service.update(1); },
 snapshot: () => loadSocialSession(sessionStorage).snapshot(),
 view: () => useSocialStore.getState().view,
 notices: () => useSocialStore.getState().notices,
 pad: (button: number, pressed: boolean) => { pad.buttons[button] = { pressed, value: pressed ? 1 : 0 }; },
 axes: () => ({ walk: input.axis('moveY'), throttle: input.axis('throttle') }),
 seed: () => {
  const session = loadSocialSession(sessionStorage);
  for (const [npcId, dialogueId] of [['casey', 'casey_intro'], ['mang_boy', 'talyer_mang_boy'], ['jun_surplus', 'seller_jun_surplus']]) session.applyEvent({ type: 'dialogue', eventId: `dialogue:${npcId}:${dialogueId}`, sourceId: dialogueId, npcId, dialogueId });
  session.applyEvent({ type: 'dialogue', npcId: 'mang_boy', dialogueId: 'talyer_mang_boy', eventId: 'promise', sourceId: 'promise', choiceId: 'promise_help' });
  const state = session.snapshot(); state.npcs.casey.trust = 20; state.npcs.casey.respect = 70; state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 10 };
  sessionStorage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(state)); service.update(1);
 },
 race: () => bridge.runtime.emit('raceFinished', { raceId: 'pahuway_descent', attemptId: 'browser:one', position: 2, racers: 2, timeMs: 120000, validation: raceValidation('pahuway_descent') }),
 long: () => {
  const next = structuredClone(useSocialStore.getState().view);
  next.contacts[0].name = 'Casey with a very long family name '.repeat(7);
  next.contacts[0].lastEvent = 'A long shared event description '.repeat(30);
  next.contacts[0].history = Array.from({ length: 8 }, () => 'A remembered shared event '.repeat(30));
  bridge.runtime.emit('socialViewChanged', next);
 },
 clearNotices: () => useSocialStore.setState({ notices: [] }),
} });
