'use client';
import { useEffect } from 'react';
import { useSocialStore } from '@/state/socialStore';
import './socialUi.css';
export function SocialFeedback() {
 const notice = useSocialStore(state => state.notices[0]);
 const dismiss = useSocialStore(state => state.clearSocialNotice);
 useEffect(() => {
  if (!notice) return;
  const timer = setTimeout(dismiss, 12000);
  return () => clearTimeout(timer);
 }, [notice, dismiss]);
 if (!notice) return null;
 return <div className="social-feedback" data-testid="social-feedback"><div role="status" aria-live="polite"><strong>People remember</strong>{notice.lines.map(line => <p key={line}>{line}</p>)}</div><button onClick={dismiss}>Dismiss social update</button></div>;
}
