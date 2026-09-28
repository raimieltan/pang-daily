'use client';

import { useRef, useState } from 'react';
import { STARTER_ORIGINS } from '@/game-core/progression/chapter';
import { playerApi } from '@/lib/player/playerApi';

/** A story-facing entry point. The server command remains the sole owner of origin effects. */
export function StarterOrigin({ onSaved }: { onSaved: () => Promise<void> }) {
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const pending = useRef<{ id: typeof STARTER_ORIGINS[number]['id']; key: string } | null>(null);
 async function choose(id: typeof STARTER_ORIGINS[number]['id']) {
  if (busy) return;
  if (!pending.current || pending.current.id !== id) pending.current = { id, key: crypto.randomUUID() };
  setBusy(true); setError('');
  try { await playerApi.command({ type: 'starter_origin', originId: id }, pending.current.key); await onSaved(); }
  catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save your origin. Try again.'); }
  finally { setBusy(false); }
 }
 return <main className="relative flex h-full items-center justify-center overflow-y-auto bg-[#111710] p-4 text-[#f3eee0] sm:p-8">
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_10%,#4d573c_0%,transparent_45%),linear-gradient(150deg,#111710_42%,#201d18_100%)]" />
  <section className="relative my-auto w-full max-w-5xl border-y border-white/20 bg-black/25 p-5 shadow-2xl sm:p-10">
   <div className="grid gap-7 lg:grid-cols-[.82fr_1.18fr] lg:gap-12">
    <div className="flex flex-col justify-between">
     <div>
      <p className="text-[10px] tracking-[.3em] text-[#e7bb6e]">PANG DAILY / CHAPTER 1 / ILOILO</p>
      <h1 className="mt-5 text-4xl font-light leading-tight tracking-[.04em] sm:text-5xl">An old daily. Yours.</h1>
      <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">It isn’t fast or clean, and the brake pedal already pulls. But it is yours. Tito Jun’s talyer is east of home, on the north street. How did this car become your daily?</p>
     </div>
     <div className="relative mt-5 overflow-hidden border border-white/10 bg-[#22291e] px-3 pb-0 pt-3" aria-hidden="true">
      <p className="text-[9px] tracking-[.2em] text-white/40">BANWA DALAGAN / 1996 / AS FOUND</p>
      <svg viewBox="0 0 500 225" className="mt-3 w-full" role="img" aria-label="An aging 1990s daily driver">
       <defs><linearGradient id="starter-paint" x2="0" y2="1"><stop stopColor="#a6b49f"/><stop offset="1" stopColor="#677a70"/></linearGradient></defs>
       <path d="M0 191 H500 M20 210 H484" stroke="#a9a892" strokeOpacity=".35" strokeWidth="2"/>
       <path d="M48 149 L76 131 L143 122 L184 70 L339 70 L394 120 L441 130 L463 149 L463 180 L444 185 L61 185 L46 177 Z" fill="url(#starter-paint)" stroke="#d4d0ba" strokeWidth="3"/>
       <path d="M183 76 L152 121 L378 121 L337 76 Z" fill="#233a39" stroke="#bfc7ae" strokeWidth="2"/>
       <path d="M251 76 L251 121 M392 126 L392 174 M130 129 L129 175" stroke="#34443e" strokeWidth="3"/>
       <rect x="73" y="141" width="29" height="10" rx="2" fill="#efdaa8"/><rect x="434" y="140" width="16" height="12" rx="2" fill="#a33a2c"/>
       <circle cx="135" cy="183" r="31" fill="#151916" stroke="#c4bea5" strokeWidth="5"/><circle cx="135" cy="183" r="13" fill="#7d8c82"/>
       <circle cx="392" cy="183" r="31" fill="#151916" stroke="#c4bea5" strokeWidth="5"/><circle cx="392" cy="183" r="13" fill="#7d8c82"/>
      </svg>
     </div>
    </div>
    <div>
     <p className="mb-3 text-[10px] tracking-[.22em] text-white/50">CHOOSE YOUR START / SAME ROAD, DIFFERENT RESOURCES</p>
     <div className="space-y-3">{STARTER_ORIGINS.map((origin, index) => <button key={origin.id} type="button" disabled={busy} onClick={() => void choose(origin.id)} className="group block w-full border border-white/20 bg-[#1a211b]/85 p-4 text-left transition-colors hover:border-[#e7bb6e] hover:bg-[#293126] focus-visible:outline-2 focus-visible:outline-[#e7bb6e] disabled:opacity-45 sm:p-5">
      <span className="flex items-baseline justify-between gap-2"><strong className="text-lg font-medium">{origin.name}</strong><span className="text-xs text-[#e7bb6e]">0{index + 1} ↗</span></span>
      <span className="mt-2 block text-sm leading-6 text-white/65">{origin.description}</span>
      <span className="mt-4 grid grid-cols-[1fr_auto] gap-3 border-t border-white/10 pt-3 text-xs"><span>STARTING CASH <b className="ml-1 text-[#e7bb6e]">₱{origin.cashPhp.toLocaleString('en-PH')}</b></span><span>BRAKES {Math.round(origin.brakes * 100)}%</span></span>
     </button>)}</div>
     <p className="mt-4 text-xs leading-5 text-white/45">The choice is saved once. Every origin leads to the talyer, KYO Coffee, and the same first road with Casey.</p>
     {busy && <p role="status" className="mt-3 text-amber-100">Saving your daily…</p>}
     {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    </div>
   </div>
  </section>
 </main>;
}
