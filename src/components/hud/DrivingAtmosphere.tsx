"use client";

import { HUB_LAYOUT } from '@/game/world/hub/hubLayout';
import { ROAD } from '@/game/world/mountain/route';
import { useGameUiStore } from '@/state/gameUiStore';
import { useHudStore } from '@/state/hudStore';
import { minimapView } from './drivingEffects';

const hubBounds = { minX: -160, maxX: 250, minZ: -70, maxZ: 210 };
const mountainBounds = { minX: 200, maxX: 3350, minZ: -100, maxZ: 4450 };
const hubRoads = HUB_LAYOUT.chunks.flatMap(chunk => chunk.roads);
const mountainPoints = ROAD.filter((_, index) => index % 12 === 0 || index === ROAD.length - 1);

/** World position stays in the existing 10 Hz HUD summary; this layer never polls physics. */
export function DrivingAtmosphere() {
  const vehicle = useHudStore(state => state.vehicle);
  const mode = useHudStore(state => state.playerMode);
  const scene = useGameUiStore(state => state.activeScene);
  const paused = useGameUiStore(state => state.paused);
  if (mode !== 'driving' || !vehicle || paused) return null;

  // The mountain and neighborhood share the hub scene; the route begins past its east edge.
  const mountain = scene === 'hub' && vehicle.x !== undefined && vehicle.x > 245;
  const bounds = mountain ? mountainBounds : hubBounds;
  const size = mountain ? 900 : 125;
  const pose = vehicle.x !== undefined && vehicle.z !== undefined && vehicle.headingRad !== undefined
    ? { x: vehicle.x, z: vehicle.z, headingRad: vehicle.headingRad }
    : null;
  const view = scene === 'hub' && pose ? minimapView(pose, bounds, size) : null;
  const point = (x: number, z: number) => `${x - bounds.minX},${bounds.maxZ - z}`;

  return <>
    {view && <aside className="driving-minimap" aria-label={`${mountain ? 'Mountain' : 'Neighborhood'} minimap`}>
      <div className="driving-minimap-head"><span>ROUTE / {mountain ? 'UPLAND' : 'ILOILO'}</span><span>● LIVE</span></div>
      <svg viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Roads and current vehicle position">
        <rect x={view.x} y={view.y} width={view.size} height={view.size} fill="#0a1a19" />
        <g stroke="#36545a" strokeWidth={mountain ? 3 : .55} opacity=".55">
          {Array.from({ length: 8 }, (_, index) => <g key={index}><line x1={view.x + index * view.size / 7} x2={view.x + index * view.size / 7} y1={view.y} y2={view.y + view.size} /><line x1={view.x} x2={view.x + view.size} y1={view.y + index * view.size / 7} y2={view.y + index * view.size / 7} /></g>)}
        </g>
        {mountain
          ? <polyline points={mountainPoints.map(p => point(p.x, p.z)).join(' ')} fill="none" stroke="#e6d6a0" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
          : hubRoads.map((road, index) => <polyline key={`${road.id}-${index}`} points={road.points.map(p => point(p.x, p.z)).join(' ')} fill="none" stroke="#e6d6a0" strokeWidth={road.id === 'main_road' ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" />)}
        <g transform={`translate(${pose!.x - bounds.minX} ${bounds.maxZ - pose!.z}) rotate(${pose!.headingRad * 180 / Math.PI})`}>
          <circle r={mountain ? 38 : 6} fill="#f6f1d9" opacity=".3" />
          <path d={mountain ? 'M 0 -29 L 18 19 L 0 11 L -18 19 Z' : 'M 0 -4.8 L 3 3 L 0 1.8 L -3 3 Z'} fill="#f4a974" stroke="#101715" strokeWidth={mountain ? 5 : .8} />
        </g>
      </svg>
      <div className="driving-minimap-foot"><span>N ↑</span><span>{mountain ? 'MOUNTAIN ROAD' : 'NEIGHBORHOOD'}</span></div>
    </aside>}
  </>;
}
