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
