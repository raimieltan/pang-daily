/** Compatibility-only browser persistence for standalone development/test fixtures.
 * Account sessions use the server service and never restore these browser values. */
import { SOCIAL_CONTENT } from '@/game-core/social/catalog';
import type { PersistentIntent, PersistentReceipt } from '@/game-core/persistence/PersistencePort';
import { SocialSession } from '@/game-core/social/SocialSession';

export const SOCIAL_SESSION_KEY = 'pang-daily.social-session.v1';
export type SocialStoragePort = Pick<Storage, 'getItem' | 'setItem'> & { executeSocial?: (intent: PersistentIntent) => Promise<PersistentReceipt> };

/** A single write contains the new state and its consumed-event ledger. */
export function loadSocialSession(storage: SocialStoragePort): SocialSession {
 const saved = storage.getItem(SOCIAL_SESSION_KEY);
 return new SocialSession(SOCIAL_CONTENT, saved ? JSON.parse(saved) as unknown : undefined, next => { if (storage.executeSocial) throw new Error('Social changes require a server command.'); storage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(next)); });
}

export function recordDialogueIntroduction(dialogueId: string, storage: SocialStoragePort): boolean {
 const npc = SOCIAL_CONTENT.npcs.find((entry) => entry.dialogueEntryId === dialogueId);
 if (!npc) return false;
 loadSocialSession(storage).applyEvent({ type: 'dialogue', eventId: `dialogue:${npc.id}:${dialogueId}`, sourceId: dialogueId, npcId: npc.id, dialogueId });
 return true;
}

export function recordDialogueChoice(dialogueId: string, choiceId: 'promise_help' | 'apologize' | 'congratulate_casey' | 'insult_casey', storage: SocialStoragePort): boolean {
 const npc = SOCIAL_CONTENT.npcs.find((entry) => entry.dialogueEntryId === dialogueId);
 if (!npc) return false;
 loadSocialSession(storage).applyEvent({ type: 'dialogue', eventId: `choice:${npc.id}:${choiceId}`, sourceId: `${dialogueId}:${choiceId}`, npcId: npc.id, dialogueId, choiceId });
 return true;
}
