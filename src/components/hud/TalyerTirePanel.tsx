'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameEvent } from '@/components/game/useGameEvent';
import type { GameEventMap } from '@/game';
import type { TireCompound } from '@/game-core/tires';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;
const compounds: (TireCompound | 'ALL')[] = ['ALL', 'STOCK', 'STREET', 'SEMI_SLICK', 'SLICK', 'DRIFT'];
const bars = (value: number) => '█'.repeat(Math.max(1, Math.min(9, Math.round(value * 7)))) + '░'.repeat(Math.max(0, 9 - Math.round(value * 7)));

/** Tito Jun's receipt-style catalogue, work order, inspection and the existing roadside services. */
export function TalyerTirePanel() {
  const [shop, setShop] = useState<GameEventMap['tireShopState'] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [compound, setCompound] = useState<TireCompound | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<1 | 2 | 4>(2);
  const [install, setInstall] = useState<'front' | 'rear' | 'all' | 'individual'>('rear');
  const [corner, setCorner] = useState<'FL' | 'FR' | 'RL' | 'RR'>('RL');
  const commands = useGameUiStore(s => s.commands);
  useGameEvent('tireShopState', state => { setShop(state); setPending(null); });
  useEffect(() => { commands?.quoteTireCatalogue(); commands?.quoteTireService(); }, [commands]);
  const available = useMemo(() => shop?.catalogue.filter(t => compound === 'ALL' || t.compound === compound) ?? [], [shop, compound]);
  const selected = available.find(t => t.id === selectedId) ?? available[0];
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(() => { if (quantity === 4) setInstall('all'); else if (quantity === 2 && (install === 'all' || install === 'individual')) setInstall('rear'); }, [quantity, install]);
  if (!shop) return <p className="my-4 text-xs text-white/50">Tito Jun is checking the wheels…</p>;
  const total = selected ? selected.price * quantity + quantity * 250 : 0;
  const front = shop.current.filter(t => t.corner === 'FL' || t.corner === 'FR');
  const rear = shop.current.filter(t => t.corner === 'RL' || t.corner === 'RR');
  const names = (items: typeof shop.current) => items.map(i => shop.catalogue.find(t => t.id === i.definitionId)?.name ?? 'Stock tire').join(' / ');
  return <div className="my-4 space-y-3 text-xs" data-testid="talyer-tires">
    <header className="border-y border-amber-100/25 bg-[#ded4ba] px-3 py-2 text-neutral-950"><strong className="block tracking-[.18em]">TITO JUN'S TIRE &amp; VULCANIZING</strong><span className="text-[10px]">OPEN DAILY • MOUNTING • BALANCING • ALIGNMENT • PATCH</span></header>
    <p className="border-l-2 border-red-400 pl-3 text-amber-100">Tito Jun: “{shop.dialogue}”</p>
    {shop.rejection && <p role="alert" className="text-amber-200">{shop.rejection}</p>}
    {shop.receipt && <p role="status" className="border-l-2 border-emerald-300 pl-3 text-emerald-200">{shop.receipt}</p>}
    <section className="grid gap-3 border border-white/15 p-3 md:grid-cols-[1fr_1.2fr]">
      <div><p className="mb-2 tracking-widest text-white/55">CURRENT CAR • {shop.wheelSize}</p><p><b>FRONT</b> {names(front) || 'No tyres'} · {Math.round((front.reduce((n, t) => n + t.health, 0) / Math.max(1, front.length)) * 100)}%</p><p><b>REAR</b> {names(rear) || 'No tyres'} · {Math.round((rear.reduce((n, t) => n + t.health, 0) / Math.max(1, rear.length)) * 100)}%</p><div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">{shop.current.map(t => <span key={t.corner} className="border border-white/15 px-2 py-1">{t.corner} {Math.round(t.health * 100)}% · {Math.round(t.temperatureC)}°C · {Math.round(t.pressurePsi)} PSI</span>)}</div>{front.some(t => t.definitionId !== rear[0]?.definitionId) && <p className="mt-2 text-amber-200">⚠ HANDLING BALANCE CHANGE: mixed compounds alter front/rear grip.</p>}</div>
      <div><p className="tracking-widest text-white/55">FILTER • FITS CURRENT WHEEL ({shop.wheelWidthMm} mm)</p><div className="mt-2 flex flex-wrap gap-1">{compounds.map(c => <button key={c} type="button" className="tape-button" aria-pressed={compound === c} onClick={() => setCompound(c)}>{c.replace('_', ' ')}</button>)}</div></div>
    </section>
    <section className="space-y-2"><p className="tracking-widest text-white/55">AVAILABLE TIRES</p>{available.map(t => <button type="button" key={t.id} onClick={() => setSelectedId(t.id)} className={`block w-full border p-3 text-left ${selected?.id === t.id ? 'border-amber-200 bg-amber-100/10' : 'border-white/15'}`}><span className="flex justify-between"><b>{t.name}</b><b>{pesos(t.price)} / tire</b></span><span className="block text-white/55">{t.widthMm}/{t.aspectRatio}R{t.wheelDiameterIn} • {t.compound.replace('_', ' ')}</span><span className="mt-2 grid grid-cols-2 gap-x-4 font-mono text-[10px] text-white/70"><span>DRY {bars(t.dryGrip)}</span><span>WET {bars(t.wetGrip)}</span><span>WEAR {bars(1 / t.wearRate)}</span><span>{t.breakawaySharpness < .6 ? 'BREAKAWAY: PROGRESSIVE' : 'BREAKAWAY: SHARP'}</span></span><span className="mt-2 block text-white/60">{t.description} {t.intendedUse.join(' • ')}</span></button>)}</section>
    {selected && <section className="border border-amber-100/30 bg-[#e7ddc8] p-3 text-neutral-950"><b>WORK ORDER • {selected.name} • {selected.widthMm}/{selected.aspectRatio}R{selected.wheelDiameterIn}</b><div className="mt-2 flex gap-2">{([1, 2, 4] as const).map(q => <button type="button" key={q} className="tape-button tire-workorder-button" aria-pressed={quantity === q} onClick={() => { setQuantity(q); if (q === 1) setInstall('individual'); }}>{q} tire{q > 1 ? 's' : ''}</button>)}</div>{quantity === 1 ? <div className="mt-2 flex gap-2">{(['FL', 'FR', 'RL', 'RR'] as const).map(c => <button type="button" key={c} className="tape-button tire-workorder-button" aria-pressed={corner === c} onClick={() => setCorner(c)}>{c}</button>)}</div> : <div className="mt-2 flex gap-2">{(['front', 'rear', 'all'] as const).map(target => <button type="button" key={target} disabled={target === 'all' && quantity !== 4} className="tape-button tire-workorder-button" aria-pressed={install === target} onClick={() => setInstall(target)}>{target.toUpperCase()}</button>)}</div>}<p className="mt-2">Tires {pesos(selected.price * quantity)} · Mounting &amp; balancing {pesos(quantity * 250)} · <b>TOTAL {pesos(total)}</b></p><button type="button" className="tape-button tire-workorder-button mt-3" disabled={!commands || pending !== null || total > shop.walletPhp || (quantity === 4 ? install !== 'all' : quantity === 1 ? install !== 'individual' : install === 'all')} onClick={() => { setPending(selected.id); commands?.buyTires(selected.id, quantity, quantity === 1 ? 'individual' : install, quantity === 1 ? [corner] : undefined); }}>CONFIRM WORK ORDER</button></section>}
    <details><summary className="cursor-pointer text-white/60">Roadside repair, spare and tool services</summary>{shop.lines.map(line => <div key={line.id} className="mt-2 flex items-center gap-3 border border-white/10 p-3"><span className="flex-1"><b>{line.label}</b><span className="block text-white/45">{line.detail}</span></span><button type="button" className="tape-button" disabled={!commands || pending !== null || line.costPhp > shop.walletPhp} onClick={() => { setPending(line.id); commands?.buyTireService(line.id); }}>{pesos(line.costPhp)}</button></div>)}</details>
  </div>;
}
