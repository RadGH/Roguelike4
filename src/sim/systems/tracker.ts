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

export class Tracker {
  readonly events: DamageEvent[] = []
  /** playerId -> total damage dealt (fast HUD read). */
  private totals = new Map<number, number>()

  recordDamage(e: DamageEvent): void {
    this.events.push(e)
    this.totals.set(e.playerId, (this.totals.get(e.playerId) ?? 0) + e.amount)
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
