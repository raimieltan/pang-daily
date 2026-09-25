// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from './GameAudio';
import { GameEvents } from '../bridge/GameEvents';
import { audioUrl, DEFAULT_AUDIO, RADIO_TRACKS, readSettings } from './catalog';
import { setAudioSettings, useAudioStore } from '../../state/audioStore';
import { existsSync } from 'node:fs';
import { CAFE_FILE, VOICE_FILE } from './catalog';

const media: FakeAudio[] = [];
class FakeAudio {
  paused = true; volume = 1; loop = false; preload = ''; currentTime = 0;
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public src = '') { media.push(this); }
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  removeAttribute() { this.src = ''; }
  load() {}
}
const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param() });
class FakeContext {
  state = 'running'; currentTime = 0; sampleRate = 10; destination = {};
  createGain = node; createOscillator = node; createBiquadFilter = node; createBufferSource = node;
  createMediaElementSource = node; createWaveShaper = node;
  createBuffer() { return { getChannelData: () => new Float32Array(20) }; }
  resume = vi.fn(async () => {}); close = vi.fn(async () => {});
}
let audio: GameAudio | undefined;
afterEach(() => { audio?.dispose(); audio = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); media.length = 0; localStorage.clear(); });
async function setup() {
  vi.useFakeTimers(); vi.stubGlobal('Audio', FakeAudio); vi.stubGlobal('AudioContext', FakeContext);
  useAudioStore.setState({ settings: { ...DEFAULT_AUDIO }, unlocked: false, error: null });
  const events = new GameEvents(); audio = new GameAudio(events);
  events.emit('sceneReady', { sceneId: 'driving' });
  expect(media[0].paused).toBe(true);
  window.dispatchEvent(new Event('click')); await vi.advanceTimersByTimeAsync(200);
  return events;
}
describe('game audio', () => {
  it('streams radio only at the wheel and respects pause, mute and scene teardown', async () => {
    const events = await setup(); const radio = media[0];
    expect(radio.paused).toBe(false);
    events.emit('paused', { paused: true }); expect(radio.paused).toBe(true);
    events.emit('paused', { paused: false }); await vi.advanceTimersByTimeAsync(200); expect(radio.paused).toBe(false);
    setAudioSettings({ muted: true }); expect(radio.paused).toBe(true);
    setAudioSettings({ muted: false }); await vi.advanceTimersByTimeAsync(200); expect(radio.paused).toBe(false);
    events.emit('playerModeChanged', { mode: 'walking', vehicleId: null }); expect(radio.paused).toBe(true);
    events.emit('sceneLoading', { sceneId: 'hub' }); expect(media.every(m => m.paused)).toBe(true);
  });
  it('follows café entry/exit, advances tracks and releases playback and listeners', async () => {
    const events = await setup();
    media[0].onended?.(); expect(useAudioStore.getState().settings.track).toBe(1);
    expect(media[0].src).toBe(audioUrl(RADIO_TRACKS[1].file));
    events.emit('locationEntered', { locationId: 'coffee_shop', name: 'Kyo' }); expect(media[1].paused).toBe(false);
    events.emit('locationExited', { locationId: 'coffee_shop', name: 'Kyo' }); expect(media[1].paused).toBe(true);
    audio!.dispose(); audio = undefined;
    expect(media.every(m => m.paused && m.src === '')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    events.emit('sceneReady', { sceneId: 'driving' }); expect(media.every(m => m.paused)).toBe(true);
  });
  it('validates saved settings and references actual supplied recordings', () => {
    expect(readSettings({ master: 5, effects: -1, track: 1.5, muted: 'yes', dialogue: NaN })).toEqual({ ...DEFAULT_AUDIO, master: 1, effects: 0 });
    for (const file of [...RADIO_TRACKS.map(t => t.file), CAFE_FILE, VOICE_FILE]) expect(existsSync(`public/audio/${file}`)).toBe(true);
  });
  it('keeps café ambience continuous and at a steady level during chatter and dialogue', async () => {
    const events = await setup();
    events.emit('locationEntered', { locationId: 'coffee_shop', name: 'Kyo' });
    events.emit('playerModeChanged', { mode: 'walking', vehicleId: null });
    await vi.advanceTimersByTimeAsync(200);
    const cafe = media[1], volume = cafe.volume;
    const pauses = cafe.pause.mock.calls.length, plays = cafe.play.mock.calls.length;
    events.emit('npcSound', { kind: 'chatter', voice: 1, distance: 2 });
    expect(cafe.volume).toBe(volume);
    await vi.advanceTimersByTimeAsync(2500);
    events.emit('dialogueTriggered', { dialogueId: 'kyo_order' });
    expect(cafe.volume).toBe(volume);
    expect(cafe.paused).toBe(false);
    expect(cafe.pause).toHaveBeenCalledTimes(pauses);
    expect(cafe.play).toHaveBeenCalledTimes(plays);
  });
  it('silences a hidden tab and does not keep retrying broken recordings', async () => {
    await setup();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(media.every(m => m.paused)).toBe(true);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(200);
    expect(media[0].paused).toBe(false);
    media[0].pause(); media[0].onerror?.();
    const attempts = media[0].play.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(media[0].play).toHaveBeenCalledTimes(attempts);
    setAudioSettings({ track: 2 });
    expect(media[0].paused).toBe(false);
  });
});
