import { create } from "zustand";
import { DEFAULT_AUDIO, readSettings, type AudioSettings } from "@/game/audio/catalog";
const KEY = "pang-daily.audio.v1";
export const useAudioStore = create<{ settings: AudioSettings; unlocked: boolean; error: string | null }>(() => ({ settings: DEFAULT_AUDIO, unlocked: false, error: null }));
export function loadAudioSettings() {
  try { useAudioStore.setState({ settings: readSettings(JSON.parse(localStorage.getItem(KEY) ?? "null")) }); } catch { /* Storage is optional. */ }
}
export function setAudioSettings(patch: Partial<AudioSettings>) {
  const settings = readSettings({ ...useAudioStore.getState().settings, ...patch });
  useAudioStore.setState({ settings });
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Private browsing. */ }
}
