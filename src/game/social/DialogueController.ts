import { rivalHistory } from '@/game-core/social/rivalHistory';
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import { CONVERSATIONS, dialogueNodeText, evaluateDialogueCondition, resolveConversation } from '@/game-core/social/conversation';
import type { RuntimePort } from '@/game/bridge';
import type { GameSystem } from '@/game/engine/types';
import type { InputManager } from '@/game/input/InputManager';
import { loadSocialSession, type SocialStoragePort } from './socialStorage';

type Outcome = { rejected: string } | void;

/** Owns the dialogue input context and sends only validated views over the runtime bridge. */
export class DialogueController implements GameSystem {
 readonly name = 'dialogue';
 private dialogueId: string | null = null;
 private nodeId: string | null = null;
 private selectedChoiceId: string | null = null;
 private ready = true;
 private readonly release: (() => void)[];

 constructor(private readonly bridge: RuntimePort, private readonly input: InputManager, private readonly storage: SocialStoragePort) {
  this.release = [
   bridge.handle('chooseDialogue', ({ choiceId }) => this.choose(choiceId)),
   bridge.handle('closeDialogue', () => this.close()),
  ];
 }

 open(dialogueId: string): Outcome {
  if (!CONVERSATIONS.some((item) => item.id === dialogueId)) return { rejected: `unknown conversation: ${dialogueId}` };
  try {
   const session = loadSocialSession(this.storage);
   const first = resolveConversation(dialogueId, session.snapshot());
   const npc = SOCIAL_CONTENT.npcs.find((item) => item.dialogueEntryId === dialogueId)!;
   session.applyEvent({ type: 'dialogue', eventId: `dialogue:${npc.id}:${dialogueId}`, sourceId: dialogueId, npcId: npc.id, dialogueId });
   this.dialogueId = dialogueId;
   this.nodeId = first.node.id;
   this.selectedChoiceId = null;
   this.ready = !this.input.held('interact');
   this.input.setContext('dialogue');
   this.publish();
  } catch (error) { this.close(); return { rejected: error instanceof Error ? error.message : String(error) }; }
 }

 choose(choiceId: string): Outcome {
  if (!this.dialogueId || !this.nodeId) return { rejected: 'conversation closed' };
  try {
   const definition = CONVERSATIONS.find((item) => item.id === this.dialogueId)!;
   const node = definition.nodes.find((item) => item.id === this.nodeId)!;
   const choice = node.choices.find((item) => item.id === choiceId);
   const session = loadSocialSession(this.storage);
   const state = session.snapshot();
   if (!choice || (choice.when && !evaluateDialogueCondition(choice.when, state)) || (choice.once && state.appliedEvents.some((item) => item.eventId === `conversation:${this.dialogueId}:${choiceId}`))) {
    this.publish();
    return { rejected: 'unavailable dialogue choice' };
   }
   const result = session.chooseConversation(this.dialogueId, this.nodeId, choiceId);
   if (result.status === 'duplicate') { this.publish(); return { rejected: 'dialogue choice already consumed' }; }
   this.nodeId = choice.nextNodeId ?? this.nodeId;
   this.selectedChoiceId = null;
   this.publish();
  } catch (error) { this.publish(); return { rejected: error instanceof Error ? error.message : String(error) }; }
 }

 close(): void {
  if (!this.dialogueId) return;
  this.dialogueId = null; this.nodeId = null; this.selectedChoiceId = null;
  this.input.setContext('gameplay');
  this.bridge.emit('dialogueViewChanged', null);
 }

 update(): void {
  if (!this.dialogueId) return;
  if (!this.ready) {
   if (!this.input.held('dialogueConfirm') && !this.input.held('dialogueCancel') && !this.input.held('dialogueUp') && !this.input.held('dialogueDown')) this.ready = true;
   return;
  }
  if (this.input.pressed('dialogueCancel')) { this.close(); return; }
  const choices = this.currentChoices();
  if (this.input.pressed('dialogueUp') || this.input.pressed('dialogueDown')) {
   if (choices.length) {
    const index = choices.findIndex((choice) => choice.id === this.selectedChoiceId);
    const direction = this.input.pressed('dialogueDown') ? 1 : -1;
    this.selectedChoiceId = choices[(index + direction + choices.length) % choices.length].id;
    this.publish();
   }
  }
  if (this.input.pressed('dialogueConfirm')) {
   if (choices.length) this.choose(this.selectedChoiceId ?? choices[0].id);
   else this.close();
  }
 }

 dispose(): void { this.close(); this.release.forEach((off) => off()); }

 private currentChoices() {
  const definition = CONVERSATIONS.find((item) => item.id === this.dialogueId);
  const node = definition?.nodes.find((item) => item.id === this.nodeId);
  if (!node) return [];
  const state = loadSocialSession(this.storage).snapshot();
  return node.choices.filter((choice) => (!choice.when || evaluateDialogueCondition(choice.when, state)) && (!choice.once || !state.appliedEvents.some((item) => item.eventId === `conversation:${this.dialogueId}:${choice.id}`)));
 }

 private publish(): void {
  const definition = CONVERSATIONS.find((item) => item.id === this.dialogueId);
  const node = definition?.nodes.find((item) => item.id === this.nodeId);
  if (!node) { this.close(); return; }
  const choices = this.currentChoices();
  if (!choices.some((choice) => choice.id === this.selectedChoiceId)) this.selectedChoiceId = choices[0]?.id ?? null;
  const state = loadSocialSession(this.storage).snapshot();
  this.bridge.emit('dialogueViewChanged', { dialogueId: definition!.id, nodeId: node.id, speaker: SOCIAL_CONTENT.npcs.find((item) => item.id === node.speakerId)!.name, text: dialogueNodeText(node, state), rival: definition!.npcId === 'casey' ? rivalHistory(state) : undefined, choices: choices.map(({ id, text }) => ({ id, text })), selectedChoiceId: this.selectedChoiceId });
 }
}
