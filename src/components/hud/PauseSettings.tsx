"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SceneId } from "@/game";
import { HUB_LAYOUT } from "@/game/world/hub/hubLayout";
import { ROAD } from "@/game/world/mountain/route";
import { raceLineEnabled, setRaceLineEnabled, subscribeRaceLine } from "@/game/races/raceLineSettings";
import { setTrafficEnabled, subscribeTraffic, trafficEnabled } from "@/game/traffic/trafficSettings";
import { useGameUiStore } from "@/state/gameUiStore";
import { useMaintenanceStore } from "@/state/maintenanceStore";
import { GraphicsDebugPanel } from "./GraphicsDebugPanel";
import { HandlingDebugPanel } from "./HandlingDebugPanel";
import { AudioPanel } from "./AudioPanel";

type Tab = "map" | "graphics" | "audio" | "gameplay" | "development";
const tabs: { id: Tab; label: string }[] = [
  { id: "map", label: "Map" }, { id: "graphics", label: "Graphics" },
  { id: "audio", label: "Audio" }, { id: "gameplay", label: "Gameplay" },
  { id: "development", label: "Development" },
];
const scenes: { id: SceneId; label: string }[] = [
  { id: "hub", label: "Neighborhood" }, { id: "driving", label: "Handling track" }, { id: "debug", label: "Bridge demo" },
];

export function PauseSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("map");
  const commands = useGameUiStore(s => s.commands);
  const activeScene = useGameUiStore(s => s.activeScene);
  const fps = useGameUiStore(s => s.fps);
  const walletPhp = useMaintenanceStore(s => s.summary?.walletPhp);
  const showRaceLine = useSyncExternalStore(subscribeRaceLine, raceLineEnabled, () => false);
  const showTraffic = useSyncExternalStore(subscribeTraffic, trafficEnabled, () => true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <section className="pause-settings pointer-events-auto absolute inset-0 z-40 flex flex-col" aria-label="Game menu">
    <div className="pause-settings-head">
      <div><p className="tape-eyebrow">PANG DAILY / PAUSE MENU</p><h1>Night run</h1></div>
      <button type="button" className="pause-settings-close" onClick={onClose}>Back to game <span aria-hidden="true">↗</span></button>
    </div>
    <nav className="pause-settings-tabs" aria-label="Menu sections">
      {tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    <div className={`pause-settings-content ${tab === "map" ? "is-map" : ""}`} key={tab}>
      {tab === "map" && <MapPanel />}
      {tab === "graphics" && <div className="pause-settings-column"><p className="pause-settings-kicker">DISPLAY & SIGNAL</p><h2>Graphics</h2><p>Set the look of the road. Changes apply immediately.</p><GraphicsDebugPanel /></div>}
      {tab === "audio" && <div className="pause-settings-column"><p className="pause-settings-kicker">FM STEREO</p><h2>Audio</h2><p>Mix the radio, the street, and the car.</p><AudioPanel /></div>}
      {tab === "gameplay" && <div className="pause-settings-column"><p className="pause-settings-kicker">ON THE ROAD</p><h2>Gameplay</h2><p>Choose the driving aids and traffic you want.</p>
        <label className="pause-settings-option"><span><strong>Racing line and braking zones</strong><small>Green: drive · amber: lift · red: brake</small></span><input type="checkbox" checked={showRaceLine} onChange={e => setRaceLineEnabled(e.target.checked)} /></label>
        <label className="pause-settings-option"><span><strong>Moving traffic</strong><small>Show other cars on the road</small></span><input type="checkbox" checked={showTraffic} onChange={e => setTrafficEnabled(e.target.checked)} /></label>
      </div>}
      {tab === "development" && <div className="pause-settings-column"><p className="pause-settings-kicker">TOOLS / {fps} FPS</p><h2>Development</h2><p>Scene controls, vehicle tuning, and test actions.</p>
        {process.env.NODE_ENV === "development" && <div className="pause-settings-card"><h3>Economy</h3><div className="pause-settings-actions"><button onClick={() => commands?.devGrantCash()}>+₱50,000 dev cash</button>{walletPhp !== undefined && <span>Wallet: ₱{walletPhp.toLocaleString("en-PH")}</span>}</div></div>}
        <div className="pause-settings-card"><h3>Scenes</h3><div className="pause-settings-actions">{scenes.filter(s => s.id !== activeScene).map(s => <button key={s.id} onClick={() => commands?.switchScene(s.id)}>{s.label}</button>)}{activeScene && <button onClick={() => commands?.switchScene(activeScene)}>Reload scene</button>}</div></div>
        {activeScene === "debug" && <div className="pause-settings-card"><h3>Bridge demo</h3><div className="pause-settings-actions"><button onClick={() => commands?.spawnAt("coffee_shop")}>Spawn at coffee shop</button><button onClick={() => commands?.startRace("debug_sprint")}>Start race</button></div></div>}
        <HandlingDebugPanel />
      </div>}
    </div>
    <footer className="pause-settings-foot"><span>ILOILO, PH / VOL. 01</span><span>SELECT A SECTION · BACK TO GAME TO DRIVE</span></footer>
  </section>;
}

function MapPanel() {
  const [region, setRegion] = useState<"neighborhood" | "mountain">("neighborhood");
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number; scale: number } | null>(null);
  const locations = region === "neighborhood" ? HUB_LAYOUT.locations.filter(l => l.id !== "main_road") : [
    { id: "alimodian", name: "Alimodian outskirts" }, { id: "overlook", name: "Pahuway overlook" }, { id: "maasin", name: "Maasin arrival" },
  ];
  const [selected, setSelected] = useState<string>("home");
  const current = locations.find(l => l.id === selected) ?? locations[0];
  const hubRoads = HUB_LAYOUT.chunks.flatMap(c => c.roads);
  const map = region === "neighborhood" ? { minX: -160, maxX: 250, minZ: -70, maxZ: 210 } : { minX: 200, maxX: 3350, minZ: -100, maxZ: 4450 };
  const width = map.maxX - map.minX;
  const height = map.maxZ - map.minZ;
  const changeZoom = (target: number, anchor?: { x: number; y: number }) => {
    setView(previous => {
      const zoom = Math.max(1, Math.min(8, target));
      const oldWidth = width / previous.zoom;
      const oldHeight = height / previous.zoom;
      const newWidth = width / zoom;
      const newHeight = height / zoom;
      const focus = anchor ?? { x: previous.x + oldWidth / 2, y: previous.y + oldHeight / 2 };
      return {
        zoom,
        x: Math.max(0, Math.min(width - newWidth, focus.x - (focus.x - previous.x) * newWidth / oldWidth)),
        y: Math.max(0, Math.min(height - newHeight, focus.y - (focus.y - previous.y) * newHeight / oldHeight)),
      };
    });
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      const focus = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : undefined;
      changeZoom(view.zoom * (event.deltaY < 0 ? 1.25 : .8), focus);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });
  const switchRegion = (next: "neighborhood" | "mountain") => {
    setRegion(next);
    setView({ x: 0, y: 0, zoom: 1 });
    dragRef.current = null;
  };
  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (view.zoom === 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, scale: Math.min(rect.width / (width / view.zoom), rect.height / (height / view.zoom)) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const visibleWidth = width / view.zoom;
    const visibleHeight = height / view.zoom;
    setView(previous => ({ ...previous,
      x: Math.max(0, Math.min(width - visibleWidth, drag.viewX - (event.clientX - drag.x) / drag.scale)),
      y: Math.max(0, Math.min(height - visibleHeight, drag.viewY - (event.clientY - drag.y) / drag.scale)),
    }));
  };
  const point = (x: number, z: number) => `${x - map.minX},${map.maxZ - z}`;
  const roads = region === "neighborhood" ? hubRoads.map(r => ({ id: r.id, points: r.points })) : [{ id: "mountain", points: ROAD.filter((_, i) => i % 8 === 0 || i === ROAD.length - 1) }];
  const markers = region === "neighborhood" ? HUB_LAYOUT.locations.filter(l => l.id !== "main_road").map(l => ({ id: l.id, name: l.name, x: l.spawn.x, z: l.spawn.z })) : [
    { id: "alimodian", name: "Alimodian", x: ROAD[0].x, z: ROAD[0].z },
    { id: "overlook", name: "Pahuway overlook", x: ROAD[Math.floor(ROAD.length * .72)].x, z: ROAD[Math.floor(ROAD.length * .72)].z },
    { id: "maasin", name: "Maasin", x: ROAD[ROAD.length - 1].x, z: ROAD[ROAD.length - 1].z },
  ];
  return <div className="pause-map">
    <div className="pause-map-main"><div className="pause-map-top"><div><p className="pause-settings-kicker">ILOILO / ROUTE GUIDE</p><h2>Map</h2></div><div className="pause-map-switch"><button aria-pressed={region === "neighborhood"} onClick={() => switchRegion("neighborhood")}>Neighborhood</button><button aria-pressed={region === "mountain"} onClick={() => switchRegion("mountain")}>Mountain road</button></div></div>
      <div className="pause-map-canvas"><svg ref={svgRef} viewBox={`${view.x} ${view.y} ${width / view.zoom} ${height / view.zoom}`} role="img" aria-label={`${region === "neighborhood" ? "Neighborhood" : "Mountain road"} route map`} preserveAspectRatio="xMidYMid meet" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        {roads.map((r, i) => <polyline key={`${r.id}-${i}`} points={r.points.map(p => point(p.x, p.z)).join(" ")} fill="none" stroke="#b6ad98" strokeWidth={region === "neighborhood" ? r.id === "main_road" ? 12 : 8 : 42} strokeLinecap="round" strokeLinejoin="round" />)}
        {markers.map(l => <g key={l.id} onPointerDown={e => e.stopPropagation()} onClick={() => setSelected(l.id)} className="pause-map-marker" role="button" tabIndex={0} aria-label={l.name} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(l.id); } }}><circle cx={l.x - map.minX} cy={map.maxZ - l.z} r={region === "neighborhood" ? 7 : 45} fill={current.id === l.id ? "#f0c979" : "#e7e1d1"} stroke="#171c1a" strokeWidth={region === "neighborhood" ? 3 : 18} /></g>)}
      </svg><div className="pause-map-zoom" aria-label="Map zoom"><button type="button" aria-label="Zoom in" disabled={view.zoom >= 8} onClick={() => changeZoom(view.zoom * 1.5)}>+</button><span>{Math.round(view.zoom * 100)}%</span><button type="button" aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => changeZoom(view.zoom / 1.5)}>−</button><button type="button" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>Fit</button></div><span className="pause-map-north">N ↑</span><span className="pause-map-caption">SCROLL TO ZOOM · DRAG TO PAN</span></div>
    </div>
    <aside className="pause-map-side"><p className="pause-settings-kicker">PLACES / {String(locations.length).padStart(2, "0")}</p><div className="pause-map-list">{locations.map((l, i) => <button key={l.id} aria-pressed={current.id === l.id} onClick={() => setSelected(l.id)}><span>{String(i + 1).padStart(2, "0")}</span>{l.name}<span>↗</span></button>)}</div><div className="pause-map-selected"><small>SELECTED LOCATION</small><strong>{current.name}</strong><p>{region === "neighborhood" ? "A stop on the neighborhood loop." : "A stop along the upland route."}</p></div></aside>
  </div>;
}
