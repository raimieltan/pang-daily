'use client';

import { useState } from 'react';
import { FUEL_CAPACITY_LITERS, FUEL_PRICE_PHP_PER_LITER } from '@/game-core/economy/economy';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function FuelPanel() {
  const open = useMaintenanceStore(s => s.fuelOpen);
  return open ? <FuelForm /> : null;
}
function FuelForm() {
  const [amount, setAmount] = useState('5');
  const [unit, setUnit] = useState<'liters' | 'budgetPhp'>('liters');
  const summary = useMaintenanceStore(s => s.summary);
  const quote = useMaintenanceStore(s => s.fuelQuote);
  const receipt = useMaintenanceStore(s => s.fuelReceipt);
  const error = useMaintenanceStore(s => s.fuelError);
  const commands = useGameUiStore(s => s.commands);
  const wallet = summary?.walletPhp ?? 0;
  const full = (summary?.fuelLiters ?? 0) >= FUEL_CAPACITY_LITERS - .001;
  return <section aria-label="Refuel car" onKeyDown={event => event.stopPropagation()}
    className="pointer-events-auto absolute right-3 top-24 z-40 max-h-[72dvh] w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-emerald-100/25 bg-neutral-950/95 p-5 text-sm shadow-2xl sm:right-8">
    <header className="flex items-center justify-between"><h2 className="text-xl">Refuel car</h2><button className="tape-button" onClick={() => commands?.dismissFuel()}>Close</button></header>
    <p className="mt-3 text-white/60">{summary?.vehicleName} · {summary?.fuelLiters?.toFixed(2)} / {FUEL_CAPACITY_LITERS} L</p>
    <p className="mt-2">{pesos(FUEL_PRICE_PHP_PER_LITER)} / L · Cash {pesos(wallet)}</p>
    {receipt && <p role="status" className="mt-3 text-emerald-200">Added {receipt.liters.toFixed(3)} L. Paid {pesos(receipt.costPhp)}.</p>}
    {full ? <p role="status" className="mt-4">Tank is full. Ready to drive.</p> : <>
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); commands?.quoteFuel(unit === 'liters' ? { liters: Number(amount) } : { budgetPhp: Number(amount) }); }}>
        <label className="flex flex-col gap-1">Buy by<select aria-label="Buy by" className="bg-neutral-800 p-2" value={unit} onChange={event => setUnit(event.target.value as typeof unit)}><option value="liters">Liters</option><option value="budgetPhp">Peso budget</option></select></label>
        <label className="flex flex-col gap-1">{unit === 'liters' ? 'Liters' : 'Budget (₱)'}<input aria-label="Fuel amount" className="w-28 bg-neutral-800 p-2" type="number" min={unit === 'liters' ? '.001' : '.01'} step={unit === 'liters' ? '.001' : '.01'} required value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <button className="tape-button" disabled={!commands}>Get price</button>
      </form>
      <button className="tape-button mt-3" disabled={!commands} onClick={() => commands?.quoteFuel({ targetLiters: FUEL_CAPACITY_LITERS })}>Fill tank</button>
    </>}
    {quote && <div className="mt-4 border-t border-white/20 pt-3">
      <p>Quoted fuel: {quote.liters.toFixed(3)} L</p><p>Total: {pesos(quote.costPhp)}</p>
      {quote.costPhp > wallet ? <p role="alert" className="mt-2 text-amber-200">Not enough cash. Choose a smaller quantity or budget.</p> : <p className="mt-2 text-white/60">Cash after purchase: {pesos(wallet - quote.costPhp)}</p>}
      <button className="mt-4 w-full border border-emerald-100/40 p-3 disabled:opacity-35" disabled={!commands || quote.costPhp > wallet} onClick={() => commands?.purchaseFuel(quote.id)}>Pay {pesos(quote.costPhp)} & refuel</button>
    </div>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    <p className="mt-4 text-xs text-white/50">Stay beside the pump until payment is complete.</p>
  </section>;
}
