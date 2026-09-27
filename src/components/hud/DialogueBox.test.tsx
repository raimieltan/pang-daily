// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GameBridge } from '@/game/bridge/GameBridge';
import { bindGameUiStore } from '@/state/gameUiStore';
import { DialogueBox } from './DialogueBox';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let release: (() => void)[];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); release = []; });
afterEach(() => { act(() => root.unmount()); release.reverse().forEach(off => off()); host.remove(); vi.unstubAllGlobals(); });

it('renders runtime conversation views, sends choice intents, and exits repeatedly', () => {
 const bridge = new GameBridge();
 release.push(() => bridge.dispose(), bindGameUiStore(bridge.ui));
 const choices: string[] = [];
 release.push(bridge.runtime.handle('chooseDialogue', ({ choiceId }) => { choices.push(choiceId); }));
 release.push(bridge.runtime.handle('closeDialogue', () => {}));
 act(() => root.render(<DialogueBox />));
 for (let n = 0; n < 3; n++) {
  act(() => bridge.runtime.emit('dialogueViewChanged', { dialogueId: 'casey_intro', nodeId: 'casey_post_race', speaker: 'Casey', text: 'Maayo nga run.', choices: [{ id: 'congratulate_casey', text: 'Maayo ka magdala.' }], selectedChoiceId: 'congratulate_casey' }));
  expect(host.textContent).toContain('Maayo nga run.');
  act(() => host.querySelector<HTMLButtonElement>('[data-choice-id="congratulate_casey"]')!.click());
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Leave conversation"]')!.click());
  act(() => bridge.runtime.emit('dialogueViewChanged', null));
  expect(host.querySelector('[data-testid="dialogue"]')).toBeNull();
 }
 expect(choices).toEqual(['congratulate_casey', 'congratulate_casey', 'congratulate_casey']);
});

it('shows an exit when a valid fallback has no choices', () => {
 const bridge = new GameBridge(); release.push(() => bridge.dispose(), bindGameUiStore(bridge.ui));
 act(() => root.render(<DialogueBox />));
 act(() => bridge.runtime.emit('dialogueViewChanged', { dialogueId: 'casey_intro', nodeId: 'casey_familiar', speaker: 'Casey', text: 'Ara ka naman.', choices: [], selectedChoiceId: null }));
 expect(host.textContent).toContain('Ara ka naman.');
 expect(host.querySelector('[aria-label="Leave conversation"]')).not.toBeNull();
});
