// Procedural audio: every sound is synthesized live with the Web Audio API —
// no audio files anywhere. Whimsical chiptune palette to match the art:
// soft triangles and squares, gentle envelopes, a music box that improvises.
//
// The engine feeds sim events in; the browser's autoplay policy is handled by
// resuming the context on the first user gesture. Headless code never imports
// this module, so the sim stays deterministic and silent.

import { SAVE_SLUG } from '@game/branding';

type SfxName =
  | 'shoot'
  | 'swing'
  | 'enemyHit'
  | 'enemyDie'
  | 'playerHurt'
  | 'gold'
  | 'xp'
  | 'heart'
  | 'chest'
  | 'dash'
  | 'levelUp'
  | 'waveClear'
  | 'unlock'
  | 'snuffed'
  | 'victory'
  | 'uiClick'
  | 'block';

const STORAGE_KEY = `${SAVE_SLUG}.audio`;

// Pentatonic home rows per act — spring meadow up to the hushed palace
const ACT_SCALES: Record<number, number[]> = {
  1: [392, 440, 494, 587, 659], // G major pentatonic — sunny
  2: [349, 392, 440, 523, 587], // F — damp and friendly
  3: [330, 370, 415, 494, 554], // E — glassy cold
  4: [294, 330, 370, 440, 494], // D — velvet dark
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private act = 1;
  private lastPlayed = new Map<SfxName, number>();
  muted = false;

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) this.muted = JSON.parse(saved).muted === true;
    } catch {
      /* fresh start is fine */
    }
  }

  /** Create the context lazily; browsers demand a user gesture first. */
  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from any user gesture — unlocks the context and starts the music box. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && this.musicTimer === null) this.startMusic();
  }

  toggleMuted(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: this.muted }));
    } catch {
      /* private mode shrugs */
    }
    return this.muted;
  }

  setAct(act: number): void {
    this.act = act;
  }

  dispose(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------- synthesis helpers ----------

  private tone(
    freq: number,
    opts: {
      type?: OscillatorType;
      dur?: number;
      gain?: number;
      slide?: number; // multiply freq by this over the duration
      delay?: number;
      dest?: GainNode | null;
    } = {},
  ): void {
    const ctx = this.ctx;
    const dest = opts.dest ?? this.sfxGain;
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.dur ?? 0.12;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide && opts.slide !== 1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.25, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(opts: { dur?: number; gain?: number; freq?: number; delay?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const dur = opts.dur ?? 0.1;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = opts.freq ?? 900;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
  }

  // ---------- public SFX ----------

  /** Rate-limit chatty events so a crowd doesn't become a wall of clicks. */
  private gate(name: SfxName, minGapMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < minGapMs) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  play(name: SfxName): void {
    if (this.muted || !this.ensure()) return;
    switch (name) {
      case 'shoot':
        if (this.gate('shoot', 45)) this.tone(720 + Math.random() * 80, { type: 'square', dur: 0.06, gain: 0.07, slide: 0.8 });
        break;
      case 'swing':
        if (this.gate('swing', 70)) this.noise({ dur: 0.08, gain: 0.1, freq: 600 });
        break;
      case 'enemyHit':
        if (this.gate('enemyHit', 40)) this.tone(300 + Math.random() * 60, { type: 'square', dur: 0.05, gain: 0.08, slide: 0.7 });
        break;
      case 'enemyDie':
        if (this.gate('enemyDie', 60)) this.tone(500, { type: 'triangle', dur: 0.16, gain: 0.16, slide: 0.4 });
        break;
      case 'playerHurt':
        if (this.gate('playerHurt', 150)) {
          this.tone(180, { type: 'sawtooth', dur: 0.18, gain: 0.22, slide: 0.6 });
          this.noise({ dur: 0.1, gain: 0.12, freq: 300 });
        }
        break;
      case 'block':
        if (this.gate('block', 120)) this.tone(240, { type: 'square', dur: 0.07, gain: 0.14 });
        break;
      case 'gold':
        if (this.gate('gold', 35)) this.tone(1180 + Math.random() * 240, { dur: 0.09, gain: 0.09, slide: 1.3 });
        break;
      case 'xp':
        if (this.gate('xp', 50)) this.tone(880, { dur: 0.05, gain: 0.05, slide: 1.15 });
        break;
      case 'heart':
        this.tone(523, { dur: 0.12, gain: 0.16 });
        this.tone(659, { dur: 0.16, gain: 0.16, delay: 0.07 });
        break;
      case 'chest':
        this.tone(392, { dur: 0.1, gain: 0.15 });
        this.tone(587, { dur: 0.14, gain: 0.15, delay: 0.08 });
        break;
      case 'dash':
        if (this.gate('dash', 120)) this.noise({ dur: 0.12, gain: 0.1, freq: 1400 });
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { dur: 0.12, gain: 0.14, delay: i * 0.07 }));
        break;
      case 'waveClear':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, { dur: 0.16, gain: 0.15, delay: i * 0.09 }));
        break;
      case 'unlock':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, { dur: 0.1, gain: 0.12, delay: i * 0.05 }));
        break;
      case 'snuffed':
        this.tone(330, { type: 'sawtooth', dur: 0.5, gain: 0.2, slide: 0.5 });
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, { dur: 0.18, gain: 0.16, delay: i * 0.12 }));
        break;
      case 'uiClick':
        if (this.gate('uiClick', 40)) this.tone(660, { dur: 0.04, gain: 0.07 });
        break;
    }
  }

  // ---------- the music box ----------

  /** A tiny generative music box: pentatonic wandering with a heartbeat bass.
   *  Seeded by nothing — it's ambience, not simulation (determinism lives in the sim). */
  private startMusic(): void {
    const stepMs = 280; // ~107 BPM eighth notes, unhurried
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.ctx || !this.musicGain) return;
      const scale = ACT_SCALES[this.act] ?? ACT_SCALES[1]!;
      const step = this.musicStep++;
      // melody: wander the scale, resting often — a music box, not a concert
      if (step % 2 === 0 && Math.random() < 0.65) {
        const note = scale[Math.floor(Math.random() * scale.length)]!;
        const octave = Math.random() < 0.22 ? 2 : 1;
        this.tone(note * octave, { type: 'triangle', dur: 0.5, gain: 0.12, dest: this.musicGain });
      }
      // bass heartbeat on the downbeat
      if (step % 8 === 0) {
        this.tone(scale[0]! / 2, { type: 'sine', dur: 0.7, gain: 0.18, dest: this.musicGain });
      }
      // a soft fifth shimmer now and then
      if (step % 16 === 12) {
        this.tone(scale[3]!, { type: 'sine', dur: 0.9, gain: 0.07, dest: this.musicGain });
      }
    }, stepMs);
  }
}
