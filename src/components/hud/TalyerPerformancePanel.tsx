'use client';

import { useEffect, useRef } from 'react';
import { useGameUiStore } from '@/state/gameUiStore';
import { usePerformanceStore } from '@/state/performanceStore';
import { MECHANIC_INSPECTION_PHP } from '@/game-core/marketplace/MarketplaceSession';
import type { PerformanceStats } from '@/game-core/performance/calculator';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;
const STATS: { key: keyof PerformanceStats; label: string; format: (value: number) => string }[] = [
  { key: 'powerHp', label: 'Power', format: n => `${n.toFixed(1)} hp` },
  { key: 'torqueNm', label: 'Torque', format: n => `${n.toFixed(1)} Nm` },
  { key: 'weightKg', label: 'Weight', format: n => `${n.toFixed(0)} kg` },
  { key: 'throttleResponse', label: 'Throttle response', format: n => `${n.toFixed(2)}×` },
  { key: 'turboLagSeconds', label: 'Turbo lag', format: n => `${n.toFixed(2)} s` },
  { key: 'heatRate', label: 'Heat', format: n => `${n.toFixed(2)}×` },
  { key: 'coolingRate', label: 'Cooling', format: n => `${n.toFixed(2)}×` },
  { key: 'reliability', label: 'Reliability', format: n => `${Math.round(n * 100)}%` },
  { key: 'fuelConsumption', label: 'Fuel use', format: n => `${n.toFixed(2)}× stock` },
];

export function TalyerPerformancePanel() {
  const { view, quote, receipt, error } = usePerformanceStore();
  const commands = useGameUiStore(s => s.commands);
  const quoteElement = useRef<HTMLElement>(null);
  useEffect(() => () => { commands?.dismissPerformanceQuote(); }, [commands]);
  useEffect(() => { quoteElement.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [quote?.id]);
  if (!view) return <p role="status" className="my-4 text-white/60">Bring your car into Tito Jun’s bay.</p>;
  const short = quote ? Math.max(0, quote.laborPhp - view.walletPhp) : 0;
  return <section aria-label="Performance workshop" className="mt-4 space-y-4 text-sm">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-lg text-amber-100">Performance parts</h3><p className="mt-1 text-xs text-white/50">Tito Jun · Mechanic level {view.mechanicLevel} · Your reputation {view.reputation}</p></div>
      <strong>{pesos(view.walletPhp)}</strong>
    </div>
    <p className="text-xs text-white/65">Bring your own parts. Inspect used finds, fit the supporting parts first, then check what the build will do. Prices below are labor only.</p>
    <p className="text-xs text-teal-200">Missing a support? Banwa Auto Supply, beside this talyer, always stocks brand-new equivalents at 5× the typical used price. Look for the AUTO PARTS sign to the right.</p>
    {receipt && <p role="status" className="border-l-2 border-emerald-300 pl-3 text-emerald-200">{receipt.operation === 'install' ? 'Installed' : 'Removed'} {receipt.name}. Paid {pesos(receipt.laborPhp)} labor.</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {!view.parts.length && <div className="border border-white/10 p-4"><p>No performance parts in your inventory yet.</p><p className="mt-2 text-xs text-white/50">Find used engine, EFI, turbo and supporting parts in the Marketplace, then return here.</p></div>}
    <button type="button" className="tape-button" disabled={!commands} onClick={() => commands?.openMarketplace()}>Browse Marketplace</button>
    <ul className="space-y-2" aria-label="Owned performance parts">
      {view.parts.map(part => <li key={part.itemId} className="border border-white/15 p-3">
        <div className="flex justify-between gap-3"><strong>{part.name}</strong><span className="shrink-0 text-xs text-amber-100">{part.installed ? 'Installed' : part.elsewhere ? 'On another car' : 'In inventory'}</span></div>
        <p className="mt-1 text-xs text-white/50">{part.category.replaceAll('_', ' ')} · {part.inspected && part.condition !== null ? `${Math.round(part.condition * 100)}% condition` : 'Condition unknown'}</p>
        {part.reason && <p className="mt-2 text-xs text-amber-200">{part.reason}</p>}
        {!part.inspected ? <button type="button" className="tape-button mt-3" disabled={!commands || view.walletPhp < MECHANIC_INSPECTION_PHP} onClick={() => commands?.inspectPart(part.itemId)}>Inspect · {pesos(MECHANIC_INSPECTION_PHP)}</button>
          : <button type="button" className="tape-button mt-3 disabled:opacity-40" disabled={!commands || !!part.reason || part.elsewhere}
            onClick={() => commands?.quotePerformancePart(part.itemId, part.installed ? 'remove' : 'install')}>{part.installed ? 'Preview removal' : 'Preview install'}</button>}
      </li>)}
    </ul>
    {quote && <section ref={quoteElement} aria-label="Performance quote" className="space-y-3 border border-amber-100/30 bg-amber-100/5 p-3">
      <h4 className="text-amber-100">{quote.operation === 'install' ? 'Install' : 'Remove'} {quote.name}</h4>
      <p className="text-xs text-white/60">Calculated with your car’s current condition, wheels and body parts.</p>
      <table className="w-full text-xs"><caption className="sr-only">Build before and after</caption><thead><tr className="text-white/50"><th className="pb-2 text-left">Stat</th><th className="text-right">Before</th><th className="text-right">After</th></tr></thead>
        <tbody>{STATS.map(stat => <tr key={stat.key}><th className="py-1 text-left font-normal">{stat.label}</th><td className="text-right text-white/60">{stat.format(Number(quote.before[stat.key]))}</td><td className="text-right">{stat.format(Number(quote.after[stat.key]))}</td></tr>)}
          <tr><th className="py-1 text-left font-normal">Fuel system</th><td className="text-right text-white/60">{quote.before.fuelSystem.toUpperCase()}</td><td className="text-right">{quote.after.fuelSystem.toUpperCase()}</td></tr>
        </tbody>
      </table>
      {quote.displaced.length > 0 && <p className="text-xs text-white/60">Returned to inventory: {quote.displaced.join(', ')}.</p>}
      <div className="text-xs"><p className="mb-1 text-white/50">Expected risks under full throttle</p>{quote.warnings.length ? <ul className="list-disc space-y-1 pl-4 text-amber-200">{quote.warnings.map(w => <li key={w}>{w}</li>)}</ul> : <p className="text-emerald-200">No elevated build warnings.</p>}</div>
      <div className="flex justify-between border-t border-white/15 pt-3"><span>Labor</span><strong>{pesos(quote.laborPhp)}</strong></div>
      <p className="text-xs text-white/50">Cash after work: {short ? `short ${pesos(short)}` : pesos(view.walletPhp - quote.laborPhp)}</p>
      <button type="button" disabled={!commands || short > 0} className="w-full border border-amber-100/40 bg-amber-100/10 p-3 text-amber-100 disabled:opacity-35"
        onClick={() => commands?.installPerformancePart(quote.id)}>Pay {pesos(quote.laborPhp)} & {quote.operation}</button>
    </section>}
  </section>;
}
