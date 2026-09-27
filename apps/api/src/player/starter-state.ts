import { BANWA_DALAGAN_1996 } from '@pang-daily/game-core/vehicles/catalog';
import { centavos, FUEL_CAPACITY_LITERS } from '@pang-daily/game-core/economy/economy';
import { STARTING_WALLET_PHP } from '@pang-daily/game-core/maintenance/VehicleSession';
import { SOCIAL_CONTENT } from '@pang-daily/game-core/social/catalog';
import { FIRST_RIVAL } from '@pang-daily/game-core/social/rivalHistory';
import { CONTENT_VERSION, SAVE_VERSION } from '@pang-daily/contracts';

export function starterState(username: string) {
  const car = BANWA_DALAGAN_1996;
  return { displayName: username, saveVersion: SAVE_VERSION as typeof SAVE_VERSION, contentVersion: CONTENT_VERSION as typeof CONTENT_VERSION,
    startingCentavos: BigInt(centavos(STARTING_WALLET_PHP)), vehicle: { definitionId: car.id,
      paint: car.visual.defaultPaint, rideHeightM: car.visual.rideHeight.defaultM, condition: car.condition.typical, fuelLiters: FUEL_CAPACITY_LITERS },
    npcIds: SOCIAL_CONTENT.npcs.map(npc => npc.id), sceneIds: SOCIAL_CONTENT.scenes.map(scene => scene.id),
    rival: { npcId: FIRST_RIVAL.npcId, vehicleContentId: FIRST_RIVAL.vehicleId },
    crewIds: SOCIAL_CONTENT.crews.map(crew => crew.id), hubId: 'iloilo_scene', chapterId: 'chapter_1' };
}
export type StarterState = ReturnType<typeof starterState>;
