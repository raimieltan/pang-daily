import type { VehicleDefinition } from '../vehicles/VehicleDefinition';
import type { SuspensionBaseline } from './schema';
/** Authored car differences; shared by garage/account initialization. */
export function vehicleSuspensionBaseline(car: VehicleDefinition): SuspensionBaseline {
  const rwd = car.id === 'banwa_silak_1983';
  return { mass: car.weight.curbKg, frontWeight: car.weight.frontWeightRatio, wheelbase: car.dimensions.wheelbaseM, track: car.dimensions.trackM,
    radius: car.dimensions.wheelRadiusM, cgHeight: rwd ? .5 : .52, frontSpring: rwd ? 21000 : car.weight.curbKg * 25,
    rearSpring: rwd ? 17000 : car.weight.curbKg * 20, frontARB: rwd ? 7000 : 8500, rearARB: rwd ? 3000 : 4500, damping: rwd ? .55 : .75,
    camber: (rwd ? -.5 : -1) * Math.PI / 180, toe: .05 * Math.PI / 180, caster: (rwd ? 4 : 6) * Math.PI / 180, maxLock: (rwd ? 34 : 32) * Math.PI / 180 };
}
