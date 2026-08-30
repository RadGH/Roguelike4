/**
 * Damage attribution tracker. A design feature, not a debug tool: it is what
 * turns an accidental build into a noticed build. Everything that deals or
 * mitigates damage reports here, keyed so views can drill down
 * run → player → source → target.
 */

export interface DamageEvent {
  tick: number
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

export class Tracker {
  readonly events: DamageEvent[] = []
  readonly takenEvents: TakenEvent[] = []
  /** playerId -> total damage dealt (fast HUD read). */
  private totals = new Map<number, number>()

  recordDamage(e: DamageEvent): void {
    this.events.push(e)
    this.totals.set(e.playerId, (this.totals.get(e.playerId) ?? 0) + e.amount)
  }

  recordTaken(e: TakenEvent): void {
    this.takenEvents.push(e)
  }

  /** Totals of damage taken/mitigated/dodge count for one player. */
  takenSummary(playerId: number): { taken: number; mitigated: number; dodges: number } {
    let taken = 0
    let mitigated = 0
    let dodges = 0
    for (const e of this.takenEvents) {
      if (e.playerId !== playerId) continue
      taken += e.taken
      mitigated += e.mitigated
      if (e.dodged) dodges++
    }
    return { taken, mitigated, dodges }
  }

  totalFor(playerId: number): number {
    return this.totals.get(playerId) ?? 0
  }

  /** Damage grouped by source for one player — the "where did my damage come from" view. */
  bySource(playerId: number): Map<string, number> {
    const out = new Map<string, number>()
    for (const e of this.events) {
      if (e.playerId !== playerId) continue
      out.set(e.sourceId, (out.get(e.sourceId) ?? 0) + e.amount)
    }
    return out
  }
}
