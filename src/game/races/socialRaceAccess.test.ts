import { raceValidation } from '../../../tests/fixtures/raceValidation';
import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameBridge } from '../bridge/GameBridge';
import { RaceSystem } from './RaceSystem';
import { LOCAL_ROUTE } from './localRoute';
import { SocialOpportunityService } from '../social/SocialOpportunityService';
import { loadSocialSession } from '../social/socialStorage';
import { BANWA_DALAGAN_1996 as car } from '@/game-core/vehicles';
import type { PlayerVehicle } from '../vehicles/PlayerVehicle';
import type { PlayerModes } from '../player/PlayerModes';
import type { DriverControls } from '../input/DriverControls';
import { InteractionSystem } from '../interaction/InteractionSystem';

it.each(['the_wall', 'midnight_run'])('rechecks %s access through command and world interaction before placing the car', raceId => {
 const engine = new NullEngine(); const scene = new Scene(engine); const bridge = new GameBridge();
 const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
 const opportunities = new SocialOpportunityService(bridge.runtime, storage);
 const route = { ...LOCAL_ROUTE, id: raceId };
 const player = { definition: { spec: car }, placeAt: vi.fn(() => true) } as unknown as PlayerVehicle;
 const modes = { position: new Vector3(route.start.x, route.start.y, route.start.z), mode: 'driving' } as PlayerModes;
 const controls = { enabled: true } as DriverControls;
 const race = new RaceSystem(scene, bridge.runtime, player, controls, modes, [route], { access: opportunities.raceRejection });
 const interactions = new InteractionSystem(bridge.runtime, modes, [race.interactions]); race.connect(interactions);
 const rejected: string[] = []; bridge.ui.events.on('commandRejected', event => rejected.push(event.reason));
 bridge.ui.commands.startRace(raceId);
 expect(rejected[0]).toContain('Race invitation unavailable');
 expect(interactions.trigger()).toHaveProperty('rejected');
 expect(player.placeAt).not.toHaveBeenCalled();
 const social = loadSocialSession(storage);
 social.applyEvent({ type: 'dialogue', eventId: 'intro', sourceId: 'casey_intro', npcId: 'casey', dialogueId: 'casey_intro' });
 for (let i = 0; i < 3; i++) social.applyEvent({ validation: raceValidation('kyo_block_lap'), type: 'race', eventId: `income${i}`, sourceId: `income${i}`, attemptId: `income${i}`, raceId: 'kyo_block_lap', position: 2, racers: 2, timeMs: 100000 });
 if (raceId === 'midnight_run') {
  social.applyEvent({ validation: raceValidation('pahuway_descent'), type: 'race', eventId: 'crew-race', sourceId: 'crew-race', attemptId: 'crew-race', npcId: 'casey', raceId: 'pahuway_descent', position: 1, racers: 2, timeMs: 100000 });
  social.chooseConversation('casey_intro', 'casey_post_race', 'congratulate_casey');
  social.chooseConversation('casey_intro', 'kyo_crew', 'crew_invite');
  social.chooseConversation('casey_intro', 'kyo_crew', 'crew_accept');
 }
 opportunities.update(1);
 expect(interactions.trigger()).toBeUndefined();
 expect(race.active).toBe(true);
 expect(player.placeAt).toHaveBeenCalledOnce();
 bridge.ui.commands.resetRace(); bridge.ui.commands.startRace(raceId);
 expect(race.active).toBe(true); expect(player.placeAt).toHaveBeenCalledTimes(2);
 if (raceId === 'midnight_run') {
  bridge.ui.commands.resetRace();
  loadSocialSession(storage).chooseConversation('casey_intro', 'kyo_crew', 'crew_leave');
  bridge.ui.commands.startRace(raceId);
  expect(race.active).toBe(false);
  expect(interactions.trigger()).toHaveProperty('rejected');
  expect(player.placeAt).toHaveBeenCalledTimes(2);
 }
 race.dispose(); interactions.dispose(); bridge.dispose(); scene.dispose(); engine.dispose();
});
