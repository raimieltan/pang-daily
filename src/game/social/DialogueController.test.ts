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
