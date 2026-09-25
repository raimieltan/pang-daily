'use client';

import { useState } from 'react';
import { SERVICE_COMPONENTS, SERVICE_RULES, type ServiceComponent } from '@/game-core/maintenance/condition';
import type { RepairQuote } from '@/game-core/maintenance/VehicleSession';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;
const healthClass = (value: number) => value <= .35 ? 'text-red-300' : value < .7 ? 'text-amber-200' : 'text-emerald-200';

export function ConditionHud() {
  const summary = useMaintenanceStore(s => s.summary);
  if (!summary) return null;
  return <section aria-label="Vehicle condition" className="max-w-md self-start bg-black/65 px-3 py-2 text-[10px]">
    <div className="mb-2 flex items-center justify-between gap-8 tracking-widest"><span className="text-white/50">DAILY CONDITION</span><span data-testid="wallet">{pesos(summary.walletPhp)}</span></div>
    <div className="grid grid-cols-5 gap-3">
      {SERVICE_COMPONENTS.map(key => <div key={key} className={healthClass(summary.condition[key])}>
        <span className="block text-[9px] text-white/60">{SERVICE_RULES[key].label}</span>
        <span data-testid={`condition-${key}`}>{Math.floor(summary.condition[key] * 100)}%</span>
      </div>)}
    </div>
    <p className="mt-2 text-white/40">Park at the talyer · F to exit · F near Mang Boy to inspect</p>
  </section>;
}

export function RepairPanel() {
  const quote = useMaintenanceStore(s => s.quote);
  return quote ? <QuoteForm key={quote.id} quote={quote} /> : null;
}

function QuoteForm({ quote }: { quote: RepairQuote }) {
  const [selected, setSelected] = useState<ServiceComponent[]>([]);
  const [pending, setPending] = useState(false);
  const summary = useMaintenanceStore(s => s.summary);
  const receipt = useMaintenanceStore(s => s.receipt);
  const error = useMaintenanceStore(s => s.error);
  const commands = useGameUiStore(s => s.commands);
  const wallet = summary?.walletPhp ?? 0;
  const total = quote.lines.filter(line => selected.includes(line.component)).reduce((sum, line) => sum + line.costPhp, 0);
  const short = Math.max(0, total - wallet);
  const healthy = quote.totalPhp === 0;
  return <section aria-label="Talyer inspection and repair" onKeyDown={event => event.stopPropagation()}
    className="pointer-events-auto absolute right-3 top-24 z-40 max-h-[72dvh] w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-amber-100/25 bg-neutral-950/95 p-5 text-sm shadow-2xl sm:right-8">
    <header className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] tracking-[.2em] text-amber-100/60">MANG BOY’S TALYER</p><h2 className="mt-1 text-xl">Inspection & repair</h2><p className="mt-1 text-xs text-white/50">{quote.vehicleName}</p></div>
      <button type="button" className="tape-button" onClick={() => commands?.dismissRepair()} aria-label="Close inspection">Close</button>
    </header>
    <p className="my-4 text-xs text-white/65">Inspection is free. Parts and labor are included. Pick what your budget can cover.</p>
    <p className="mb-3 flex justify-between"><span className="text-white/60">Cash on hand</span><strong>{pesos(wallet)}</strong></p>
    {receipt && <p role="status" className="mb-3 border-l-2 border-emerald-300 pl-3 text-xs text-emerald-200">Paid {pesos(receipt.costPhp)}. {receipt.components.map(key => SERVICE_RULES[key].label).join(', ')} restored to 100%.</p>}
    {healthy && <p role="status" className="mb-3 text-emerald-200">All five systems are in good shape. No repairs needed, boss.</p>}
    <fieldset disabled={pending && !error} className="space-y-2">
      <legend className="sr-only">Choose repairs</legend>
      {quote.lines.map(line => <label key={line.component} className="flex cursor-pointer items-start gap-3 border border-white/10 p-3">
        <input type="checkbox" className="mt-1 accent-amber-200" disabled={line.costPhp === 0} checked={selected.includes(line.component)}
          onChange={event => { setPending(false); setSelected(current => event.target.checked ? [...current, line.component] : current.filter(key => key !== line.component)); }} />
        <span className="flex-1"><span className="flex justify-between gap-3"><span>{line.label} <span className={healthClass(line.condition)}>{Math.floor(line.condition * 100)}%</span></span><span>{line.costPhp ? pesos(line.costPhp) : 'Healthy'}</span></span>
          {line.costPhp > 0 && <span className="mt-1 block text-[11px] text-white/45">{line.symptom}</span>}
        </span>
      </label>)}
    </fieldset>
    <div className="mt-4 border-t border-white/20 pt-3">
      <p className="flex justify-between"><span>Selected repairs</span><strong data-testid="repair-total">{pesos(total)}</strong></p>
      <p className="mt-1 flex justify-between text-xs text-white/50"><span>Cash after repair</span><span>{short ? `Short ${pesos(short)}` : pesos(wallet - total)}</span></p>
      {short > 0 && <p className="mt-2 text-xs text-amber-200">Not enough cash. Choose fewer repairs.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <button type="button" className="mt-4 w-full border border-amber-100/40 bg-amber-100/10 px-3 py-3 text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
        disabled={!commands || selected.length === 0 || total === 0 || short > 0 || (pending && !error)}
        onClick={() => { setPending(true); commands?.repairVehicle(quote.id, selected); }}>Pay {pesos(total)} & repair</button>
      <button type="button" className="mt-3 w-full text-xs text-white/50 underline" onClick={() => commands?.inspectVehicle()}>Inspect again</button>
    </div>
  </section>;
}
