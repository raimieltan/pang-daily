"use client";

import { useEffect } from 'react';
import { useSocialStore } from '@/state/socialStore';

/** Scene recognition only; personal NPC trust and respect stay in their own state. */
export function RecognitionBadge() {
 const progress = useSocialStore((state) => state.progress);
 const notice = useSocialStore((state) => state.tierNotice);
 const clearNotice = useSocialStore((state) => state.clearTierNotice);

 useEffect(() => {
  if (!notice) return;
  const timer = setTimeout(clearNotice, 4000);
  return () => clearTimeout(timer);
 }, [notice, clearNotice]);

 return <div className="mt-3 max-w-52 text-[10px] tracking-[0.12em] text-white/70" data-testid="recognition">
  <p className="text-white/45">LOCAL RECOGNITION</p>
  <p className="mt-1 flex items-baseline justify-between gap-3"><strong className="text-xs font-medium text-amber-100">{progress.tier}</strong><span>{progress.points}{progress.nextMinimum === null ? '' : ` / ${progress.nextMinimum}`}</span></p>
  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Recognition to next tier" aria-valuenow={Math.round(progress.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
   <div className="h-full bg-amber-200" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
  </div>
  {notice && <p role="status" className="mt-2 text-amber-100">Recognition: {notice.to}</p>}
 </div>;
}
