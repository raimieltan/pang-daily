'use client';
import { useEffect, useRef } from 'react';
import { useCarDealerStore } from '@/state/carDealerStore';
import { useGameUiStore } from '@/state/gameUiStore';
const pesos = (n: number) => `₱${n.toLocaleString('en-PH')}`;
export function CarDealerPanel() {
  const { view, quote, receipt, error } = useCarDealerStore();
  const commands = useGameUiStore(s => s.commands);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { confirmation.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [quote?.id]);
  if (!view) return null;
  return <section aria-label="Car dealer" onKeyDown={e => e.stopPropagation()} className="pointer-events-auto absolute right-3 top-24 z-50 max-h-[75dvh] w-[30rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-amber-100/30 bg-neutral-950/95 p-5 text-sm sm:right-8">
    <header className="flex items-start justify-between gap-3"><div><p className="text-xs tracking-widest text-amber-200">SECOND-HAND · ORCR READY</p><h2 className="mt-1 text-xl">{view.name}</h2></div><button className="tape-button" onClick={() => commands?.closeCarDealer()}>Close lot</button></header>
    <p className="mt-3 text-xs text-white/60">Cars come in typical used condition with 45 L of fuel. A bought car is delivered to the carport at home.</p>
    <p className="mt-3 flex justify-between"><span>Cash on hand</span><strong>{pesos(view.walletPhp)}</strong></p>
    {receipt && <p role="status" className="mt-3 border-l-2 border-amber-200 pl-3 text-amber-100">Bought the {receipt.name} for {pesos(receipt.pricePhp)}. It will be parked at home when you leave the lot.</p>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    <ul className="mt-4 space-y-2" aria-label="Cars for sale">{view.listings.map(car => <li key={car.definitionId} className="border border-white/15 p-3">
      <div className="flex justify-between gap-3"><strong>{car.name}</strong><span className="shrink-0 text-amber-100">{pesos(car.pricePhp)}</span></div>
      <p className="mt-1 text-xs text-white/50">{car.drivetrain}</p>
      {car.owned ? <p className="mt-3 text-xs text-white/60">Already in your garage.</p>
        : <button className="tape-button mt-3" onClick={() => commands?.quoteCar(car.definitionId)}>Select {car.name}</button>}
    </li>)}</ul>
    {quote && <div ref={confirmation} className="mt-4 space-y-3 border-t border-amber-100/30 pt-4" aria-label="Confirm purchase">
      <h3 className="text-lg">{quote.listing.name}</h3><p>Total: <strong>{pesos(quote.listing.pricePhp)}</strong></p>
      {view.walletPhp < quote.listing.pricePhp ? <p className="text-amber-200">Short by {pesos(quote.listing.pricePhp - view.walletPhp)}.</p> : <p className="text-white/60">Cash after: {pesos(view.walletPhp - quote.listing.pricePhp)}</p>}
      <button className="w-full border border-amber-100/40 bg-amber-100/10 p-3 text-amber-100 disabled:opacity-35" disabled={view.walletPhp < quote.listing.pricePhp} onClick={() => commands?.buyCar(quote.id)}>Pay {pesos(quote.listing.pricePhp)} and buy</button>
    </div>}
  </section>;
}
