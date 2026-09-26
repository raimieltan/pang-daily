'use client';

import { bodyPart, canRefinish, PAINT_FINISHES, type PaintFinish } from '@/game-core/exterior';
import { useGameUiStore } from '@/state/gameUiStore';
import { useMarketStore } from '@/state/marketStore';

const FINISH_LABELS: Record<PaintFinish, string> = {
  body_color: 'Body colour', primer: 'Primer', mismatched: 'Mismatched donor paint',
  bare_plastic: 'Bare plastic', fake_carbon: 'Fake carbon', damaged: 'Damaged',
};
const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

/** Workshop inventory stays live even when the marketplace phone is closed. */
export function TalyerExteriorPanel() {
  const inventory = useMarketStore(s => s.exteriorInventory);
  const exterior = useMarketStore(s => s.exterior);
  const rejection = useMarketStore(s => s.error);
  const commands = useGameUiStore(s => s.commands);
  if (!inventory) return <p role="status" className="my-4 text-white/60">Loading your exterior parts…</p>;
  const effects = exterior?.vehicleId === inventory.vehicleId ? exterior.effects : null;
  return <section aria-label="Exterior parts" className="mt-4 space-y-4 text-xs">
    <p className="text-white/65">Bring your Baligya finds here. Fit a lip, swap a bumper, or make that donor fender match. Fitting and finish changes are free for now.</p>
    {inventory.pending && <p role="status" className="text-amber-200">Fitting parts…</p>}
    {(inventory.error || rejection) && <p role="alert" className="text-red-300">{inventory.error || rejection}</p>}
    {inventory.parts.length === 0 && <p className="border border-dashed border-white/20 p-4 text-white/60">No exterior parts in your trunk. Buy body parts from Phone · Baligya, then bring them to Mang Boy.</p>}
    <ul className="space-y-3">
      {inventory.parts.map(item => {
        const part = bodyPart(item.partId);
        if (!part) return null;
        const installed = item.installedOn === inventory.vehicleId;
        const elsewhere = item.installedOn !== null && !installed;
        const mounted = exterior?.parts.find(p => p.itemId === item.itemId);
        const displaced = exterior?.parts.find(p => p.socket === part.socket && p.itemId !== item.itemId);
        const disabled = !commands || inventory.pending || elsewhere || !item.compatible;
        return <li key={item.itemId} className="border border-white/15 p-3">
          <h3 className="text-sm text-white">{part.name}</h3>
          <p className="mt-1 text-white/50">{part.category.replaceAll('_', ' ')} · {part.fits}</p>
          {mounted && <p className="mt-2 text-amber-100">Fitted · {mounted.fit.replaceAll('_', ' ')} · {mounted.wear}</p>}
          {elsewhere && <p className="mt-2 text-amber-200">Installed on another car.</p>}
          {!item.compatible && <p className="mt-2 text-amber-200">Does not fit this car.</p>}
          {!installed && displaced && <p className="mt-2 text-white/60">Replaces {displaced.name}; it goes back in your trunk.</p>}
          <label className="mt-3 flex items-center justify-between gap-3">Finish
            <select aria-label={`Finish for ${part.name}`} className="min-w-0 max-w-[65%] border border-white/20 bg-neutral-900 p-2 text-white disabled:opacity-40"
              value={item.finish ?? part.paint.finish} disabled={disabled}
              onChange={event => commands?.refinishBodyPart(item.itemId, event.target.value as PaintFinish)}>
              {PAINT_FINISHES.filter(finish => canRefinish(part, finish)).map(finish => <option key={finish} value={finish}>{FINISH_LABELS[finish]}</option>)}
            </select>
          </label>
          <div className="mt-3 flex gap-2">
            {(!installed || !mounted) && <button type="button" disabled={disabled} className="tape-button disabled:opacity-40"
              onClick={() => commands?.equipBodyPart(item.itemId)}>{installed ? 'Retry fitting' : 'Install part'}</button>}
            {installed && <button type="button" disabled={disabled} className="tape-button disabled:opacity-40"
              onClick={() => commands?.removeBodyPart(item.itemId)}>Remove part</button>}
          </div>
        </li>;
      })}
    </ul>
    {effects && <div className="border-t border-white/20 pt-3">
      <h3 className="mb-2 text-sm">Fitted kit effects</h3>
      <dl className="grid grid-cols-2 gap-2 text-white/65">
        <dt>Weight</dt><dd>{signed(effects.addedWeightKg)} kg</dd>
        <dt>Drag</dt><dd>{signed(Math.round(effects.drag * 100))}%</dd>
        <dt>Downforce</dt><dd>{signed(Math.round(effects.downforce * 100))}%</dd>
        <dt>Cooling potential</dt><dd>{signed(Math.round(effects.cooling * 100))}%</dd>
        <dt>Porma</dt><dd>{signed(effects.reputation)}</dd>
        <dt>Estimated kit restoration</dt><dd>₱{effects.repairCostPhp.toLocaleString('en-PH')}</dd>
      </dl>
      <p className="mt-2 text-white/40">Restoration is an estimate. Cooling and porma are preview values for now.</p>
    </div>}
  </section>;
}
