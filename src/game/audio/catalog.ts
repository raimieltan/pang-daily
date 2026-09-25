export const RADIO_TRACKS = [
  { title: "90.7 Love Radio · Sunday Showdown", file: "90.7 Love Radio Sunday Showdown.mp3" },
  { title: "Banal Na Aso, Santong Kabayo", file: "Banal Na Aso Santong Kabayo.mp3" },
  { title: "Napupuyat · Freddie Aguilar", file: "Napupuyat - Freddie Aguilar.mp3" },
  { title: "Estudyante Blues", file: "Estudyante Blues - Lyrics.mp3" },
  { title: "Bakit · Aegis", file: "BAKIT (Tanong Ko Sa'yo) - Aegis (Lyric Video).mp3" },
] as const;
export const CAFE_FILE = "PHILIPPINE COFFEE SHOP - Mall Ambient Sounds Headphones On.mp3";
export const VOICE_FILE = "Uy Bagsak, Tang Ina Mo ! Filipino Meme Sound Effects.mp3";
export const audioUrl = (file: string) => `/audio/${encodeURIComponent(file)}`;
export type AudioSettings = { master: number; music: number; ambience: number; effects: number; dialogue: number; muted: boolean; radio: boolean; explicitVoice: boolean; track: number };
export const DEFAULT_AUDIO: AudioSettings = { master: .7, music: .35, ambience: .45, effects: .55, dialogue: .65, muted: false, radio: true, explicitVoice: false, track: 0 };
export function readSettings(value: unknown): AudioSettings {
  const settings = { ...DEFAULT_AUDIO };
  if (!value || typeof value !== "object") return settings;
  const raw = value as Record<string, unknown>;
  for (const key of ["master", "music", "ambience", "effects", "dialogue"] as const) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) settings[key] = Math.max(0, Math.min(1, v));
  }
  for (const key of ["muted", "radio", "explicitVoice"] as const) if (typeof raw[key] === "boolean") settings[key] = raw[key];
  if (typeof raw.track === "number" && Number.isInteger(raw.track) && raw.track >= 0 && raw.track < RADIO_TRACKS.length) settings.track = raw.track;
  return settings;
}
