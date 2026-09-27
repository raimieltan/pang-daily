'use client';
import { useEffect, type RefObject } from 'react';

export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
 useEffect(() => {
  if (!open || !ref.current) return;
  const previous = document.activeElement as HTMLElement | null;
  const panel = ref.current;
  const buttons = () => [...panel.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')].filter(element => !element.hasAttribute('disabled'));
  (buttons()[0] ?? panel).focus();
  const key = (event: KeyboardEvent) => {
   if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
   if (event.key === 'Tab') {
    const items = buttons();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault(); event.stopPropagation();
    items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
   }
  };
  document.addEventListener('keydown', key);
  return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
 }, [ref, open, close]);
}
