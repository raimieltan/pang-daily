'use client';
import { useState } from 'react';
import type { CustomizationView } from '@/game/vehicles/CustomizationSystem';
import { useGameUiStore } from '@/state/gameUiStore';
import { useCustomizationStore } from '@/state/maintenanceStore';
import { COMPONENTS, CORNER_IDS, DEG, type CornerSetup, type PartId } from '@/game-core/suspension/schema';
import { SUSPENSION_PARTS } from '@/game-core/suspension/parts';
import { PRESET_NAMES } from '@/game-core/suspension/service';
const tabs = ['Ride Height', 'Springs', 'Dampers', 'Alignment', 'Anti-Roll Bars', 'Steering', 'Damage'] as const;
type Tab = typeof tabs[number];
const fields: Record<Tab, (keyof CornerSetup)[]> = {
  'Ride Height': ['rideHeight', 'trackOffset'], Springs: ['springRate', 'preload', 'bumpStop'],
  Dampers: ['bump', 'rebound', 'highSpeedBump', 'highSpeedRebound'], Alignment: ['camber', 'toe', 'caster'],
  'Anti-Roll Bars': [], Steering: [], Damage: [],
};
const labels: Partial<Record<keyof CornerSetup, string>> = { rideHeight: 'Ride height', trackOffset: 'Track extension', springRate: 'Spring rate', preload: 'Preload', bumpStop: 'Bump stop length',
  bump: 'Low-speed compression', rebound: 'Low-speed rebound', highSpeedBump: 'High-speed compression', highSpeedRebound: 'High-speed rebound', camber: 'Camber', toe: 'Toe', caster: 'Caster' };
const hints: Record<Tab, string> = {
  'Ride Height': 'Height moves the chassis. Lowering reduces bump travel; wide wheels at full lock can rub.',
  Springs: 'Softer springs allow more roll, dive and squat. Preload changes the spring seat, not its stiffness.',
  Dampers: 'Low/high speed refers to damper movement. Too little rebound allows bouncing; too much delays the wheel’s return.',
  Alignment: 'Negative camber supports cornering but reduces straight-line contact. Positive toe points inward; excessive toe creates scrub and heat.',
  'Anti-Roll Bars': 'Bars resist left/right travel differences. A stiff rear bar can unload the inside rear wheel and reduce rear stability.',
  Steering: 'The inside wheel turns farther with Ackermann. More caster increases steering-induced camber and return. Lock requires a compatible kit.',
  Damage: 'Bent parts change physical alignment and stance. Replace damaged components, then perform alignment separately.',
};
const button = 'rounded border border-white/20 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40';
export function SuspensionPanel({ view }: { view: CustomizationView }) {
  const commands = useGameUiStore(s => s.commands), error = useCustomizationStore(s => s.error);
  const [tab, setTab] = useState<Tab>('Ride Height'), [advanced, setAdvanced] = useState(false), [presetName, setPresetName] = useState('Custom');
  const saved = view.suspension!, setup = saved.setup, part = SUSPENSION_PARTS[saved.part];
  const act = commands?.suspensionAction;
  const change = (indexes: number[], key: keyof CornerSetup, value: number) => {
    const next = structuredClone(setup); indexes.forEach(i => { next.corners[i][key] = value; }); act?.({ kind: 'setup', setup: next });
  };
  const groups = advanced ? CORNER_IDS.map((label, i) => ({ label, indexes: [i] })) : [{ label: 'Front', indexes: [0, 1] }, { label: 'Rear', indexes: [2, 3] }];
  return <section aria-label="Suspension setup" className="mt-4 space-y-4 text-sm">
    <div className="flex items-center justify-between"><h3 className="text-lg">Suspension workshop</h3><span className="text-xs text-amber-100">{view.drivetrain} · four independent corners</span></div>
    <label className="block text-xs text-white/70">Installed suspension
      <select aria-label="Suspension kit" value={saved.part} disabled={!commands} onChange={e => act?.({ kind: 'part', part: e.target.value as PartId })} className="mt-1 w-full rounded border border-white/20 bg-neutral-900 p-2 text-white">
        {Object.values(SUSPENSION_PARTS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
    <p className="text-xs text-white/60">{part.description}</p>
    <div className="flex flex-wrap gap-2" aria-label="Suspension presets">{PRESET_NAMES.map(name => <button type="button" className={button} key={name} disabled={!commands} onClick={() => act?.({ kind: 'preset', name, save: false })}>{name}</button>)}</div>
    <div className="flex gap-2"><input aria-label="Preset name" value={presetName} maxLength={32} onChange={e => setPresetName(e.target.value)} className="min-w-0 flex-1 rounded border border-white/20 bg-neutral-900 p-2" />
      <button type="button" className={button} disabled={!commands || !presetName.trim()} onClick={() => act?.({ kind: 'preset', name: presetName.trim(), save: true })}>Save preset</button></div>
    {Object.keys(saved.presets).length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved setups">{Object.keys(saved.presets).map(name => <button type="button" key={name} className={button} onClick={() => act?.({ kind: 'preset', name, save: false })}>Load {name}</button>)}</div>}
    <div role="tablist" aria-label="Suspension sections" className="flex flex-wrap gap-1">{tabs.map(name => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)} className={`${button} ${tab === name ? 'bg-amber-100/15 text-amber-100' : 'text-white/60'}`}>{name}</button>)}</div>
    <p className="text-xs text-white/60">{hints[tab]}</p>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} />Advanced · individual corners</label>
    <div role="tabpanel" aria-label={tab} className="space-y-4">
      {fields[tab].map(key => {
        const angle = ['camber', 'toe', 'caster'].includes(key), distance = ['rideHeight', 'trackOffset', 'preload', 'bumpStop'].includes(key);
        const scale = angle ? 1 / DEG : distance ? 1000 : key === 'springRate' ? .001 : 1;
        const unit = angle ? '°' : distance ? 'mm' : key === 'springRate' ? 'N/mm' : 'N·s/m';
        const range = part.ranges[key];
        return <fieldset key={key} className="space-y-2 rounded border border-white/10 p-3"><legend className="px-1 text-amber-100">{labels[key]}</legend>
          {groups.filter(g => key !== 'caster' || g.indexes[0] < 2).map(g => {
            const value = setup.corners[g.indexes[0]][key] * scale;
            return <label className="block text-xs" key={g.label}>{g.label} {labels[key]} <strong className="float-right tabular-nums">{value.toFixed(angle ? 2 : 1)} {unit}</strong>
              <input aria-label={`${g.label} ${labels[key]}`} type="range" className="mt-2 w-full accent-amber-200" disabled={!commands || !range} min={(range?.[0] ?? setup.corners[g.indexes[0]][key]) * scale} max={(range?.[1] ?? setup.corners[g.indexes[0]][key]) * scale}
                step={angle ? .05 : distance ? 1 : key === 'springRate' ? 1 : 50} value={value} onChange={e => change(g.indexes, key, Number(e.target.value) / scale)} />
            </label>;
          })}
          {!range && <p className="text-xs text-white/40">Install adjustable suspension to change this setting.</p>}
        </fieldset>;
      })}
      {(tab === 'Anti-Roll Bars' || tab === 'Steering') && (tab === 'Anti-Roll Bars' ? ['frontARB', 'rearARB'] as const : ['maxLock', 'ackermann', 'steeringRatio'] as const).map(key => {
        const scale = key === 'maxLock' ? 1 / DEG : key === 'ackermann' ? 100 : key.endsWith('ARB') ? .001 : 1;
        const name = { frontARB: 'Front ARB · N/mm', rearARB: 'Rear ARB · N/mm', maxLock: 'Maximum lock · degrees', ackermann: 'Ackermann · %', steeringRatio: 'Steering ratio' }[key];
        return <label key={key} className="block">{name}: {Math.round(setup[key] * scale * 10) / 10}<input aria-label={name} type="range" className="mt-2 w-full accent-amber-200" min={key === 'maxLock' ? 20 : key === 'steeringRatio' ? 8 : 0} max={key === 'maxLock' ? part.maxLock / DEG : key === 'steeringRatio' ? 24 : key === 'ackermann' ? 100 : 120} step={1} value={setup[key] * scale}
          disabled={!commands} onChange={e => act?.({ kind: 'setup', setup: { ...setup, [key]: Number(e.target.value) / scale } })} /></label>;
      })}
      {tab === 'Damage' && CORNER_IDS.map((corner, i) => <fieldset key={corner} className="rounded border border-white/15 p-3"><legend>{corner}</legend>
        <p className="mb-2 text-xs text-white/60">Camber target {(setup.corners[i].camber / DEG).toFixed(2)}° / actual {((view.suspensionTelemetry?.corners[i].camber ?? setup.corners[i].camber) / DEG).toFixed(2)}° · Toe target {(setup.corners[i].toe / DEG).toFixed(2)}° / actual {((view.suspensionTelemetry?.corners[i].toe ?? setup.corners[i].toe) / DEG).toFixed(2)}°</p>
        {COMPONENTS.map(component => <div className="flex items-center justify-between gap-2 py-1 text-xs" key={component}><span>{component.replace(/([A-Z])/g, ' $1')} · {Math.round(saved.damage[i].health[component] * 100)}%</span>
          <button type="button" className={button} disabled={!commands || saved.damage[i].health[component] === 1} onClick={() => act?.({ kind: 'repair', corner: i, component })}>Replace {corner} {component}</button></div>)}
        <button type="button" className={`${button} mt-2`} disabled={!commands} onClick={() => act?.({ kind: 'align', corner: i })}>Align {corner}</button>
      </fieldset>)}
    </div>
    <div className="rounded border border-amber-100/20 p-3"><p className="mb-2 text-xs text-amber-100">Live suspension preview</p><div className="flex flex-wrap gap-2">{(['cornering', 'braking', 'acceleration', 'lock', 'off'] as const).map(mode => <button type="button" key={mode} className={button} aria-pressed={view.preview === mode} disabled={!commands} onClick={() => commands?.previewSuspension(mode)}>{mode === 'off' ? 'Stop preview' : mode === 'lock' ? 'Full lock' : `Simulate ${mode}`}</button>)}</div>
      <p className="mt-2 text-xs text-white/50">The preview uses the suspension solver. It does not damage your car.</p></div>
    {view.suspensionTelemetry && <div className="overflow-x-auto"><table aria-label="Suspension corner telemetry" className="w-full text-xs tabular-nums"><thead><tr>{['Corner', 'Travel', 'Load', 'Camber', 'Toe', 'State'].map(h => <th className="p-1 text-left text-white/50" key={h}>{h}</th>)}</tr></thead><tbody>{view.suspensionTelemetry.corners.map(c => <tr key={c.corner}><td className="p-1">{c.corner}</td><td>{Math.round(c.compression * 1000)} mm</td><td>{(c.wheelLoad / 1000).toFixed(1)} kN</td><td>{(c.camber / DEG).toFixed(1)}°</td><td>{(c.toe / DEG).toFixed(2)}°</td><td>{c.status}</td></tr>)}</tbody></table></div>}
    <p className="text-xs text-white/50">{view.drivetrain === 'FWD' ? 'Front tires share steering and drive demand. Acceleration unloads the front axle; excess rear roll stiffness can lift the inside rear.' : view.drivetrain === 'RWD' ? 'Rear tires share cornering and drive demand. Acceleration loads the rear axle; rear toe and camber change power traction.' : 'Torque is shared between axles; each tire remains limited by its own load and contact.'}</p>
    <p className="text-xs text-white/40">Changes apply immediately and save automatically. Parts, tuning and service are free in this workshop build.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
