import { CORNER_NAMES, type TireSession } from './TireSession';
import type { CornerId } from './corners';

/**
 * Roadside wheel change, one physical step at a time:
 * loosen nuts on the ground → jack the corner → remove the wheel → stow it / take the spare →
 * mount → lower → tighten. Every step checks its preconditions and says what's missing.
 */
export type WheelChangeStep = 'loosen' | 'raise' | 'remove' | 'install' | 'lower' | 'tighten' | 'take_spare' | 'stow';
export type ServiceContext = { speedKmh: number; engineRunning?: boolean; /** Surface is too soft for the jack. */ softGround?: boolean };
export type StepOutcome = { rejected: string } | void;

const STEP_LABELS: Record<WheelChangeStep, string> = {
  loosen: 'Loosen lug nuts', raise: 'Jack up', remove: 'Remove wheel', install: 'Mount wheel',
  lower: 'Lower jack', tighten: 'Tighten lug nuts', take_spare: 'Take out spare', stow: 'Stow wheel in trunk',
};

export function performStep(tires: TireSession, vehicleId: string, step: WheelChangeStep, corner: CornerId | null, ctx: ServiceContext): StepOutcome {
  const car = tires.vehicle(vehicleId);
  if (ctx.speedKmh > 1) return { rejected: 'Stop the car first' };
  const name = corner ? CORNER_NAMES[corner] : '';
  switch (step) {
    case 'loosen':
      if (!corner) return { rejected: 'Pick a wheel' };
      if (!car.wrench) return { rejected: 'You need a lug wrench' };
      if (!car.corners[corner]) return { rejected: `There's no wheel on the ${name} hub` };
      if (car.jacked === corner) return { rejected: 'Loosen the nuts before jacking, or the wheel just spins' };
      if (car.loosened.includes(corner)) return { rejected: 'Already loose' };
      tires.mutate(vehicleId, c => { c.loosened.push(corner); });
      return;
    case 'raise':
      if (!corner) return { rejected: 'Pick a corner' };
      if (!car.jack) return { rejected: 'You need a jack' };
      if (car.jacked) return { rejected: `The jack is already under the ${CORNER_NAMES[car.jacked]}` };
      if (ctx.softGround) return { rejected: 'The jack sinks here. Move to firmer ground' };
      tires.mutate(vehicleId, c => { c.jacked = corner; });
      return;
    case 'remove':
      if (!corner) return { rejected: 'Pick a wheel' };
      if (!car.corners[corner]) return { rejected: `There's no wheel on the ${name} hub` };
      if (car.jacked !== corner) return { rejected: `Jack up the ${name} corner first` };
      if (!car.loosened.includes(corner)) return { rejected: 'Loosen the lug nuts first' };
      if (car.held) return { rejected: 'Your hands are full' };
      tires.mutate(vehicleId, c => { c.held = c.corners[corner]; c.corners[corner] = null; });
      return;
    case 'install':
      if (!corner) return { rejected: 'Pick a hub' };
      if (car.corners[corner]) return { rejected: `The ${name} hub already has a wheel` };
      if (!car.held) return { rejected: 'Take a wheel out first' };
      if (car.jacked !== corner) return { rejected: `Jack up the ${name} corner first` };
      tires.mutate(vehicleId, c => { c.corners[corner] = c.held; c.held = null; });
      return;
    case 'lower':
      if (!car.jacked) return { rejected: 'The car is not on the jack' };
      if (!car.corners[car.jacked]) return { rejected: 'Mount a wheel before lowering' };
      tires.mutate(vehicleId, c => { c.jacked = null; });
      return;
    case 'tighten':
      if (!corner) return { rejected: 'Pick a wheel' };
      if (!car.wrench) return { rejected: 'You need a lug wrench' };
      if (!car.loosened.includes(corner)) return { rejected: 'Those nuts are already tight' };
      if (!car.corners[corner]) return { rejected: `There's no wheel on the ${name} hub` };
      if (car.jacked === corner) return { rejected: 'Lower the car first, or the wheel just spins' };
      tires.mutate(vehicleId, c => { c.loosened = c.loosened.filter(x => x !== corner); });
      return;
    case 'take_spare':
      if (car.held) return { rejected: 'Your hands are full' };
      if (!car.spare && !car.trunk.length) return { rejected: 'No spare in the trunk' };
      tires.mutate(vehicleId, c => {
        if (c.spare) { c.held = c.spare; c.spare = null; } else { c.held = c.trunk.shift() ?? null; }
      });
      return;
    case 'stow':
      if (!car.held) return { rejected: 'Nothing to stow' };
      tires.mutate(vehicleId, c => {
        if (!c.spare) c.spare = c.held; else c.trunk.push(c.held!);
        c.held = null;
      });
      return;
  }
}

/** The one step that makes sense next at a corner, for a single contextual prompt. */
export function nextCornerStep(tires: TireSession, vehicleId: string, corner: CornerId): WheelChangeStep | null {
  const car = tires.vehicle(vehicleId);
  const mounted = car.corners[corner];
  if (car.jacked === corner) {
    // A bad wheel comes off; a good one (just mounted) goes back down.
    if (mounted) return needsChange(tires, vehicleId, corner) && !car.held ? 'remove' : 'lower';
    return car.held ? 'install' : null;
  }
  if (car.loosened.includes(corner)) return mounted && !car.jacked ? (needsChange(tires, vehicleId, corner) || car.held ? 'raise' : 'tighten') : null;
  if (!car.jacked && mounted && needsChange(tires, vehicleId, corner)) return 'loosen';
  return null;
}

/** A corner worth changing: flat, leaking, or holding something that isn't a road tire. */
function needsChange(tires: TireSession, vehicleId: string, corner: CornerId) {
  const tire = tires.mounted(vehicleId, corner);
  return !!tire && tire.failure !== 'HEALTHY';
}

export function stepLabel(step: WheelChangeStep, corner: CornerId | null) {
  return corner ? `${STEP_LABELS[step]} (${CORNER_NAMES[corner]})` : STEP_LABELS[step];
}
