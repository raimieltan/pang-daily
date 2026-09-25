/** A small mono dashboard speaker: narrow bandwidth, mid boost and soft saturation. */
export class RadioEffect {
  private readonly source: MediaElementAudioSourceNode;
  private readonly nodes: AudioNode[];
  private readonly gain: GainNode;

  constructor(private readonly context: AudioContext, media: HTMLMediaElement, destination: AudioNode) {
    this.source = context.createMediaElementSource(media);
    const mono = context.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass'; highpass.frequency.value = 280; highpass.Q.value = .7;
    const mid = context.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = .8; mid.gain.value = 3;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 3800; lowpass.Q.value = .7;
    const saturation = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    saturation.curve = curve; saturation.oversample = '2x';
    this.gain = context.createGain(); this.gain.gain.value = 0;
    this.nodes = [this.source, mono, highpass, mid, lowpass, saturation, this.gain];
    this.nodes.forEach((node, i) => node.connect(this.nodes[i + 1] ?? destination));
  }

  setVolume(volume: number) {
    this.gain.gain.setTargetAtTime(volume * .8, this.context.currentTime, .08);
  }

  dispose() { this.nodes.forEach(node => node.disconnect()); }
}
