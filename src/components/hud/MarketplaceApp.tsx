'use client';

import { useState } from 'react';
import type { PartCategory } from '@/game-core/parts/parts';
import type { ListingView, Verdict } from '@/game-core/marketplace/listings';
import type { OwnedPartView } from '@/game-core/marketplace/MarketplaceSession';
import { useMarketStore } from '@/state/marketStore';
import { useMaintenanceStore } from '@/state/maintenanceStore';
import { useGameUiStore } from '@/state/gameUiStore';
import { FITMENT_LABELS } from '@/game-core/wheels';
import type { WheelsView } from '@/game/vehicles/WheelSystem';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;
const ago = (s: number) => s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const GRADE_TONE = { like_new: 'text-emerald-200 border-emerald-200/40', good: 'text-sky-200 border-sky-200/40', fair: 'text-amber-200 border-amber-200/40', as_is: 'text-red-300 border-red-300/40' } as const;
const VERDICT: Record<Verdict, { text: string; tone: string }> = {
  better: { text: 'Swerte! Better than advertised.', tone: 'text-emerald-200' },
  as_described: { text: 'Legit. Tama ang description.', tone: 'text-emerald-200' },
  oversold: { text: 'Medyo na-oversell ka, boss.', tone: 'text-amber-200' },
  scammed: { text: 'Na-scam ka, pre. Hindi ’yan good condition.', tone: 'text-red-300' },
};
const CATEGORIES: { id: PartCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'wheels', label: 'Wheels' }, { id: 'tires', label: 'Tires' }, { id: 'suspension', label: 'Suspension' },
  { id: 'brakes', label: 'Brakes' }, { id: 'engine', label: 'Engine' }, { id: 'drivetrain', label: 'Drivetrain' },
  { id: 'exhaust', label: 'Exhaust' }, { id: 'lighting', label: 'Lights' }, { id: 'interior', label: 'Interior' },
];

/** "Baligya" (Hiligaynon: to sell) — the phone's local buy & sell board. Presentation only. */
export function MarketplaceApp() {
  const view = useMarketStore(s => s.view);
  const commands = useGameUiStore(s => s.commands);
  const [tab, setTab] = useState<'browse' | 'parts'>('browse');
  const [category, setCategory] = useState<PartCategory | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  if (!view) return null;
  const listing = view.listings.find(l => l.id === selected) ?? null;
  const shown = view.listings.filter(l => category === 'all' || l.category === category);
  return <section aria-label="Baligya marketplace" onKeyDown={event => event.stopPropagation()}
    className="pointer-events-auto absolute left-3 top-20 z-40 flex h-[min(44rem,82dvh)] w-[23rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[1.6rem] border-4 border-neutral-800 bg-neutral-950 text-sm tracking-normal shadow-2xl [text-shadow:none] sm:left-8">
    <header className="flex items-center justify-between border-b border-white/10 bg-neutral-900 px-4 pb-2 pt-3">
      <div><p className="text-lg font-semibold tracking-tight text-amber-100">baligya<span className="text-amber-400">.</span></p><p className="text-[10px] text-white/45">Iloilo car parts · buy & sell</p></div>
      <div className="flex items-center gap-3"><Wallet /><button type="button" aria-label="Close marketplace" className="text-lg text-white/60 hover:text-white" onClick={() => commands?.closeMarketplace()}>×</button></div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {listing ? <ListingDetail listing={listing} onBack={() => setSelected(null)} />
        : tab === 'browse' ? <>
          <nav aria-label="Categories" className="flex gap-2 overflow-x-auto px-3 py-2">
            {CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${category === c.id ? 'border-amber-200 bg-amber-200 text-neutral-950' : 'border-white/15 text-white/70'}`}>{c.label}</button>)}
          </nav>
          <p className="px-3 pb-2 text-[11px] text-white/40">{shown.length} listings near Iloilo City{view.nextExpirySeconds !== null && ` · next one goes in ${clock(view.nextExpirySeconds)}`}</p>
          {shown.length === 0 && <p className="px-3 py-8 text-center text-white/50">Wala pa. Check back later, boss.</p>}
          <ul className="grid grid-cols-2 gap-2 px-3 pb-3">
            {shown.map(l => <li key={l.id}><button type="button" onClick={() => setSelected(l.id)} className="block w-full text-left" aria-label={`${l.title}, ${pesos(l.askingPricePhp)}`}>
              <Photo listing={l} />
              <p className="mt-1 font-semibold text-white">{pesos(l.askingPricePhp)}</p>
              <p className="truncate text-xs text-white/80">{l.title}</p>
              <p className="text-[11px] text-white/40">{l.location} · {ago(l.postedSecondsAgo)}</p>
            </button></li>)}
          </ul>
        </> : <OwnedParts parts={view.parts} feePhp={view.inspectionFeePhp} />}
    </div>
    <Notice />
    {!listing && <nav aria-label="Marketplace sections" className="grid grid-cols-2 border-t border-white/10 bg-neutral-900 text-xs">
      {(['browse', 'parts'] as const).map(id => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
        className={`py-3 ${tab === id ? 'text-amber-200' : 'text-white/50'}`}>{id === 'browse' ? 'Browse' : `Your parts${view.parts.length ? ` (${view.parts.length})` : ''}`}</button>)}
    </nav>}
  </section>;
}

function Wallet() {
  const wallet = useMaintenanceStore(s => s.summary?.walletPhp);
  return wallet === undefined ? null : <span data-testid="market-wallet" className="text-xs text-white/70">{pesos(wallet)}</span>;
}

function Notice() {
  const { purchase, inspection, error } = useMarketStore();
  if (error) return <p role="alert" className="border-t border-red-300/30 bg-red-950/60 px-4 py-2 text-xs text-red-200">{error}</p>;
  if (purchase) return <p role="status" className="border-t border-emerald-300/30 bg-emerald-950/50 px-4 py-2 text-xs text-emerald-200">Paid {pesos(purchase.pricePhp)} · {purchase.part.title} is in your trunk. Have Mang Boy check it.</p>;
  if (inspection) return <p role="status" className="border-t border-white/10 px-4 py-2 text-xs text-white/70">Mang Boy checked your {inspection.part.title} · {pesos(inspection.feePhp)}</p>;
  return null;
}

function ListingDetail({ listing, onBack }: { listing: ListingView; onBack(): void }) {
  const commands = useGameUiStore(s => s.commands);
  const wallet = useMaintenanceStore(s => s.summary?.walletPhp);
  const [confirming, setConfirming] = useState(false);
  const short = wallet !== undefined && wallet < listing.askingPricePhp;
  return <article aria-label={listing.title} className="pb-4">
    <button type="button" className="px-3 py-2 text-xs text-white/60" onClick={onBack}>‹ Back</button>
    <Photo listing={listing} large />
    <div className="px-4">
      <p className="mt-3 text-2xl font-semibold text-white">{pesos(listing.askingPricePhp)}</p>
      <h2 className="text-base text-white/90">{listing.title}</h2>
      <p className="mt-1 text-[11px] text-white/45">Posted {ago(listing.postedSecondsAgo)} ago in {listing.location} · <span data-testid="listing-expiry">{listing.expiresInSeconds > 0 ? `listing ends in ${clock(listing.expiresInSeconds)}` : 'expired'}</span></p>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
        <dt className="text-white/45">Condition</dt><dd><span data-testid="advertised-grade" className={`rounded border px-1.5 py-0.5 ${GRADE_TONE[listing.advertised.grade]}`}>{listing.advertised.label}</span> <span className="text-white/40">per seller</span></dd>
        <dt className="text-white/45">Fits</dt><dd className="text-white/80">{listing.fits}</dd>
        <dt className="text-white/45">Meet-up</dt><dd className="text-white/80">{listing.meetup} or padala via rider</dd>
      </dl>
      <div className="mt-4 flex items-center gap-3 border-y border-white/10 py-3">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200/15 text-amber-100">{listing.seller.name[0]}</span>
        <div className="text-xs"><p className="text-white/90">{listing.seller.name}</p>
          <p className="text-white/45"><span className="text-amber-200">★ {listing.seller.rating.toFixed(1)}</span> · {listing.seller.sales} sold · on Baligya since {listing.seller.since}</p>
          <p className="text-white/35">{listing.seller.replies}</p></div>
      </div>
      <p className="mt-3 max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2 text-white/85">{listing.advertised.blurb}</p>
      <p className="mt-3 text-[11px] text-white/40">Condition is the seller’s word, not a guarantee. No returns. A mechanic can tell you what it really is after you buy.</p>
      {!confirming
        ? <button type="button" className="mt-4 w-full rounded-lg bg-amber-200 py-2.5 font-semibold text-neutral-950 disabled:opacity-40" disabled={!commands || short || listing.expiresInSeconds === 0}
          onClick={() => setConfirming(true)}>{short ? 'Not enough cash' : `Buy now · ${pesos(listing.askingPricePhp)}`}</button>
        : <div className="mt-4 rounded-lg border border-amber-200/40 p-3">
          <p className="text-xs text-white/80">Send {pesos(listing.askingPricePhp)} to {listing.seller.name} via e-wallet?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="flex-1 rounded-lg bg-amber-200 py-2 font-semibold text-neutral-950" onClick={() => { commands?.buyListing(listing.id); onBack(); }}>Pay {pesos(listing.askingPricePhp)}</button>
            <button type="button" className="flex-1 rounded-lg border border-white/20 py-2 text-white/70" onClick={() => setConfirming(false)}>Not yet</button>
          </div>
        </div>}
    </div>
  </article>;
}

function OwnedParts({ parts, feePhp }: { parts: OwnedPartView[]; feePhp: number }) {
  const commands = useGameUiStore(s => s.commands);
  if (parts.length === 0) return <p className="px-4 py-10 text-center text-white/50">Nothing bought yet. Parts you buy ride in your trunk.</p>;
  return <ul className="divide-y divide-white/10">
    {parts.map(part => <li key={part.id} className="px-4 py-3" data-testid="owned-part">
      <p className="flex justify-between gap-2"><span className="text-white/90">{part.title}</span>{part.paidPhp !== null && <span className="text-white/50">{pesos(part.paidPhp)}</span>}</p>
      {part.advertised && <p className="mt-1 text-[11px] text-white/45">from {part.seller} · listed “{part.advertised.label}”</p>}
      {part.installedOn && <p className="mt-1 text-[11px] text-sky-200/80">Installed on your car</p>}
      {part.category === 'wheels' && <WheelControls part={part} />}
      {part.actual
        ? <p className="mt-2 text-xs"><span className="text-white/60">Mang Boy: </span><strong data-testid="actual-condition" className="text-white">{part.actual.label}</strong> {part.actual.verdict && <span className={VERDICT[part.actual.verdict].tone}>{VERDICT[part.actual.verdict].text}</span>}</p>
        : <button type="button" className="mt-2 rounded-md border border-amber-200/40 px-3 py-1.5 text-xs text-amber-100" onClick={() => commands?.inspectPart(part.id)}>Have Mang Boy inspect · {pesos(feePhp)}</button>}
    </li>)}
    <li className="px-4 py-3 text-[11px] text-white/35">Inspection needs your car at the talyer, parked, with you on foot.</li>
  </ul>;
}

const FITMENT_TONE = { clean: 'text-emerald-200', sunken: 'text-white/60', poke: 'text-amber-200', rubbing: 'text-red-300', excessive_gap: 'text-amber-200' } as const;
const percent = (factor: number) => { const pct = Math.round((factor - 1) * 100); return pct > 0 ? `+${pct}%` : `${pct}%`; };

/** The set's listed effects, e.g. "grip +4% · braking −4% · +24 kg". Stock-equal values are left out. */
function effectsLine({ effects }: WheelsView) {
  const parts = (['grip', 'braking', 'acceleration'] as const).filter(k => Math.round((effects[k] - 1) * 100) !== 0).map(k => `${k} ${percent(effects[k])}`);
  if (effects.addedWeightKg !== 0) parts.push(`${effects.addedWeightKg > 0 ? '+' : ''}${Math.round(effects.addedWeightKg)} kg`);
  return parts.join(' · ');
}

/** Bolt a wheel set on or take it off. The game decides the install; this only sends the command. */
function WheelControls({ part }: { part: OwnedPartView }) {
  const commands = useGameUiStore(s => s.commands);
  const wheels = useMarketStore(s => s.wheels);
  const mounted = wheels?.itemId === part.id ? wheels : null;
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
    <button type="button" className="rounded-md border border-sky-200/40 px-3 py-1.5 text-sky-100 disabled:opacity-40" disabled={!commands}
      onClick={() => commands?.equipWheels(part.installedOn ? null : part.id)}>{part.installedOn ? 'Take off · back to stock' : 'Bolt on'}</button>
    {mounted && <p data-testid="wheel-fitment"><span className={FITMENT_TONE[mounted.fitment.state]}>{FITMENT_LABELS[mounted.fitment.state]}</span>
      {effectsLine(mounted) && <span className="text-white/45"> · {effectsLine(mounted)}</span>}</p>}
  </div>;
}

/** Stand-in "digicam flash" listing photo: seeded tone, part glyph, time stamp, grain. */
function Photo({ listing, large = false }: { listing: ListingView; large?: boolean }) {
  const hue = listing.photoSeed % 360, tilt = (listing.photoSeed % 9) - 4;
  // Late-night digicam time stamp, seeded so it never changes between renders.
  const stamp = `${String([21, 22, 23, 0, 1, 2][listing.photoSeed % 6]).padStart(2, '0')}:${String(listing.photoSeed % 60).padStart(2, '0')}`;
  return <div aria-hidden className={`relative overflow-hidden ${large ? 'aspect-[4/3]' : 'aspect-square rounded-md'}`}
    style={{ background: `radial-gradient(circle at 38% 34%, hsl(${hue} 18% 42%), hsl(${hue} 22% 12%) 70%)` }}>
    <svg viewBox="0 0 100 100" className="absolute inset-[18%] opacity-80" style={{ transform: `rotate(${tilt}deg)` }}><Glyph category={listing.category} /></svg>
    <span className="absolute inset-0 opacity-25 mix-blend-overlay" style={{ backgroundImage: 'repeating-radial-gradient(circle at 17% 29%, #fff 0 .6px, transparent .6px 2.4px)' }} />
    <span className="absolute bottom-1.5 right-2 font-mono text-[10px] text-orange-400/90">{stamp}</span>
  </div>;
}

function Glyph({ category }: { category: PartCategory }) {
  const s = { fill: 'none', stroke: '#e8e2d4', strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'wheels': return <g {...s}><circle cx="50" cy="50" r="40" /><circle cx="50" cy="50" r="9" />{[0, 72, 144, 216, 288].map(a => <line key={a} x1="50" y1="41" x2="50" y2="14" transform={`rotate(${a} 50 50)`} />)}</g>;
    case 'tires': return <g {...s}><circle cx="50" cy="50" r="42" strokeWidth={12} /><circle cx="50" cy="50" r="20" /></g>;
    case 'suspension': return <g {...s}><path d="M50 4v12M50 84v12M30 16h40M30 84h40M34 24l32 8-32 8 32 8-32 8 32 8-32 8" /></g>;
    case 'brakes': return <g {...s}><circle cx="46" cy="54" r="36" /><circle cx="46" cy="54" r="10" /><path d="M72 18a44 44 0 0 1 16 30l-14 2a30 30 0 0 0-10-20z" fill="#e8e2d4" /></g>;
    case 'engine': return <g {...s}><rect x="18" y="32" width="60" height="42" rx="4" /><path d="M30 32v-10h26v10M78 44h10v18H78M18 50H8" /></g>;
    case 'drivetrain': return <g {...s}><circle cx="50" cy="50" r="28" /><circle cx="50" cy="50" r="10" />{Array.from({ length: 8 }, (_, i) => <line key={i} x1="50" y1="22" x2="50" y2="10" transform={`rotate(${i * 45} 50 50)`} />)}</g>;
    case 'exhaust': return <g {...s}><path d="M6 60h30" /><rect x="36" y="42" width="44" height="36" rx="18" /><circle cx="80" cy="60" r="8" /></g>;
    case 'lighting': return <g {...s}><path d="M14 30h48a24 24 0 0 1 0 40H14z" /><circle cx="56" cy="50" r="10" /></g>;
    case 'interior': return <g {...s}><path d="M34 10h24l-4 50H38zM32 60h36l6 18H26zM30 88h40" /></g>;
  }
}
