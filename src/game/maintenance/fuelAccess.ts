import { areaContains, type Interactable } from '../interaction/Interaction';
import type { TalyerVisit } from './talyerAccess';

/** Use the authored pump areas for both prompts and payment validation. */
export function fuelRejection(visit: TalyerVisit, pumps: readonly Interactable[]): string | null {
  if (visit.racing) return 'Finish or cancel the race before refueling.';
  if (visit.mode !== 'walking') return 'Park beside a pump and get out to refuel.';
  const { player, car } = visit;
  const pump = pumps.find(p => p.action === 'refuel' && areaContains(p.area, player.x, player.z));
  if (!pump || Math.abs(player.y) > 2) return 'Stand beside a fuel pump to refuel.';
  if (Math.abs(car.y) > 2 || Math.hypot(player.x - car.x, player.z - car.z) > 7
    || car.x < -5 || car.x > 44 || car.z < 7 || car.z > 43) return 'Park your car beside this pump first.';
  if (Math.abs(visit.speedKmh) > 1) return 'Wait for the car to stop before refueling.';
  return null;
}
