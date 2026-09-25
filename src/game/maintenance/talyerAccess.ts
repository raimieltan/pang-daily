import type { PlayerMode } from '../player/PlayerMode';
type Position = { x: number; y: number; z: number };
export type TalyerVisit = { mode: PlayerMode; player: Position; car: Position; speedKmh: number; racing: boolean };
/** Service bays + front apron. The adjacent road and waiting area are not a service bay. */
export function talyerRejection(visit: TalyerVisit): string | null {
  if (visit.racing) return 'Finish or cancel the race before visiting the talyer.';
  if (visit.mode !== 'walking') return 'Park at the talyer and get out to talk to Mang Boy.';
  const { player, car } = visit;
  if (player.x < 8.5 || player.x > 39.5 || player.z < 151 || player.z > 167.5 || Math.abs(player.y) > 2)
    return 'Talk to Mang Boy inside a talyer service bay.';
  if (car.x < 5 || car.x > 40 || car.z < 145 || car.z > 168 || Math.abs(car.y) > 2 || Math.hypot(player.x - car.x, player.z - car.z) > 18)
    return 'Bring your car onto the talyer apron or into a service bay first.';
  if (visit.speedKmh > 1) return 'Let the car come to a stop before inspection or repair.';
  return null;
}
