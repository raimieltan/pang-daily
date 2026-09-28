import { describe, expect, it } from 'vitest';
import { SOCIAL_CONTENT, validateSocialContent } from './catalog';
import { SocialSession, restoreSocialState } from './SocialSession';
import { HUB_LAYOUT } from '@/game/world/hub/hubLayout';
import { HUB_JOBS } from '@/game/jobs/hubJobs';
import { DIALOGUE_ENTRIES } from './dialogue';
import { SELLERS } from '@/game-core/marketplace/sellers';

describe('social content and state', () => {
 it('reuses the mechanic, rival, and seller identities with real references', () => {
  expect(SOCIAL_CONTENT.npcs.find((npc) => npc.id === 'mang_boy')).toMatchObject({ name: 'Tito Jun', roles: ['mechanic', 'mentor'], homeInteractionId: 'talyer_bay_1', dialogueEntryId: 'talyer_mang_boy' });
  expect(SOCIAL_CONTENT.npcs.find((npc) => npc.id === 'casey')).toMatchObject({ name: 'Casey', roles: ['rival'], vehicleBuildId: 'casey_kidlat_rs' });
  expect(validateSocialContent(SOCIAL_CONTENT)).toEqual([]);
  const zones = HUB_LAYOUT.chunks.flatMap((chunk) => chunk.zones);
  for (const npc of SOCIAL_CONTENT.npcs) {
   expect(DIALOGUE_ENTRIES[npc.dialogueEntryId]).toBeDefined();
   if (npc.homeLocationId === 'marketplace') {
    expect(SELLERS.some((seller) => `marketplace:seller:${seller.id}` === npc.homeInteractionId)).toBe(true);
   } else {
    expect(HUB_LAYOUT.locations.some((location) => location.id === npc.homeLocationId)).toBe(true);
    expect(zones.some((zone) => zone.id === npc.homeInteractionId && zone.locationId === npc.homeLocationId && (zone.interaction?.dialogueId === npc.dialogueEntryId || (['sean', 'michael'].includes(npc.id) && zone.interaction?.dialogueId === 'kyo_order')))).toBe(true);
   }
  }
  for (const favor of SOCIAL_CONTENT.favors) expect(HUB_JOBS.some((job) => job.id === favor.jobId)).toBe(true);
 });

 it('rejects duplicate IDs and broken references', () => {
  const broken = { ...SOCIAL_CONTENT, npcs: [...SOCIAL_CONTENT.npcs, { ...SOCIAL_CONTENT.npcs[0], homeInteractionId: 'missing_interaction', dialogueEntryId: 'missing_dialogue', crewId: 'missing_crew' }] };
  expect(validateSocialContent(broken)).toEqual(expect.arrayContaining([
   expect.stringContaining('duplicate or empty NPC'),
   expect.stringContaining('missing_interaction'),
   expect.stringContaining('missing_dialogue'),
   expect.stringContaining('missing_crew'),
  ]));
 });

 it('keeps trust and respect separate, and rivalry independent of hostility', () => {
  const original = new SocialSession(SOCIAL_CONTENT).snapshot();
  original.npcs.casey.trust = 10;
  original.npcs.casey.respect = 80;
  original.npcs.casey.relationshipFlags = ['rival'];
  const session = new SocialSession(SOCIAL_CONTENT, original);
  expect(session.snapshot().npcs.casey).toMatchObject({ trust: 10, respect: 80, relationshipFlags: ['rival'] });
  expect(session.relationships('casey')).toEqual({ friend: false, hostile: false, mentor: false });
 });

 it('restores valid records and rejects unknown saved identities', () => {
  const state = new SocialSession(SOCIAL_CONTENT).snapshot();
  expect(state.npcs.mang_boy).toMatchObject({ introduced: false, trust: 50, respect: 50, favorIds: [], eventIds: [] });
  expect(restoreSocialState(state, SOCIAL_CONTENT)).toEqual(state);
  expect(() => restoreSocialState({ ...state, npcs: { ghost: state.npcs.mang_boy } }, SOCIAL_CONTENT)).toThrow('unknown NPC');
 });
});
