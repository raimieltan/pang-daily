'use client';
import { useState, useEffect, useRef } from 'react';
import { useAutoPartsStore } from '@/state/autoPartsStore';
import { useGameUiStore } from '@/state/gameUiStore';
const pesos = (n: number) => `₱${n.toLocaleString('en-PH')}`;

export function AutoPartsShopPanel() {
  const { view, quote, receipt, error } = useAutoPartsStore();
  const commands = useGameUiStore(s => s.commands);
  const [search, setSearch] = useState('');
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { confirmation.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [quote?.id]);
  if (!view) return null;
  const products = view.products.filter(p => `${p.name} ${p.category} ${p.replaces}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <section aria-label="Auto parts shop" onKeyDown={e => e.stopPropagation()} className="pointer-events-auto absolute right-3 top-24 z-50 max-h-[75dvh] w-[30rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-teal-100/30 bg-neutral-950/95 p-5 text-sm sm:right-8">
    <header className="flex items-start justify-between gap-3"><div><p className="text-xs tracking-widest text-teal-200">BRAND NEW · READY STOCK</p><h2 className="mt-1 text-xl">{view.name}</h2></div><button className="tape-button" onClick={() => commands?.closeAutoPartsShop()}>Close shop</button></header>
    <p className="mt-3 text-xs text-white/60">100% condition, checked and ready to fit. Every part costs 5× its typical used Marketplace price (the midpoint of its used price range).</p>
    <p className="mt-3 flex justify-between"><span>Cash on hand</span><strong>{pesos(view.walletPhp)}</strong></p>
    <p className="mt-2 text-xs text-white/50">Installation and supporting parts are separate. Bring your purchase next door to Tito Jun’s Performance tab.</p>
    {receipt && <p role="status" className="mt-3 border-l-2 border-teal-200 pl-3 text-teal-100">Bought {receipt.name} for {pesos(receipt.pricePhp)}. In your inventory at 100% condition—no inspection fee.</p>}
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    <label className="mt-4 block text-xs text-white/60">Find a part<input aria-label="Find an auto part" value={search} onChange={e => setSearch(e.target.value)} placeholder="EFI harness, radiator, turbo…" className="mt-1 w-full border border-white/20 bg-neutral-900 p-2 text-sm text-white" /></label>
    <ul className="mt-3 space-y-2" aria-label="New parts in stock">{products.map(product => <li key={product.partId} className="border border-white/15 p-3">
      <div className="flex justify-between gap-3"><strong>{product.name}</strong><span className="shrink-0 text-teal-100">{pesos(product.pricePhp)}</span></div>
      <p className="mt-1 text-xs text-white/50">In stock · Brand new · 100% condition</p>
      <p className="mt-1 text-xs text-white/50">Used reference {pesos(product.usedReferencePhp)} × 5</p>
      <p className="mt-1 text-xs text-white/50">Equivalent to: {product.replaces}</p>
      <button className="tape-button mt-3" disabled={!commands} onClick={() => commands?.quoteAutoPart(product.partId)}>Select {product.name}</button>
    </li>)}</ul>
    {!products.length && <p className="my-4 text-white/50">No matching parts. Try “EFI” or “turbo”.</p>}
    {quote && <div ref={confirmation} className="mt-4 space-y-3 border-t border-teal-100/30 pt-4" aria-label="Confirm shop purchase">
      <h3>Buy {quote.product.name}</h3><p>Total: <strong>{pesos(quote.product.pricePhp)}</strong></p>
      {view.walletPhp < quote.product.pricePhp ? <p className="text-amber-200">Short {pesos(quote.product.pricePhp - view.walletPhp)}. Earn more or hunt for a used Marketplace part.</p> : <p className="text-white/60">Cash after purchase: {pesos(view.walletPhp - quote.product.pricePhp)}</p>}
      <button className="w-full border border-teal-100/40 bg-teal-100/10 p-3 text-teal-100 disabled:opacity-35" disabled={!commands || view.walletPhp < quote.product.pricePhp} onClick={() => commands?.buyAutoPart(quote.id)}>Pay {pesos(quote.product.pricePhp)} & buy</button>
    </div>}
  </section>;
}
