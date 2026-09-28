'use client';

import { useEffect, useState } from 'react';
import { useGameEvent } from '@/components/game/useGameEvent';
import type { GameEventMap } from '@/game';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;

/** Talyer tire bench: air, plugs, new rubber, rims, a spare and tools, one paid line at a time. */
export function TalyerTirePanel() {
  const [shop, setShop] = useState<GameEventMap['tireShopState'] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const commands = useGameUiStore(s => s.commands);
  useGameEvent('tireShopState', state => { setShop(state); setPending(null); });
  useEffect(() => { commands?.quoteTireService(); }, [commands]);

  if (!shop) return <p className="my-4 text-xs text-white/50">Checking the tires…</p>;
  return <div className="my-4 space-y-2 text-xs" data-testid="talyer-tires">
    <p className="text-white/65">Tito Jun checks every wheel, the spare and your tools.</p>
    <p className="flex justify-between"><span className="text-white/60">Cash on hand</span><strong>{pesos(shop.walletPhp)}</strong></p>
    {shop.receipt && <p role="status" className="border-l-2 border-emerald-300 pl-3 text-emerald-200">{shop.receipt}</p>}
    {shop.rejection && <p role="alert" className="text-amber-200">{shop.rejection}</p>}
    {!shop.rejection && shop.lines.length === 0 && <p role="status" className="text-emerald-200">Tires, spare and tools all good, boss.</p>}
    {shop.lines.map(line => <div key={line.id} className="flex items-center gap-3 border border-white/10 p-3">
      <span className="flex-1"><span className="block">{line.label}</span><span className="block text-[11px] text-white/45">{line.detail}</span></span>
      <button type="button" className="tape-button" disabled={!commands || pending !== null || line.costPhp > shop.walletPhp}
        onClick={() => { setPending(line.id); commands?.buyTireService(line.id); }}>{pesos(line.costPhp)}</button>
    </div>)}
  </div>;
}
