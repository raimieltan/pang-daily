"use client";

import { usePersistenceStore } from '@/state/persistenceStore';
import { ChapterExperience } from './ChapterExperience';
import { ContactsApp } from './ContactsApp';
import { SocialFeedback } from './SocialFeedback';
import { useSocialStore } from '@/state/socialStore';
import { useState } from "react";
import { useHudStore } from "@/state/hudStore";
import { useGraphicsStore } from "@/state/graphicsStore";
import { RaceIntro } from "./RaceIntro";
import { useGameUiStore } from "@/state/gameUiStore";
import { CommandNotice } from "./CommandNotice";
import { DialogueBox } from "./DialogueBox";
import { RecognitionBadge } from "./RecognitionBadge";
import { DrivingHud } from "./DrivingHud";
import { PauseSettings } from "./PauseSettings";
import { LocationToast } from "./LocationToast";
import { InteractionPrompt } from "./InteractionPrompt";
import { SoundButton } from "./AudioPanel";
import { FuelPanel } from "./FuelPanel";
import { ConditionHud, RepairPanel } from "./RepairPanel";
import { JobBoardPanel, JobTracker } from "./JobPanels";
import { MarketplaceApp } from "./MarketplaceApp";
import { AutoPartsShopPanel } from './AutoPartsShopPanel';
import { useMarketStore } from "@/state/marketStore";

const buttonClass = "tape-button";

/** Presentation-only overlay. Reads the UI store and sends intents via commands. */
export function HudOverlay() {
  const offline = usePersistenceStore(s => s.offline);
  const saving = usePersistenceStore(s => s.saving);
  const saveError = usePersistenceStore(s => s.error);
  const failure = usePersistenceStore(s => s.failure);
  const saved = usePersistenceStore(s => s.saved);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [resumeOnClose, setResumeOnClose] = useState(false);
  const intro = useHudStore(s => s.raceIntro);
  const settings = useGraphicsStore(s => s.settings);
  const time = useGraphicsStore(s => s.timeOfDay);
  const status = useGameUiStore((s) => s.status);
  const errorMessage = useGameUiStore((s) => s.errorMessage);
  const paused = useGameUiStore((s) => s.paused);
  const commands = useGameUiStore((s) => s.commands);
  const loadingScene = useGameUiStore((s) => s.loadingScene);
  const contactsOpen = useSocialStore(s => s.contactsOpen);
  const marketOpen = useMarketStore((s) => s.view !== null);
  const openSettings = () => {
    setResumeOnClose(!paused);
    if (!paused) commands?.pause();
    setToolsOpen(true);
  };
  const closeSettings = () => {
    setToolsOpen(false);
    if (resumeOnClose) commands?.resume();
  };

  return (
    <div className={`tape-hud pointer-events-none absolute inset-0 flex flex-col justify-between ${settings?.reducedMotion ? "is-steady" : ""}`}>
      {offline && <p role="status" className="absolute bottom-14 left-3 rounded bg-black/90 p-3 text-sm text-amber-200">Offline. Progress requires a connection to save. Reconnect and retry any failed action.</p>}
      {saving && <p role="status" className="absolute top-10 left-3 text-xs text-white/70">Saving progress…</p>}
      {saved && !saving && !saveError && <p role="status" className="absolute top-10 left-3 text-xs text-emerald-200">Progress saved</p>}
      {saveError && <div role="alert" className="pointer-events-auto absolute top-14 left-3 right-3 z-50 rounded border border-red-400/50 bg-black/90 p-3 text-sm text-red-200">
        <p>{failure?.kind === 'authentication' ? 'Session expired' : failure?.kind === 'incompatible' ? 'Save needs attention' : failure?.kind === 'rejection' ? 'Change rejected' : 'Progress could not be saved'}: {failure?.message ?? saveError}</p>
        {failure?.requestId && <p className="mt-1 text-xs text-white/60">Support reference: {failure.requestId}</p>}
        {failure?.retry && <button type="button" className="mt-2 underline" onClick={() => useGameUiStore.getState().commands?.retryPersistence()}>Retry save</button>}
        {failure?.kind === 'authentication' && <button type="button" className="mt-2 underline" onClick={() => window.location.reload()}>Sign in again</button>}
      </div>}
      <header className="relative z-20 flex items-start justify-between gap-4">
        <div>
          <p className="tape-brand">PANG DAILY</p>
          <p className="mt-2 text-[10px] tracking-[0.24em] text-white/50">ILOILO, PH / {time === "night" ? "02:13 AM" : time === "morning" ? "06:24 AM" : "04:38 PM"}</p>
          <RecognitionBadge showNotices={false} /><ChapterExperience />
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          {settings?.analog && settings.analogPreset !== "CLEAN" && <span className="tape-rec hidden sm:inline"><i /> REC</span>}
          {status === "ready" && <>
            <SoundButton />
            <button type="button" className={buttonClass} aria-expanded={contactsOpen} onClick={() => contactsOpen ? commands?.closeContacts() : commands?.openContacts()}>Contacts · P</button>
            <button type="button" className={buttonClass} onClick={() => marketOpen ? commands?.closeMarketplace() : commands?.openMarketplace()} aria-expanded={marketOpen}>{marketOpen ? "Close phone" : "Phone · Baligya"}</button>
            <button type="button" className={buttonClass} onClick={() => toolsOpen ? closeSettings() : openSettings()} aria-expanded={toolsOpen}>{toolsOpen ? "Close settings" : "Settings"}</button>
            <button type="button" className={buttonClass} onClick={() => paused ? commands?.resume() : commands?.pause()}>{paused ? "Resume" : "Menu"}</button>
          </>}
        </div>
      </header>

      {(status === "loading" || loadingScene) && <div className="tape-loading"><p className="tape-eyebrow">PANG DAILY / VOL. 01</p><p className="mt-4 text-4xl font-light tracking-[0.16em]">FINDING SIGNAL</p><p className="mt-3 text-white/50">Loading {loadingScene ?? "the road"}…</p></div>}
      {status === "error" && <p className="self-center text-red-300">Failed to start: {errorMessage}</p>}

      {paused && status === "ready" && !toolsOpen && !contactsOpen && <nav className="tape-menu pointer-events-auto" aria-label="Pause menu">
        <p className="tape-eyebrow">TAPE PAUSED / ILOILO AFTER HOURS</p>
        <h1>NIGHT RUN</h1>
        <button onClick={() => commands?.resume()}>DRIVE <span>↗</span></button>
        <button onClick={openSettings}>SETTINGS</button>
        <p className="mt-10 text-[10px] tracking-[0.22em] text-white/40">OLD CARS. LATE NIGHTS. / VOL. 01</p>
      </nav>}

      {status === "ready" && toolsOpen && <PauseSettings onClose={closeSettings} />}
      {status === "ready" && !paused && !intro && <div className="flex flex-col gap-3">
        <LocationToast /><CommandNotice /><DialogueBox /><JobTracker /><ConditionHud /><DrivingHud /><InteractionPrompt />
      </div>}
      {status === "ready" && !paused && !intro && <><RepairPanel /><FuelPanel /><JobBoardPanel /><MarketplaceApp /><AutoPartsShopPanel /></>}
      <ContactsApp />
      {status === "ready" && !contactsOpen && <div className="absolute top-40 left-4 z-30"><SocialFeedback /></div>}
      <RaceIntro />
    </div>
  );
}
