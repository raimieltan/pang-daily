'use client';

import { FITMENT_LABELS } from '@/game-core/wheels';
import { useCustomizationStore } from '@/state/maintenanceStore';
import { useGameUiStore } from '@/state/gameUiStore';
import type { CustomizationView } from '@/game/vehicles/CustomizationSystem';

export function TalyerSetupPanel({ section }: { section: 'paint' | 'suspension' }) {
  const view = useCustomizationStore(s => s.view);
  return view ? <SetupForm view={view} section={section} />
    : <p role="status" className="my-4 text-sm text-white/60">Bringing your car into the bay…</p>;
}

function SetupForm({ view, section }: { view: CustomizationView; section: 'paint' | 'suspension' }) {
  const commands = useGameUiStore(s => s.commands);
  const error = useCustomizationStore(s => s.error);
  const paint = view.paint;
  const height = Math.round(view.rideHeightM * 1000);
  return <section aria-label={section === 'paint' ? 'Paint booth' : 'Suspension setup'} className="mt-4 space-y-4 text-sm">
    {section === 'paint' ? <>
      <h3 className="text-lg">Paint booth</h3>
      <p className="text-xs text-white/60">A fresh colour for your daily. Body-colour parts follow the respray; primer, donor panels and bare trim keep their own finish.</p>
      <label className="flex items-center justify-between">Body colour<input aria-label="Body colour" type="color" value={paint} disabled={!commands} onChange={event => commands?.setVehiclePaint(event.target.value)} className="h-12 w-20 cursor-pointer bg-transparent" /></label>
      <div className="flex flex-wrap gap-2" aria-label="Paint swatches">
        {['#dadddf', '#2f5d8a', '#8e2a2a', '#234c3c', '#25272b', '#eee5cc', '#bd863d', '#674675'].map(color =>
          <button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={paint === color} disabled={!commands} onClick={() => commands?.setVehiclePaint(color)} style={{ backgroundColor: color }} className="h-9 w-9 border-2 border-white/40" />)}
      </div>
      <p role="status" className="text-xs text-white/50">On your car: {paint.toUpperCase()}</p>
      <button type="button" className="text-xs text-white/60 underline" disabled={!commands} onClick={() => commands?.setVehiclePaint(view.factoryPaint)}>Factory colour</button>
    </> : <>
      <h3 className="text-lg">Suspension & stance</h3>
      <p className="text-xs text-white/60">Set the body height over your current wheels. Go too low and the tires tuck into the arches.</p>
      <label className="block">Ride height: <strong>{height > 0 ? '+' : ''}{height} mm</strong> from factory
        <input aria-label="Ride height" type="range" className="mt-4 w-full accent-amber-200" min={Math.round(view.limits.minM * 1000)} max={Math.round(view.limits.maxM * 1000)} step={5}
          value={height} disabled={!commands} onChange={event => commands?.setRideHeight(Number(event.target.value) / 1000)} />
      </label>
      <div className="flex justify-between text-xs text-white/40"><span>Lower</span><span>Raise</span></div>
      <button type="button" className="text-xs text-white/60 underline" disabled={!commands} onClick={() => commands?.setRideHeight(view.limits.defaultM)}>Factory height</button>
      <p role="status" className={view.fitment.state === 'rubbing' ? 'text-red-300' : 'text-amber-100'}>Current fit: {FITMENT_LABELS[view.fitment.state]} · {Math.round(view.fitment.archGapM * 1000)} mm arch gap</p>
      <p className="text-xs text-white/50">This changes visual stance. Spring rates and alignment tuning are not part of this setup yet.</p>
    </>}
    <p className="text-xs text-white/40">Changes apply to your car immediately and save automatically. Free for now.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
