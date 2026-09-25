"use client";

import { RADIO_TRACKS } from "@/game/audio/catalog";
import { setAudioSettings, useAudioStore } from "@/state/audioStore";

export function AudioPanel() {
  const { settings: s, unlocked, error } = useAudioStore();
  return <section className="bg-black/85 p-4 text-xs text-white/80" aria-label="Sound settings">
    <h2 className="mb-3 tracking-[.2em]">SOUND / FM STEREO</h2>
    <p className="mb-3 text-white/50">Horn: H / left stick press</p>
    {!unlocked && <p className="mb-3">Tap any control to enable sound.</p>}
    <button className="tape-button mb-3" aria-pressed={s.muted} onClick={() => setAudioSettings({ muted: !s.muted })}>{s.muted ? "Unmute sound" : "Mute sound"}</button>
    {([['master', 'Master'], ['music', 'Radio'], ['ambience', 'Ambience'], ['effects', 'Sound effects'], ['dialogue', 'Voices']] as const).map(([key, label]) => <label key={key} className="mb-2 grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
      <span>{label}</span><input type="range" min="0" max="100" value={Math.round(s[key] * 100)} onChange={e => setAudioSettings({ [key]: Number(e.target.value) / 100 })} /><span>{Math.round(s[key] * 100)}%</span>
    </label>)}
    <label className="mt-4 flex gap-2"><input type="checkbox" checked={s.radio} onChange={e => setAudioSettings({ radio: e.target.checked })} />Car radio</label>
    <label className="mt-3 block">Station / song<select className="mt-2 block w-full bg-neutral-900 p-2" value={s.track} onChange={e => setAudioSettings({ track: Number(e.target.value) })}>{RADIO_TRACKS.map((t, i) => <option key={t.file} value={i}>{t.title}</option>)}</select></label>
    <button className="tape-button my-3" onClick={() => setAudioSettings({ track: (s.track + 1) % RADIO_TRACKS.length })}>Next track →</button>
    <label className="flex gap-2"><input type="checkbox" checked={s.explicitVoice} onChange={e => setAudioSettings({ explicitVoice: e.target.checked })} />Race-loss meme voice (explicit language)</label>
    {error && <p role="status" className="mt-3 text-amber-200">{error}</p>}
  </section>;
}

export function SoundButton() {
  const muted = useAudioStore(s => s.settings.muted);
  const unlocked = useAudioStore(s => s.unlocked);
  return <button type="button" className="tape-button" aria-label={muted ? "Unmute sound" : unlocked ? "Mute sound" : "Enable sound"} aria-pressed={unlocked && !muted} onClick={() => setAudioSettings({ muted: unlocked ? !muted : false })}>{!unlocked ? "Enable sound" : muted ? "Sound off" : "Sound on"}</button>;
}
