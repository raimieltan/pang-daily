import { MOUNTAIN_HOMES } from './mountain/environment';
import { OVERLOOK, OVERLOOK_S, roadAt } from './mountain/route';

export type ResidentActivity = 'chat' | 'coffee' | 'sit' | 'work' | 'fuel' | 'basketball' | 'watch' | 'walk';
export type Resident = {
  id: string; area: string; x: number; y?: number; z: number; heading: number;
  activity: ResidentActivity; shirt: string; voice: number;
  to?: { x: number; z: number; y?: number };
};
export type ParkedCarPlacement = { x: number; y?: number; z: number; heading: number; paint: string };

const people: Resident[] = [];
const shirts = ['#718594', '#bc8460', '#8a9873', '#a79d84', '#936b78', '#b6ad94'];
function resident(area: string, x: number, z: number, heading: number, activity: ResidentActivity,
  extra: Partial<Pick<Resident, 'y' | 'shirt' | 'to' | 'voice'>> = {}) {
  const i = people.length;
  people.push({ id: `${area}-${i}`, area, x, z, heading, activity, shirt: shirts[i % shirts.length], voice: i % 3, ...extra });
}

// Attendants at occupied outer pumps; the middle lane and the spawn at (25,24) stay open.
resident('gas_station', 12.5, 19, 270, 'fuel', { shirt: '#ad4c3e' });
resident('gas_station', 37.5, 29, 90, 'fuel', { shirt: '#ad4c3e' });
resident('gas_station', 50, 33.2, 180, 'chat');
resident('gas_station', 49.4, 32, 20, 'chat');
resident('gas_station', 55.5, 14, 250, 'sit');
resident('gas_station', 54.2, 12.6, 300, 'sit');

// Mechanics around the second bay, plus customers in the existing waiting chairs.
resident('talyer', 30.5, 157.6, 90, 'work', { shirt: '#4c6070', voice: 2 });
resident('talyer', 14.3, 165.8, 0, 'work', { shirt: '#626951' });
resident('talyer', 21, 153.4, 210, 'chat', { voice: 2 });
resident('talyer', 43, 155, 210, 'sit');
resident('talyer', 45, 155.5, 160, 'sit');
resident('talyer', 46.5, 154.2, 300, 'coffee');

// Half-court practice, a defender, friends on the sideline and seated spectators.
resident('basketball_court', 9, 99, 270, 'basketball', { shirt: '#be613f' });
resident('basketball_court', 6.6, 100, 90, 'watch', { shirt: '#4e7c9c' });
resident('basketball_court', 20.5, 102, 90, 'basketball', { shirt: '#bda969' });
resident('basketball_court', 23, 100, 270, 'watch', { shirt: '#727e61' });
resident('basketball_court', 4, 110, 180, 'sit');
resident('basketball_court', 5.2, 110.4, 170, 'sit');
resident('basketball_court', 18, 109.5, 180, 'watch');

resident('streets', -61, -16.5, 100, 'chat');
resident('streets', -59.5, -16.8, 280, 'chat');
resident('streets', 80, -16.5, 90, 'walk', { to: { x: 88, z: -16.5 } });
resident('streets', 147, -15.5, 0, 'coffee');
resident('streets', 110, -16, 90, 'walk', { to: { x: 116, z: -16 } });
resident('streets', -113, 152.7, 100, 'chat');
resident('streets', -111.5, 152.2, 280, 'chat');
resident('streets', 50, 118.5, 90, 'walk', { to: { x: 58, z: 118.5 } });
resident('streets', -72, 19.5, 90, 'walk', { to: { x: -64, z: 19.5 } });
resident('streets', -41, 11.5, 180, 'sit');
resident('streets', 20, -15, 90, 'sit');
resident('streets', 22, -16, 270, 'sit');

function overlook(ds: number, offset: number, heading: number, activity: ResidentActivity) {
  const p = roadAt(OVERLOOK_S + ds, offset);
  resident('overlook', p.x, p.z, p.heading * 180 / Math.PI + heading, activity, { y: OVERLOOK.y });
}
overlook(-4.8, 20, 0, 'sit');
overlook(-7.2, 20, 180, 'sit');
overlook(1.2, 24, 0, 'sit');
overlook(-1.2, 24, 180, 'sit');
overlook(5, 26, 90, 'watch');
overlook(7, 26, 90, 'coffee');
overlook(-10, 15, 220, 'chat');
overlook(-11.3, 14, 40, 'chat');
overlook(10, 19.5, 270, 'chat');

// Place neighbours on the same flat, rotated apron as their house, not at road elevation.
for (const [i, home] of MOUNTAIN_HOMES.entries()) {
  const point = (across: number, along: number) => ({
    x: home.x + Math.cos(home.heading) * across + Math.sin(home.heading) * along,
    z: home.z - Math.sin(home.heading) * across + Math.cos(home.heading) * along,
    y: home.y,
  });
  const at = point(home.side * .8, -1.25);
  resident('mountain_homes', at.x, at.z, home.heading * 180 / Math.PI, i % 3 === 0 ? 'coffee' : 'chat', { y: at.y });
  if (i % 2 === 0) {
    const other = point(home.side * .8, .5);
    resident('mountain_homes', other.x, other.z, home.heading * 180 / Math.PI + 180, 'chat', { y: other.y });
  }
}

export const RESIDENTS: readonly Resident[] = people;

const overlookCar = (ds: number, offset: number, paint: string): ParkedCarPlacement => {
  const p = roadAt(OVERLOOK_S + ds, offset);
  return { x: p.x, y: OVERLOOK.y, z: p.z, heading: p.heading * 180 / Math.PI + 90, paint };
};
export const NEIGHBORHOOD_CARS: readonly ParkedCarPlacement[] = [
  { x: 10.5, z: 19, heading: 0, paint: '#b9b7a7' },
  { x: 39.8, z: 26, heading: 0, paint: '#57717e' },
  { x: 32, z: 158, heading: 180, paint: '#96634c' },
  { x: 33, z: 147.5, heading: 90, paint: '#758474' },
  { x: -78.5, z: 12.5, heading: 0, paint: '#9f6659' },
  { x: -59.5, z: 12.5, heading: 0, paint: '#b4b7ae' },
  { x: 83, z: -14, heading: 90, paint: '#76828b' },
  { x: 151, z: -14, heading: 90, paint: '#a3916c' },
  overlookCar(-18, 8, '#9aa18a'),
  overlookCar(18, 12, '#7a8d96'),
];
