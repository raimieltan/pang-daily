const VOICES = [
  { pitch: 155, formant: 740, pace: .19 },
  { pitch: 205, formant: 1050, pace: .16 },
  { pitch: 112, formant: 600, pace: .23 },
] as const;

export function dialogueVoice(id: string): number {
  if (id === 'kyo_order') return 1;
  if (id === 'talyer_mang_boy') return 2;
  return 0;
}

/** Short, wordless vocal phrases. One phrase at a time, with distinct character timbres. */
export class NpcVoice {
  private source: OscillatorNode | null = null;
  private nodes: AudioNode[] = [];

  constructor(private readonly context: AudioContext, private readonly destination: AudioNode) {}

  speak(voice: number, volume: number, short = false): number {
    this.stop();
    if (volume <= 0) return 0;
    const c = this.context, now = c.currentTime;
    const profile = VOICES[Math.abs(Math.floor(voice)) % VOICES.length];
    const source = c.createOscillator(); source.type = 'sawtooth';
    const mouth = c.createBiquadFilter(); mouth.type = 'bandpass'; mouth.Q.value = 2;
    const soften = c.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 2800;
    const gain = c.createGain(); gain.gain.value = 0;
    source.connect(mouth); mouth.connect(soften); soften.connect(gain); gain.connect(this.destination);
    const count = short ? 4 : 9;
    for (let i = 0; i < count; i++) {
      const t = now + i * profile.pace;
      source.frequency.setValueAtTime(profile.pitch * [1, 1.12, .93, 1.05][i % 4], t);
      source.frequency.exponentialRampToValueAtTime(profile.pitch * .88, t + profile.pace * .75);
      mouth.frequency.setValueAtTime(profile.formant * [1, 1.6, .8][i % 3], t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * .3, t + .015);
      gain.gain.linearRampToValueAtTime(0, t + profile.pace * .8);
    }
    const duration = count * profile.pace;
    this.source = source;
    const nodes = [source, mouth, soften, gain]; this.nodes = nodes;
    source.onended = () => {
      nodes.forEach(node => node.disconnect());
      if (this.source === source) { this.source = null; this.nodes = []; }
    };
    source.start(now); source.stop(now + duration);
    return duration;
  }

  stop() {
    if (this.source) { this.source.onended = null; this.source.stop(); this.source = null; }
    this.nodes.forEach(node => node.disconnect()); this.nodes = [];
  }
}
