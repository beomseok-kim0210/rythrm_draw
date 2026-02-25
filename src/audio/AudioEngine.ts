import type { Judgement, Note } from '../types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private _isPlaying = false;

  private noteScaleHz = [220.0, 246.94, 261.63, 293.66, 329.63, 392.0, 440.0, 493.88];

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
   * Drum + bass + chord pad + arpeggio melody.
   */
  generateGrooveTone(bpm = 120, totalMs = 18000): void {
    const ctx = this.ensureCtx();
    const sr = ctx.sampleRate;
    const durationSec = Math.max(8, totalMs / 1000 + 2);
    const totalSamples = Math.ceil(durationSec * sr);
    const beatSec = 60 / bpm;

    const buf = ctx.createBuffer(1, totalSamples, sr);
    const data = buf.getChannelData(0);

    const waveSample = (wave: 'sine' | 'triangle' | 'saw', phase: number): number => {
      if (wave === 'triangle') {
        return (2 / Math.PI) * Math.asin(Math.sin(phase));
      }
      if (wave === 'saw') {
        const wrapped = (phase / (Math.PI * 2)) % 1;
        return 2 * (wrapped - Math.floor(wrapped + 0.5));
      }
      return Math.sin(phase);
    };

    const addTone = (
      startSec: number,
      freq: number,
      amp: number,
      decay: number,
      lenSec: number,
      wave: 'sine' | 'triangle' | 'saw' = 'sine'
    ) => {
      const start = Math.floor(startSec * sr);
      const len = Math.floor(lenSec * sr);
      for (let i = 0; i < len && start + i < data.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * decay);
        const phase = 2 * Math.PI * freq * t;
        data[start + i] += waveSample(wave, phase) * amp * env;
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

    const addPad = (
      startSec: number,
      freq: number,
      amp: number,
      lenSec: number
    ) => {
      const start = Math.floor(startSec * sr);
      const len = Math.floor(lenSec * sr);
      for (let i = 0; i < len && start + i < data.length; i++) {
        const t = i / sr;
        const k = Math.min(1, t / Math.max(0.001, lenSec));
        const env = Math.pow(Math.sin(Math.PI * k), 0.7) * Math.exp(-t * 0.55);
        const phase = 2 * Math.PI * freq * t;
        const tri = waveSample('triangle', phase * 0.999);
        const sine = waveSample('sine', phase * 1.001);
        data[start + i] += (sine * 0.65 + tri * 0.35) * amp * env;
      }
    };

    const totalBeats = Math.floor(durationSec / beatSec);
    for (let beat = 0; beat < totalBeats; beat++) {
      const t = beat * beatSec;
      const beatInBar = beat % 4;
      const isDownbeat = beatInBar === 0;

      addTone(t, isDownbeat ? 75 : 62, isDownbeat ? 0.95 : 0.8, 22, 0.12);

      if (beatInBar === 1 || beatInBar === 3) {
        addNoise(t, 0.32, 32, 0.11);
      }

      addNoise(t, 0.07, 95, 0.03);
      addNoise(t + beatSec / 2, 0.06, 110, 0.02);

      addTone(t, beatInBar === 0 ? 130 : 98, 0.15, 10, 0.22, 'triangle');
      addTone(t + beatSec / 2, beatInBar === 2 ? 110 : 92, 0.1, 12, 0.18, 'triangle');
    }

    const chordProg: number[][] = [
      [261.63, 329.63, 392.0],    // C
      [220.0, 277.18, 329.63],    // Am
      [246.94, 311.13, 369.99],   // Bdim-ish
      [196.0, 246.94, 293.66],    // G
    ];
    const barSec = beatSec * 4;
    const totalBars = Math.ceil(durationSec / barSec);

    for (let bar = 0; bar < totalBars; bar++) {
      const chord = chordProg[bar % chordProg.length];
      const barStart = bar * barSec;

      for (const f of chord) {
        addPad(barStart, f * 0.5, 0.05, barSec);
      }

      const arp = [chord[0], chord[1], chord[2], chord[1]];
      for (let step = 0; step < 8; step++) {
        const stepStart = barStart + step * (beatSec / 2);
        const f = arp[step % arp.length];
        addTone(stepStart, f * 2, 0.085, 9, 0.19, 'saw');
        if (step % 2 === 1) {
          addTone(stepStart + beatSec * 0.22, f * 3, 0.035, 13, 0.09, 'sine');
        }
      }
    }

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.max(-1, Math.min(1, data[i]));
    }

    this.buffer = buf;
  }

  // ----------------------------------------------------------
  playHitTone(note: Note, judgement: Judgement): void {
    if (judgement !== 'PERFECT' && judgement !== 'GOOD') return;

    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    const base = this.resolveNoteFrequency(note);
    const freq = note.type === 'SWIPE' ? base * 0.75 : base;
    const attack = judgement === 'PERFECT' ? 0.006 : 0.01;
    const release = note.type === 'SWIPE' ? 0.2 : 0.14;

    osc.type = note.type === 'SWIPE' ? 'triangle' : 'sine';
    osc.frequency.value = freq;

    filter.type = 'lowpass';
    filter.frequency.value = note.type === 'SWIPE' ? 1400 : 2200;
    filter.Q.value = note.type === 'SWIPE' ? 1.8 : 0.9;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.23, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + release + 0.02);
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

  private resolveNoteFrequency(note: Note): number {
    const hash = this.hashNoteId(note.id);
    const xIndex = Math.max(0, Math.min(this.noteScaleHz.length - 1, Math.floor(note.x * this.noteScaleHz.length)));
    const gestureOffset = note.required_gesture === 'ROCK'
      ? 0
      : note.required_gesture === 'SCISSORS'
        ? 2
        : 4;
    const idx = (hash + xIndex + gestureOffset) % this.noteScaleHz.length;

    return this.noteScaleHz[idx];
  }

  private hashNoteId(id: string): number {
    let value = 0;
    for (let i = 0; i < id.length; i++) {
      value = (value * 33 + id.charCodeAt(i)) >>> 0;
    }
    return value;
  }
}
