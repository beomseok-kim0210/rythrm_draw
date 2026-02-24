export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private _isPlaying = false;

  private ensureCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  // ----------------------------------------------------------
  async loadUrl(url: string): Promise<void> {
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AudioEngine: fetch failed ${url}`);
    const ab = await res.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(ab);
  }

  /**
   * BPM 120 기준 데모 비프음 생성
   * 4박마다 강한 클릭(880Hz), 나머지는 약한 클릭(440Hz)
   */
  generateDemoTone(bpm = 120, totalBeats = 32): void {
    const ctx = this.ensureCtx();
    const beatInterval = 60 / bpm;
    const duration = beatInterval * totalBeats + 1;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.ceil(duration * sr), sr);
    const data = buf.getChannelData(0);

    for (let beat = 0; beat < totalBeats; beat++) {
      const startSample = Math.floor(beat * beatInterval * sr);
      const isDownbeat = beat % 4 === 0;
      const freq = isDownbeat ? 880 : 440;
      const amp  = isDownbeat ? 0.55 : 0.3;
      const clickLen = Math.floor(0.05 * sr);

      for (let i = 0; i < clickLen && startSample + i < data.length; i++) {
        const t = i / sr;
        const envelope = Math.exp(-t * 70);
        data[startSample + i] += Math.sin(2 * Math.PI * freq * t) * amp * envelope;
      }
    }

    this.buffer = buf;
  }

  /**
   * Built-in playable groove track.
   * Kick(1/4), snare(2/4), hihat(1/8), bass(1/8 pattern).
   */
  generateGrooveTone(bpm = 120, totalMs = 18000): void {
    const ctx = this.ensureCtx();
    const sr = ctx.sampleRate;
    const durationSec = Math.max(8, totalMs / 1000 + 2);
    const totalSamples = Math.ceil(durationSec * sr);
    const beatSec = 60 / bpm;

    const buf = ctx.createBuffer(1, totalSamples, sr);
    const data = buf.getChannelData(0);

    const addPulse = (startSec: number, freq: number, amp: number, decay: number, lenSec: number) => {
      const start = Math.floor(startSec * sr);
      const len = Math.floor(lenSec * sr);
      for (let i = 0; i < len && start + i < data.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * decay);
        data[start + i] += Math.sin(2 * Math.PI * freq * t) * amp * env;
      }
    };

    const addNoise = (startSec: number, amp: number, decay: number, lenSec: number) => {
      const start = Math.floor(startSec * sr);
      const len = Math.floor(lenSec * sr);
      for (let i = 0; i < len && start + i < data.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * decay);
        data[start + i] += (Math.random() * 2 - 1) * amp * env;
      }
    };

    const totalBeats = Math.floor(durationSec / beatSec);
    for (let beat = 0; beat < totalBeats; beat++) {
      const t = beat * beatSec;
      const beatInBar = beat % 4;
      const isDownbeat = beatInBar === 0;

      addPulse(t, isDownbeat ? 75 : 62, isDownbeat ? 0.95 : 0.8, 22, 0.12);

      if (beatInBar === 1 || beatInBar === 3) {
        addNoise(t, 0.32, 32, 0.11);
      }

      addNoise(t, 0.07, 95, 0.03);
      addNoise(t + beatSec / 2, 0.06, 110, 0.02);

      addPulse(t, beatInBar === 0 ? 130 : 98, 0.15, 10, 0.22);
      addPulse(t + beatSec / 2, beatInBar === 2 ? 110 : 92, 0.1, 12, 0.18);
    }

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.max(-1, Math.min(1, data[i]));
    }

    this.buffer = buf;
  }

  // ----------------------------------------------------------
  play(offsetSec = 0): void {
    if (!this.buffer) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();

    this.stop();

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(ctx.destination);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.connect(this.analyser);
    this.sourceNode.start(0, Math.max(0, offsetSec));

    this.startedAt = ctx.currentTime - offsetSec;
    this._isPlaying = true;
    this.sourceNode.onended = () => { this._isPlaying = false; };
  }

  pause(): void {
    if (!this._isPlaying || !this.ctx) return;
    this.pausedAt = this.ctx.currentTime - this.startedAt;
    this.stop();
  }

  resume(): void { this.play(this.pausedAt); }

  stop(): void {
    try { this.sourceNode?.stop(); } catch { /* already stopped */ }
    this.sourceNode = null;
    this._isPlaying = false;
  }

  get isPlaying(): boolean { return this._isPlaying; }

  /** 현재 재생 위치 ms */
  getCurrentMs(): number {
    if (!this.ctx) return 0;
    if (!this._isPlaying) return this.pausedAt * 1000;
    return (this.ctx.currentTime - this.startedAt) * 1000;
  }

  /** 저역 에너지 0~1 (배경 pulse용) */
  getBassEnergy(): number {
    if (!this.analyser) return 0;
    if (!this.freqData || this.freqData.length !== this.analyser.frequencyBinCount) {
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this.analyser.getByteFrequencyData(this.freqData as any);
    const bass = (
      this.freqData[0] +
      this.freqData[1] +
      this.freqData[2] +
      this.freqData[3]
    ) / 4;
    return bass / 255;
  }

  destroy(): void {
    this.stop();
    this.analyser?.disconnect();
    this.freqData = null;
    this.ctx?.close();
    this.ctx = null;
  }
}
