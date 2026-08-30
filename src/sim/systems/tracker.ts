/**
 * Damage attribution tracker. A design feature, not a debug tool: it is what
 * turns an accidental build into a noticed build. Everything that deals or
 * mitigates damage reports here, keyed so views can drill down
 * run → player → source → target.
 *
 * Aggregates are maintained incrementally so they can be saved with a run and
 * restored after a reload. Raw events are kept for live drill-down but are
 * not persisted (a full run generates far too many).
 */

export interface DamageEvent {
  tick: number
  /** Wave the event happened in, for per-wave recaps. */
  wave: number
  playerId: number
  /** Content id of the source (weapon, item, effect). */
  sourceId: string
  targetId: string
  amount: number
  kill: boolean
}

/** Damage the player received (or avoided) — mitigation is tracked, not lost. */
export interface TakenEvent {
  tick: number
  wave: number
  playerId: number
  /** What hit them (enemy def id, telegraph source, hazard id). */
  sourceId: string
  /** Raw amount before defenses. */
  amount: number
  /** What actually landed. */
  taken: number
  mitigated: number
  dodged: boolean
}

interface TakenTotals { taken: number; mitigated: number; dodges: number }
interface WaveTotals { kills: number; dealt: number; taken: number }

export interface TrackerSnapshot {
  dealtTotal: [number, number][]
  dealtBySource: [string, number][]
  takenTotals: [number, TakenTotals][]
  waveTotals: [string, WaveTotals][]
}

const MAX_RAW_EVENTS = 20000

export class Tracker {
  readonly events: DamageEvent[] = []
  readonly takenEvents: TakenEvent[] = []
  private dealtTotal = new Map<number, number>()
  /** key `${playerId}:${sourceId}` */
  private dealtBySource = new Map<string, number>()
  private takenTotals = new Map<number, TakenTotals>()
  /** key `${playerId}:${wave}` */
  private waveTotals = new Map<string, WaveTotals>()

  recordDamage(e: DamageEvent): void {
    this.events.push(e)
    if (this.events.length > MAX_RAW_EVENTS) this.events.splice(0, 5000)
    this.dealtTotal.set(e.playerId, (this.dealtTotal.get(e.playerId) ?? 0) + e.amount)
    const sk = `${e.playerId}:${e.sourceId}`
    this.dealtBySource.set(sk, (this.dealtBySource.get(sk) ?? 0) + e.amount)
    const wk = `${e.playerId}:${e.wave}`
    const w = this.waveTotals.get(wk) ?? { kills: 0, dealt: 0, taken: 0 }
    w.dealt += e.amount
    if (e.kill) w.kills++
    this.waveTotals.set(wk, w)
  }

  recordTaken(e: TakenEvent): void {
    this.takenEvents.push(e)
    if (this.takenEvents.length > MAX_RAW_EVENTS) this.takenEvents.splice(0, 5000)
    const t = this.takenTotals.get(e.playerId) ?? { taken: 0, mitigated: 0, dodges: 0 }
    t.taken += e.taken
    t.mitigated += e.mitigated
    if (e.dodged) t.dodges++
    this.takenTotals.set(e.playerId, t)
    const wk = `${e.playerId}:${e.wave}`
    const w = this.waveTotals.get(wk) ?? { kills: 0, dealt: 0, taken: 0 }
    w.taken += e.taken
    this.waveTotals.set(wk, w)
  }

  totalFor(playerId: number): number {
    return this.dealtTotal.get(playerId) ?? 0
  }

  /** Damage grouped by source for one player — the "where did my damage come from" view. */
  bySource(playerId: number): Map<string, number> {
    const out = new Map<string, number>()
    const prefix = `${playerId}:`
    for (const [key, amount] of this.dealtBySource) {
      if (key.startsWith(prefix)) out.set(key.slice(prefix.length), amount)
    }
    return out
  }

  /** Per-wave recap numbers for one player. */
  waveSummary(playerId: number, wave: number): WaveTotals {
    return this.waveTotals.get(`${playerId}:${wave}`) ?? { kills: 0, dealt: 0, taken: 0 }
  }

  /** Totals of damage taken/mitigated/dodge count for one player. */
  takenSummary(playerId: number): TakenTotals {
    return this.takenTotals.get(playerId) ?? { taken: 0, mitigated: 0, dodges: 0 }
  }

  /** Highest team kill total in any single wave (for behavioral unlocks). */
  bestTeamWaveKills(): number {
    const perWave = new Map<number, number>()
    for (const [key, w] of this.waveTotals) {
      const wave = Number(key.split(':')[1])
      perWave.set(wave, (perWave.get(wave) ?? 0) + w.kills)
    }
    let best = 0
    for (const v of perWave.values()) best = Math.max(best, v)
    return best
  }

  killsFor(playerId: number): number {
    let kills = 0
    const prefix = `${playerId}:`
    for (const [key, w] of this.waveTotals) {
      if (key.startsWith(prefix)) kills += w.kills
    }
    return kills
  }

  snapshot(): TrackerSnapshot {
    return {
      dealtTotal: [...this.dealtTotal.entries()],
      dealtBySource: [...this.dealtBySource.entries()],
      takenTotals: [...this.takenTotals.entries()].map(([k, v]) => [k, { ...v }]),
      waveTotals: [...this.waveTotals.entries()].map(([k, v]) => [k, { ...v }]),
    }
  }

  restore(snap: TrackerSnapshot): void {
    this.dealtTotal = new Map(snap.dealtTotal)
    this.dealtBySource = new Map(snap.dealtBySource)
    this.takenTotals = new Map(snap.takenTotals.map(([k, v]) => [k, { ...v }]))
    this.waveTotals = new Map(snap.waveTotals.map(([k, v]) => [k, { ...v }]))
    this.events.length = 0
    this.takenEvents.length = 0
  }
}
