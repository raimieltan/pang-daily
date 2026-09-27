'use client';

import { useLegacyTransitionStore } from '@/state/legacyTransitionStore';
import { playerService } from '@/lib/player/playerService';

export function LegacyTransitionNotice() {
  const { result, dismissed } = useLegacyTransitionStore();
  if (!result || dismissed || (result.status === 'complete' && !result.hadLegacy)) return null;
  const pending = result.status !== 'complete';
  return <aside role={pending ? 'alert' : 'status'} className="absolute bottom-16 left-3 right-3 z-50 max-w-lg rounded border border-amber-300/40 bg-black/95 p-4 text-sm text-amber-100">
    <p>{result.hadLegacy ? 'Browser development progress was not imported. Your account save is now canonical.' : 'Your account save is now canonical.'}</p>
    {pending ? <>
      <p className="mt-2">Browser save cleanup is incomplete. Your account save is safe; old browser data cannot overwrite it. Enable browser storage and retry cleanup.</p>
      <button type="button" className="mt-2 underline" onClick={() => playerService.retryLegacyCleanup()}>Retry browser cleanup</button>
    </> : <p className="mt-2">Old progression keys were retired. Audio settings were kept.</p>}
    <button type="button" className="ml-4 underline" onClick={() => useLegacyTransitionStore.setState({ dismissed: true })}>Dismiss</button>
  </aside>;
}
