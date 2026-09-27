import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { expect, it } from 'vitest';
import { GameBridge } from '../bridge/GameBridge';
import { SocialOpportunityService } from './SocialOpportunityService';
import { loadSocialSession, SOCIAL_SESSION_KEY } from './socialStorage';

it('publishes persisted discovery once, rechecks race access, and retains discovered access after reload/loss', () => {
 const values = new Map<string, string>();
 const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
 const bridge = new GameBridge(); const notices: string[] = [];
 const service = new SocialOpportunityService(bridge.runtime, storage);
 bridge.ui.events.on('socialOpportunityDiscovered', notice => {
  expect(loadSocialSession(storage).snapshot().unlocks[notice.id].unlocked).toBe(true);
  notices.push(notice.id);
 });
 expect(service.raceRejection('the_wall')).toContain('Meet Casey');
 expect(service.raceRejection('kyo_block_lap')).toBeNull();
 const social = loadSocialSession(storage);
 social.applyEvent({ type: 'dialogue', eventId: 'intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
 for (let i = 0; i < 3; i++) social.applyEvent({ validation: raceValidation('kyo_block_lap'), type: 'race', eventId: `finish${i}`, sourceId: `finish${i}`, attemptId: `finish${i}`, raceId: 'kyo_block_lap', position: 2, racers: 2, timeMs: 100000 });
 service.update(1); service.update(1);
 expect(notices).toEqual(['casey_wall_invitation']);
 const lost = loadSocialSession(storage).snapshot(); lost.reputation.iloilo_scene.points = 0;
 storage.setItem(SOCIAL_SESSION_KEY, JSON.stringify(lost));
 const restored = new SocialOpportunityService(bridge.runtime, storage);
 restored.update(1);
 expect(notices).toHaveLength(1);
 expect(restored.raceRejection('the_wall')).toBeNull();
 bridge.dispose();
});


it('publishes only changed public views at low frequency and does not replay changes after reload', () => {
 const values = new Map<string, string>();
 const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
 const bridge = new GameBridge();
 const service = new SocialOpportunityService(bridge.runtime, storage);
 const views: unknown[] = [], changes: unknown[] = [];
 bridge.ui.events.on('socialViewChanged', view => views.push(view));
 bridge.ui.events.on('socialChangesApplied', notice => changes.push(notice));
 for (let i = 0; i < 9; i++) service.update(0.1);
 expect(views).toHaveLength(0);
 service.update(1); service.update(1);
 expect(views).toHaveLength(1);
 const session = loadSocialSession(storage);
 session.applyEvent({ type: 'dialogue', eventId: 'dialogue:casey:casey_intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
 service.update(1); service.update(1);
 expect(views).toHaveLength(2); expect(changes).toHaveLength(1);
 const restored = new SocialOpportunityService(bridge.runtime, storage);
 restored.update(1);
 expect(changes).toHaveLength(1);
 bridge.dispose();
});

it('authenticated threshold feedback reads server snapshots without locally discovering unlocks', async () => {
 const { createSocialState } = await import('@/game-core/social/SocialSession');
 const { SOCIAL_CONTENT } = await import('@/game-core/social/catalog');
 let state = createSocialState(SOCIAL_CONTENT);
 const storage = { getItem: () => JSON.stringify(state), setItem: () => { throw new Error('Local write'); }, executeSocial: async () => { throw new Error('Discovery should not issue commands'); } };
 const bridge = new GameBridge(), service = new SocialOpportunityService(bridge.runtime, storage), tiers: unknown[] = [], discoveries: string[] = [];
 bridge.ui.events.on('socialTierChanged', value => tiers.push(value));
 bridge.ui.events.on('socialOpportunityDiscovered', value => discoveries.push(value.id));
 state = structuredClone(state); state.npcs.casey.introduced = true; state.npcs.casey.eventIds = ['met_casey_at_kyo']; state.reputation.iloilo_scene = { sceneId: 'iloilo_scene', points: 12 };
 service.update(1);
 expect(tiers).toEqual([{ sceneId: 'iloilo_scene', from: 'Unknown', to: 'Regular', points: 12 }]);
 expect(discoveries).toEqual([]); expect(state.unlocks).toEqual({});
 state.unlocks.casey_wall_invitation = { unlockId: 'casey_wall_invitation', unlocked: true };
 service.update(1); service.update(1); expect(discoveries).toEqual(['casey_wall_invitation']); expect(tiers).toHaveLength(1);
 bridge.dispose();
});
