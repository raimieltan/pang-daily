import { VehicleSession } from '../../game-core/maintenance/VehicleSession';
export const VEHICLE_SESSION_KEY = 'pang-daily.vehicle-session.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
/** sessionStorage survives refresh in this tab, without introducing an account/save system. */
export function loadVehicleSession(storage?: StoragePort): VehicleSession {
  let saved: unknown;
  try { saved = JSON.parse(storage?.getItem(VEHICLE_SESSION_KEY) ?? 'null'); } catch { /* Start a clean session if storage is corrupt/unavailable. */ }
  return new VehicleSession(saved, snapshot => storage?.setItem(VEHICLE_SESSION_KEY, JSON.stringify(snapshot)));
}
