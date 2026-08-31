/**
 * Procedural audio: every sound is synthesized, no assets. Direction: light
 * and unobtrusive, and strictly informational — a cue exists only when it
 * reinforces something the player needs to notice (money, hurt, level, wave,
 * downs). Frequent events (every hit, every shot) are deliberately silent.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = localStorage.getItem('audio-muted') === '1'

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.35
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Call once from a user-gesture handler so the browser lets audio start. */
export function unlockAudio(): void {
  ensureContext()
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  localStorage.setItem('audio-muted', value ? '1' : '0')
}

interface Note {
  /** Frequency in Hz. */
  f: number
  /** Start offset in seconds. */
  at?: number
  /** Duration in seconds. */
  d?: number
  type?: OscillatorType
  /** Peak gain 0..1 relative to master. */
  g?: number
}

function play(notes: Note[]): void {
  if (muted) return
  const c = ensureContext()
  if (!c || !master) return
  const now = c.currentTime
  for (const n of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const at = now + (n.at ?? 0)
    const d = n.d ?? 0.1
    osc.type = n.type ?? 'triangle'
    osc.frequency.setValueAtTime(n.f, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(n.g ?? 0.5, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, at + d)
    osc.connect(gain)
    gain.connect(master)
    osc.start(at)
    osc.stop(at + d + 0.02)
  }
}

export const sound = {
  gold(): void {
    play([{ f: 1320, d: 0.06, type: 'square', g: 0.12 }, { f: 1760, at: 0.05, d: 0.07, type: 'square', g: 0.1 }])
  },
  xp(): void {
    play([{ f: 880, d: 0.08, type: 'sine', g: 0.12 }])
  },
  hurt(): void {
    play([{ f: 130, d: 0.15, type: 'sawtooth', g: 0.4 }, { f: 90, at: 0.03, d: 0.15, type: 'sawtooth', g: 0.3 }])
  },
  levelUp(): void {
    play([
      { f: 523, d: 0.1, g: 0.3 }, { f: 659, at: 0.09, d: 0.1, g: 0.3 },
      { f: 784, at: 0.18, d: 0.16, g: 0.35 },
    ])
  },
  waveClear(): void {
    play([
      { f: 392, d: 0.12, g: 0.3 }, { f: 494, at: 0.1, d: 0.12, g: 0.3 },
      { f: 587, at: 0.2, d: 0.2, g: 0.35 }, { f: 784, at: 0.32, d: 0.3, g: 0.3 },
    ])
  },
  down(): void {
    play([{ f: 220, d: 0.3, type: 'sawtooth', g: 0.35 }, { f: 110, at: 0.15, d: 0.4, type: 'sawtooth', g: 0.35 }])
  },
  revive(): void {
    play([{ f: 330, d: 0.12, g: 0.3 }, { f: 494, at: 0.1, d: 0.12, g: 0.3 }, { f: 659, at: 0.2, d: 0.2, g: 0.3 }])
  },
  purchase(): void {
    play([{ f: 988, d: 0.06, type: 'square', g: 0.15 }, { f: 1319, at: 0.06, d: 0.1, type: 'square', g: 0.15 }])
  },
  pick(): void {
    play([{ f: 660, d: 0.07, g: 0.2 }])
  },
  unlock(): void {
    play([
      { f: 784, d: 0.1, g: 0.25 }, { f: 988, at: 0.09, d: 0.1, g: 0.25 },
      { f: 1175, at: 0.18, d: 0.1, g: 0.25 }, { f: 1568, at: 0.27, d: 0.25, g: 0.3 },
    ])
  },
  useActive(): void {
    play([{ f: 440, d: 0.09, type: 'square', g: 0.18 }, { f: 550, at: 0.05, d: 0.09, type: 'square', g: 0.15 }])
  },
}
