'use client';

import { useTuningStore } from '@/state/tuningStore';
import { useGameUiStore } from '@/state/gameUiStore';

const pesos = (value: number) => `₱${value.toLocaleString('en-PH')}`;

export function TalyerTunePanel() {
  const view = useTuningStore(s => s.view);
  const receipt = useTuningStore(s => s.receipt);
  const error = useTuningStore(s => s.error);
  const commands = useGameUiStore(s => s.commands);
  if (!view) return <p role="status" className="my-4 text-sm text-white/60">Bringing your car into the bay…</p>;
  const short = view.walletPhp < view.laborPhp;
  return <section aria-label="Tuning" className="mt-4 space-y-3 text-sm">
    <h3 className="text-lg">Tuning · {view.drivetrain}</h3>
    <p className="text-xs text-white/60">Tito Jun sets the alignment, diff and throttle map. Switch back any time for {pesos(view.laborPhp)} labor. No parts needed.</p>
    <p className="flex justify-between"><span className="text-white/60">Cash on hand</span><strong>{pesos(view.walletPhp)}</strong></p>
    {view.options.map(option => {
      const active = option.id === view.current;
      return <div key={option.id} className={`border p-3 ${active ? 'border-amber-200/70' : 'border-white/15'}`}>
        <div className="flex items-center justify-between gap-3">
          <strong>{option.label} tune</strong>
          {active ? <span role="status" className="text-xs text-amber-200">On your car</span>
            : <button type="button" className="tape-button" disabled={!commands || short}
              onClick={() => { useTuningStore.setState({ pending: true, error: null }); commands?.setVehicleTune(option.id); }}>
              Switch · {pesos(view.laborPhp)}</button>}
        </div>
        <p className="mt-1 text-xs text-white/60">{option.description}</p>
      </div>;
    })}
    {short && <p className="text-xs text-amber-200">Not enough cash for the labor yet.</p>}
    {receipt && <p role="status" className="border-l-2 border-emerald-300 pl-3 text-xs text-emerald-200">Paid {pesos(receipt.laborPhp)}. Your car now runs the {receipt.label.toLowerCase()} tune.</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
  </section>;
}
