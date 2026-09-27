'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { GameCanvas } from '@/components/game/GameCanvas';
import { HudOverlay } from '@/components/hud/HudOverlay';
import type { RuntimeBootstrap } from '@/game-core/persistence/RuntimeBootstrap';
import { LegacyTransitionNotice } from './LegacyTransitionNotice';
import { PlayerApiError, playerService } from '@/lib/player/playerService';
import { persistenceFailure, type PersistenceFailure } from '@/lib/player/persistenceFailure';

type Entry = { status: 'loading' | 'anonymous' | 'error'; failure?: PersistenceFailure } |
  { status: 'ready'; bootstrap: RuntimeBootstrap; name: string };
export function GameEntry() {
  const [entry, setEntry] = useState<Entry>({ status: 'loading' });
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  function failed(error: unknown) {
    if (error instanceof PlayerApiError && error.status === 401) setEntry({ status: 'anonymous' });
    else setEntry({ status: 'error', failure: persistenceFailure(error) });
  }
  async function load() {
    setEntry({ status: 'loading' });
    try {
      const loaded = await playerService.bootstrap();
      setEntry({ status: 'ready', ...loaded });
    } catch (error) { failed(error); }
  }
  useEffect(() => {
    const abort = new AbortController();
    playerService.bootstrap(abort.signal).then(loaded => {
      if (!abort.signal.aborted) setEntry({ status: 'ready', ...loaded });
    }).catch(error => { if (!abort.signal.aborted) failed(error); });
    return () => abort.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setAuthError('');
    try {
      await playerService[mode]({ username, password });
      setPassword('');
      await load();
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Unable to sign in. Please retry.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await playerService.logout(); setEntry({ status: 'anonymous' }); }
    catch (error) { failed(error); }
    finally { setBusy(false); }
  }
  if (entry.status === 'ready') return <>
    <GameCanvas bootstrap={entry.bootstrap} />
    <HudOverlay />
    <LegacyTransitionNotice />
    <button type="button" disabled={busy} onClick={() => void logout()} className="absolute right-3 bottom-3 z-50 rounded bg-black/80 px-3 py-2 text-xs text-white" aria-label={`Sign out ${entry.name}`}>Sign out</button>
  </>;
  return <div className="flex h-full items-center justify-center bg-[#171b18] p-6 text-[#f3eee0]">
    <section className="w-full max-w-sm space-y-5 rounded-xl border border-white/15 bg-black/20 p-6">
      <p className="text-xs uppercase tracking-[.25em] text-[#e7bb6e]">Pang Daily</p>
      {entry.status === 'loading' ? <p role="status">Loading your save…</p> : entry.status === 'error' ? <>
        <h1 className="text-2xl">Unable to load your save</h1>
        <p role="alert">{entry.failure?.message}</p>
        {entry.failure?.requestId && <p className="text-xs text-white/60">Support reference: {entry.failure.requestId}</p>}
        {entry.failure?.retry && <button onClick={() => void load()} className="rounded bg-[#e7bb6e] px-4 py-2 text-black">Retry</button>}
        <button disabled={busy} onClick={() => void logout()} className="ml-3 underline">Sign out</button>
      </> : <>
        <h1 className="text-2xl">{mode === 'login' ? 'Continue your daily' : 'Start your daily'}</h1>
        <form onSubmit={event => void submit(event)} className="space-y-4">
          <label className="block">Username<input name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)}
            required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" className="mt-1 block w-full rounded border border-white/20 bg-black/30 px-3 py-2" /></label>
          <label className="block">Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)}
            required minLength={8} maxLength={128} className="mt-1 block w-full rounded border border-white/20 bg-black/30 px-3 py-2" /></label>
          {authError && <p role="alert" className="text-red-300">{authError}</p>}
          <button disabled={busy} className="w-full rounded bg-[#e7bb6e] px-4 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setAuthError(''); }} className="text-sm underline">{mode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}</button>
        <p className="text-xs text-white/60">Browser development progress is retired when your server save loads. It is not imported. Sign in to keep your account save, or create an account with fresh starter progress. Audio settings are kept.</p>
      </>}
    </section>
  </div>;
}
