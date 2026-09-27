'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useSocialStore } from '@/state/socialStore';
import { useGameUiStore } from '@/state/gameUiStore';
import { useModalFocus } from './useModalFocus';
import './socialUi.css';

/** Presentation only: runtime pauses gameplay and supplies the complete public projection. */
export function ContactsApp() {
 const open = useSocialStore(state => state.contactsOpen);
 const view = useSocialStore(state => state.view);
 const commands = useGameUiStore(state => state.commands);
 const status = useGameUiStore(state => state.status);
 const panel = useRef<HTMLDivElement>(null);
 const close = useCallback(() => commands?.closeContacts(), [commands]);
 useModalFocus(panel, open, close);
 useEffect(() => {
  const key = (event: KeyboardEvent) => {
   if (event.code !== 'KeyP' || event.repeat || status !== 'ready' || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable], [role="dialog"]')) return;
   event.preventDefault();
   commands?.openContacts();
  };
  window.addEventListener('keydown', key);
  let frame = 0;
  let previous: boolean[] = [];
  const poll = () => {
   const pad = navigator.getGamepads?.()?.find(pad => pad?.connected);
   const down = pad?.buttons.map(button => button.pressed) ?? [];
   const pressed = (index: number) => down[index] && !previous[index];
   // First sample only establishes edges, so an already-held A cannot confirm on opening.
   if (previous.length && status === 'ready') {
    if (!open && pressed(9) && !document.querySelector('[role="dialog"]')) commands?.openContacts();
    if (open) {
     if (pressed(1) || pressed(9)) close();
     if (pressed(0)) (document.activeElement as HTMLElement)?.click();
     if (pressed(12) || pressed(13)) {
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button, summary') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = items[(index + (pressed(13) ? 1 : -1) + items.length) % items.length];
      next?.focus(); next?.scrollIntoView({ block: 'nearest' });
     }
     if (pressed(14) || pressed(15)) panel.current?.querySelector('.social-scroll')?.scrollBy({ top: pressed(15) ? 180 : -180 });
    }
   }
   previous = down;
   frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  return () => { window.removeEventListener('keydown', key); cancelAnimationFrame(frame); };
 }, [commands, status, open, close]);
 if (!open) return null;
 const rep = view.reputation;
 return <><div className="social-backdrop" aria-hidden="true" /><div ref={panel} className="social-panel" role="dialog" aria-modal="true" aria-labelledby="contacts-title" tabIndex={-1}>
  <header><h2 id="contacts-title">Phone · Contacts</h2><button onClick={close}>Close contacts</button></header>
  <div className="social-scroll" tabIndex={0} aria-label="Contacts and social progress">
   <small>People remember the runs, the help, and the conversations. Meet them in person to follow up.</small>
   <section aria-label="Scene reputation"><h3>Iloilo car scene</h3><p>{rep.tier} · {rep.points} recognition</p><progress aria-label="Scene reputation to next tier" max={100} value={Math.round(rep.progress * 100)} /><p>{rep.nextTier ? `${rep.pointsToNext} points to ${rep.nextTier}` : 'Local Legend — highest scene tier'}</p></section>
   <section aria-label="Contacts"><h3>People you know</h3>{!view.contacts.length && <p>No contacts yet. Talk to people at Kyo or the talyer to get introduced.</p>}
    {view.contacts.map(contact => <article className="social-card" key={contact.id}><h3>{contact.name}</h3><small>{contact.roles.join(' · ')} · {contact.location}</small><p>{contact.summary}</p><p>Trust {contact.trust} / 100 · Respect {contact.respect} / 100</p><p>Last shared event: {contact.lastEvent}</p>
     {contact.favors.length ? contact.favors.map(favor => <p key={favor.id}>Favor: {favor.name} · {favor.status}. {favor.nextStep}</p>) : <p>No outstanding favors.</p>}
     {!!contact.history.length && <details><summary>Recent shared history</summary><ul>{contact.history.map((event, index) => <li key={index}>{event}</li>)}</ul></details>}
    </article>)}
   </section>
   <section aria-label="Crew"><h3>Crew</h3>{!view.crews.length && <p>No crew connections yet. Get to know the people you meet; you can stay independent.</p>}{view.crews.map(crew => <article className="social-card" key={crew.id}><h3>{crew.name}</h3><p>{crew.description}</p><p>Standing: {crew.standing} · Membership: {crew.membership} · Invitation: {crew.invitation}</p><p>{crew.status === 'introduced' ? 'Introduced · no invitation yet' : crew.status} · {crew.location}</p></article>)}</section>
   <section aria-label="Known opportunities"><h3>Things to follow up</h3>{!view.opportunities.length && <p>No known opportunities yet. Let conversations lead the way.</p>}{view.opportunities.map(item => <article className="social-card" key={item.id}><h3>{item.name}</h3><p>{item.available ? 'Requirements met' : 'Currently locked'}</p>{!!item.requirements.length && <ul>{item.requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>}<p>{item.nextStep}</p></article>)}</section>
   <small>Keyboard: Tab to move, Escape to close. Gamepad: D-pad up/down to focus, left/right to scroll, A to select, B to close.</small>
  </div>
 </div></>;
}
