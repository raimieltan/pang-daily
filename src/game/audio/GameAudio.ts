import type { GameEventSource } from '../bridge/GameEvents';
import type { VehicleTelemetry } from '../bridge/types';
import { audioUrl, CAFE_FILE, RADIO_TRACKS, VOICE_FILE } from './catalog';
import { loadAudioSettings, setAudioSettings, useAudioStore } from '../../state/audioStore';
import { RadioEffect } from './RadioEffect';
import { NpcVoice, dialogueVoice } from './NpcVoice';

/** One audio owner per runtime. Long recordings stream; small effects are synthesized. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private wind: GainNode | null = null;
  private tires: GainNode | null = null;
  private nature: OscillatorNode | null = null;
  private natureGain: GainNode | null = null;
  private radioEffect: RadioEffect | null = null;
  private npcVoice: NpcVoice | null = null;
  private radio = new Audio();
  private cafe = new Audio(audioUrl(CAFE_FILE));
  private voice = new Audio(audioUrl(VOICE_FILE));
  private failedMedia = new Set<HTMLAudioElement>();
  private blockedMedia = new Set<HTMLAudioElement>();
  private pendingMedia = new Set<HTMLAudioElement>();
  private releases: (() => void)[] = [];
  private nodes: AudioScheduledSourceNode[] = [];
  private disposed = false;
  private ready = false;
  private paused = false;
  private driving = false;
  private coffee = false;
  private night = false;
  private rain = false;
  private speakingUntil = 0;
  private dialogueDuckUntil = 0;
  private track = -1;
  private gear: number | null = null;
  private speed = 0;
  private throttle = 0;
  private slip = 0;
  private countdown = -1;
  private checkpoint = 0;
  private stepDistance = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(events: GameEventSource) {
    loadAudioSettings();
    this.radio.preload = this.cafe.preload = this.voice.preload = 'none';
    this.cafe.loop = true;
    this.radio.onended = () => this.nextTrack();
    this.radio.onerror = () => this.mediaError(this.radio, 'Radio track unavailable. Try the next track.');
    this.cafe.onerror = () => this.mediaError(this.cafe, 'Coffee shop recording unavailable.');
    this.voice.onerror = () => this.mediaError(this.voice, 'Voice recording unavailable.');
    this.releases = [
      useAudioStore.subscribe(() => this.mix()),
      events.on('sceneLoading', () => { this.ready = false; this.driving = this.coffee = this.rain = this.night = false; this.speed = this.throttle = this.slip = 0; this.gear = null; this.countdown = -1; this.checkpoint = 0; this.voice.pause(); this.mix(); }),
      events.on('sceneReady', ({ sceneId }) => { this.ready = sceneId !== 'debug'; if (sceneId === 'driving') this.driving = true; this.mix(); }),
      events.on('paused', ({ paused }) => { this.paused = paused; this.mix(); }),
      events.on('playerModeChanged', ({ mode }) => { if (this.ready) this.tone(110, .13, .18); this.driving = mode === 'driving'; this.mix(); }),
      events.on('locationEntered', ({ locationId }) => { this.coffee = locationId === 'coffee_shop'; this.mix(); }),
      events.on('locationExited', ({ locationId }) => { if (locationId === 'coffee_shop') this.coffee = false; this.mix(); }),
      events.on('weatherChanged', ({ weather }) => { this.rain = weather === 'rain'; this.mix(); }),
      events.on('timeOfDay', ({ time }) => { this.night = time === 'night'; this.mix(); }),
      events.on('vehicleStateUpdated', ({ speedKmh, gear }) => { this.speed = Math.abs(speedKmh); if (this.gear !== null && gear !== this.gear) this.tone(85, .07, .07); this.gear = gear; this.mix(); }),
      events.on('vehicleTelemetry', (v: VehicleTelemetry) => { this.throttle = v.throttle; this.slip = v.groundedWheels > 0 ? Math.max(Math.abs(v.bodySlipDeg) / 25, v.handbrake) : 0; this.mix(); }),
      events.on('footsteps', ({ distance }) => { this.stepDistance += distance; if (this.stepDistance > .75) { this.stepDistance %= .75; this.tone(90 + Math.random() * 30, .065, .12); } }),
      events.on('interactionTriggered', ({ action }) => { if (action === 'order_coffee') this.tone(1400, .16, .08); else this.tone(480, .08, .06); }),
      events.on('dialogueTriggered', ({ dialogueId }) => this.speak(dialogueVoice(dialogueId), 1)),
      events.on('npcSound', ({ kind, voice, distance }) => {
        const range = kind === 'footstep' ? 10 : 18;
        const volume = Math.max(0, 1 - distance / range) ** 2 * (this.driving ? .2 : 1);
        if (kind === 'footstep') this.tone(95 + voice * 12, .07, .18 * volume);
        else if (kind === 'basketball') this.tone(145, .12, .3 * volume);
        else if (kind === 'work') this.tone(1150, .055, .09 * volume);
        else if (performance.now() >= this.speakingUntil) this.speak(voice, volume, true);
      }),
      events.on('raceProgress', (r) => { if (r.phase === 'COUNTDOWN' && r.countdown !== this.countdown) this.tone(660, .16, .15); this.countdown = r.phase === 'COUNTDOWN' ? r.countdown : -1; if (r.phase === 'RUNNING' && r.checkpoint > this.checkpoint) this.tone(1046, .2, .12); this.checkpoint = r.checkpoint; }),
      events.on('raceStarted', () => this.tone(1320, .45, .15)),
      events.on('raceFinished', ({ position }) => { this.tone(position === 1 ? 880 : 440, .6, .15); if (position > 1 && useAudioStore.getState().settings.explicitVoice && this.audible) { this.voice.currentTime = 0; this.speakingUntil = performance.now() + 6000; this.dialogueDuckUntil = this.speakingUntil; this.play(this.voice); } }),
      events.on('commandRejected', () => this.tone(180, .15, .1)),
      events.on('vehicleImpact', ({ strength }) => { this.tone(65, .25, strength * .4); this.tone(135, .09, strength * .2); }),
      events.on('horn', () => { this.tone(350, .4, .12); this.tone(440, .4, .08); }),
      events.on('playerReturned', () => this.tone(220, .25, .1)),
    ];
    window.addEventListener('click', this.unlock);
    window.addEventListener('keydown', this.unlock);
    document.addEventListener('visibilitychange', this.visibility);
    this.timer = setInterval(() => this.mix(), 200);
  }

  private get audible() { return !!this.context && this.context.state === 'running' && this.ready && !this.paused && !document.hidden && !useAudioStore.getState().settings.muted; }
  private visibility = () => this.mix();
  private mediaError(media: HTMLAudioElement, error: string) {
    this.failedMedia.add(media);
    useAudioStore.setState({ error });
  }
  private unlock = (event: Event) => {
    if (this.disposed) return;
    if (event.type === 'keydown' && event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea')) return;
    this.blockedMedia.clear();
    if (!this.context) {
      this.context = new AudioContext();
      const c = this.context;
      this.master = c.createGain(); this.master.connect(c.destination);
      this.radioEffect = new RadioEffect(c, this.radio, this.master);
      this.npcVoice = new NpcVoice(c, this.master);
      this.engineGain = c.createGain(); this.engineGain.gain.value = 0; this.engineGain.connect(this.master);
      this.engine = c.createOscillator(); this.engine.type = 'sawtooth';
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 450;
      this.engine.connect(filter); filter.connect(this.engineGain); this.engine.start(); this.nodes.push(this.engine);
      const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.wind = this.noise(buffer, 900); this.tires = this.noise(buffer, 2600);
      this.natureGain = c.createGain(); this.natureGain.gain.value = 0; this.natureGain.connect(this.master);
      this.nature = c.createOscillator(); this.nature.connect(this.natureGain); this.nature.start(); this.nodes.push(this.nature);
    }
    void this.context.resume().then(() => { if (!this.disposed) { useAudioStore.setState({ unlocked: true }); this.mix(); } }).catch(() => useAudioStore.setState({ error: 'Tap Sound to enable audio.' }));
  };
  private noise(buffer: AudioBuffer, frequency: number) {
    const c = this.context!; const source = c.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = frequency;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(filter); filter.connect(gain); gain.connect(this.master!); source.start(); this.nodes.push(source); return gain;
  }
  private tone(frequency: number, duration: number, volume: number, channel: 'effects' | 'dialogue' = 'effects', delay = 0) {
    if (!this.audible || !this.context || !this.master) return;
    const c = this.context, start = c.currentTime + delay;
    const oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = channel === 'dialogue' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, start + duration);
    gain.gain.setValueAtTime(0, c.currentTime); gain.gain.setValueAtTime(volume * useAudioStore.getState().settings[channel], start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(start); oscillator.stop(start + duration);
    this.nodes.push(oscillator); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.nodes = this.nodes.filter(n => n !== oscillator); };
  }
  private play(media: HTMLAudioElement) {
    if (!media.paused || this.failedMedia.has(media) || this.blockedMedia.has(media) || this.pendingMedia.has(media)) return;
    this.pendingMedia.add(media);
    void media.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') this.blockedMedia.add(media);
    }).finally(() => this.pendingMedia.delete(media));
  }
  private nextTrack() { setAudioSettings({ track: (useAudioStore.getState().settings.track + 1) % RADIO_TRACKS.length }); }
  private speak(voice: number, volume: number, short = false) {
    if (!this.audible || volume <= 0) return;
    const duration = this.npcVoice?.speak(voice, volume * useAudioStore.getState().settings.dialogue, short) ?? 0;
    this.speakingUntil = performance.now() + duration * 1000;
    if (!short) this.dialogueDuckUntil = this.speakingUntil;
    this.mix();
  }
  private mix() {
    if (this.disposed) return;
    const s = useAudioStore.getState().settings;
    const active = this.audible;
    if (!active) { this.npcVoice?.stop(); this.speakingUntil = this.dialogueDuckUntil = 0; }
    if (this.master && this.context) this.master.gain.setTargetAtTime(active ? s.master : 0, this.context.currentTime, .06);
    if (this.track !== s.track) { this.track = s.track; this.failedMedia.delete(this.radio); this.radio.src = audioUrl(RADIO_TRACKS[s.track].file); }
    const duck = performance.now() < this.dialogueDuckUntil ? .3 : 1;
    // Radio alone goes through the speaker filter and master bus; avoid applying master twice.
    this.radio.volume = 1;
    this.radioEffect?.setVolume(active && this.driving && s.radio ? s.music * duck : 0);
    // The room recording is a continuous bed, including during nearby chatter and dialogue.
    this.cafe.volume = s.master * s.ambience * (this.driving ? .25 : .7);
    this.voice.volume = s.master * s.dialogue;
    if (active && this.driving && s.radio && s.master * s.music > 0) this.play(this.radio); else this.radio.pause();
    if (active && this.coffee && this.cafe.volume > 0) this.play(this.cafe); else this.cafe.pause();
    if (!active || !s.explicitVoice) this.voice.pause();
    const c = this.context; if (!c) return;
    const gain = (node: GainNode | null, value: number) => node?.gain.setTargetAtTime(active ? value : 0, c.currentTime, .15);
    const rpm = 32 + (this.speed % 35) * 1.6 + this.throttle * 35;
    this.engine?.frequency.setTargetAtTime(rpm, c.currentTime, .12);
    gain(this.engineGain, this.driving ? s.effects * (.025 + this.throttle * .035) : 0);
    gain(this.wind, s.ambience * (this.rain ? .12 : .015) + (this.driving ? Math.min(this.speed / 160, 1) * s.effects * .05 : 0));
    gain(this.tires, this.driving && this.speed > 12 ? Math.min(this.slip, 1) * s.effects * .065 : 0);
    this.nature?.frequency.setTargetAtTime(this.night ? 3800 : 2200 + Math.sin(performance.now() / 190) * 400, c.currentTime, .05);
    const chirp = Math.sin(performance.now() / (this.night ? 65 : 420)) > .8;
    gain(this.natureGain, !this.coffee && !this.rain && chirp ? s.ambience * .006 : 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; clearInterval(this.timer); this.releases.forEach(off => off());
    window.removeEventListener('click', this.unlock); window.removeEventListener('keydown', this.unlock); document.removeEventListener('visibilitychange', this.visibility);
    for (const media of [this.radio, this.cafe, this.voice]) { media.onended = media.onerror = null; media.pause(); media.removeAttribute('src'); media.load(); }
    this.nodes.forEach(n => { try { n.stop(); } catch { /* Already ended. */ } n.disconnect(); });
    this.npcVoice?.stop(); this.radioEffect?.dispose();
    void this.context?.close(); useAudioStore.setState({ unlocked: false });
  }
}
