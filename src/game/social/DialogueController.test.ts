import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { describe, expect, it } from 'vitest';
import { GameBridge } from '@/game/bridge/GameBridge';
import { InputManager } from '@/game/input/InputManager';
import { loadSocialSession } from './socialStorage';
import { DialogueController } from './DialogueController';

const memoryStorage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const setup = () => { const bridge = new GameBridge(), target = new EventTarget(), input = new InputManager(target, undefined, () => []), storage = memoryStorage(); const controller = new DialogueController(bridge.runtime, input, storage); const views: unknown[] = []; bridge.ui.events.on('dialogueViewChanged', view => views.push(view)); const key = (type: 'keydown' | 'keyup', code: string) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code, repeat: false })); return { bridge, input, storage, controller, views, key }; };

describe('world dialogue controller', () => {
 it('opens a first meeting, exits on cancel, and restores controls through repeated open/close', () => {
  const s = setup();
  for (let n = 0; n < 3; n++) { s.controller.open('casey_intro'); expect(s.input.axis('moveY')).toBe(0); s.controller.close(); expect(s.views.at(-1)).toBeNull(); }
  expect((s.views[0] as { nodeId: string }).nodeId).toBe('casey_first');
  expect((s.views[2] as { nodeId: string }).nodeId).toBe('casey_familiar');
  s.controller.open('casey_intro');
  s.key('keydown', 'Escape'); s.input.update(); s.controller.update();
  expect(s.views.at(-1)).toBeNull();
  s.key('keyup', 'Escape'); s.key('keydown', 'KeyW'); s.input.update();
  expect(s.input.axis('moveY')).toBe(1);
  s.controller.dispose(); s.input.dispose(); s.bridge.dispose();
 });

 it('rejects stale selection and does not consume it', () => {
  const s = setup();
  s.controller.open('casey_intro');
  const rejected = s.controller.choose('congratulate_casey');
  expect(rejected).toMatchObject({ rejected: expect.any(String) });
  expect(loadSocialSession(s.storage).snapshot().appliedEvents).toHaveLength(1);
  s.controller.dispose(); s.input.dispose(); s.bridge.dispose();
 });

 it('applies one-shot choice once after a race, even with duplicate confirmation', () => {
  const s = setup();
  const session = loadSocialSession(s.storage);
  session.applyEvent({ type: 'dialogue', eventId: 'intro:casey', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
  session.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'race:casey', sourceId: 'casey', attemptId: 'casey', npcId: 'casey', raceId: 'pahuway_descent', position: 2, racers: 2, timeMs: 120000 });
  s.controller.open('casey_intro');
  expect((s.views.at(-1) as { nodeId: string }).nodeId).toBe('casey_post_race');
  expect(s.controller.choose('congratulate_casey')).toBeUndefined();
  expect(s.controller.choose('congratulate_casey')).toMatchObject({ rejected: expect.any(String) });
  expect(loadSocialSession(s.storage).snapshot().npcs.casey.trust).toBe(53);
  expect((s.views.at(-1) as { choices: { id: string }[] }).choices.map(choice => choice.id)).toEqual(['crew_info', 'casey_rematch_info']);
  s.controller.dispose(); s.input.dispose(); s.bridge.dispose();
 });
});

it('authenticated dialogue waits for server state, rejects local assignments, and keeps an unsaved choice available', async () => {
 const { SocialSession, createSocialState } = await import('@/game-core/social/SocialSession');
 const { SOCIAL_CONTENT } = await import('@/game-core/social/catalog');
 const { SOCIAL_SESSION_KEY } = await import('./socialStorage');
 let state = createSocialState(SOCIAL_CONTENT);
 let confirm!: () => void;
 let fail = false;
 const storage = {
  getItem: (key: string) => key === SOCIAL_SESSION_KEY ? JSON.stringify(state) : null,
  setItem: () => { throw new Error('Direct social assignment'); },
  executeSocial: async (intent: import('@/game-core/persistence/PersistencePort').PersistentIntent) => {
   await new Promise<void>(resolve => { confirm = resolve; });
   if (fail) throw new Error('Offline');
   const session = new SocialSession(SOCIAL_CONTENT, state);
   if (intent.type === 'social_introduce') session.applyEvent({ type: 'dialogue', eventId: 'intro', sourceId: 'talyer_mang_boy', dialogueId: 'talyer_mang_boy', npcId: 'mang_boy' });
   else session.chooseConversation(String(intent.dialogueId), String(intent.nodeId), String(intent.choiceId));
   state = session.snapshot();
   return { resourceId: null, transactionId: null, sequence: null, amountCentavos: '0', balanceCentavos: '500000', details: {} };
  },
 };
 const bridge = new GameBridge(), input = new InputManager(new EventTarget(), undefined, () => []);
 const controller = new DialogueController(bridge.runtime, input, storage);
 const flush = async () => { confirm(); await new Promise(resolve => setTimeout(resolve, 0)); };
 try {
  controller.open('talyer_mang_boy');
  expect(state.npcs.mang_boy.introduced).toBe(false);
  expect(controller.choose('promise_help')).toHaveProperty('rejected');
  await flush(); expect(state.npcs.mang_boy.introduced).toBe(true);
  expect(() => loadSocialSession(storage).chooseConversation('talyer_mang_boy', 'mang_first', 'promise_help')).toThrow('server command');
  controller.choose('promise_help'); expect(state.npcs.mang_boy.trust).toBe(50);
  fail = true; await flush(); expect(state.npcs.mang_boy.trust).toBe(50);
  fail = false; controller.choose('promise_help'); await flush(); expect(state.npcs.mang_boy.trust).toBe(52);
 } finally { controller.dispose(); input.dispose(); bridge.dispose(); }
});
