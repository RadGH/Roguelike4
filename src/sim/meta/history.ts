import type { Run } from '../run/run'

/**
 * Run history records — the vault's "retired characters remain viewable"
 * rule (Progression and Meta): a finished run keeps its BUILD (class,
 * weapons, items, perks) and its FULL damage attribution, because the
 * history screen is where an accident becomes knowledge.
 *
 * Pure builder: the app supplies the timestamp (the sim is clock-free).
 */

export interface RunRecordPlayer {
  id: number
  classId: string
  level: number
  kills: number
  dealt: number
  taken: number
  weapons: { id: string; tier: number }[]
  items: string[]
  perks: { perkId: string; tier: number }[]
  /** [sourceId, amount] sorted desc — complete, not top-N. */
  sources: [string, number][]
}

export interface RunRecord {
  date: string
  actId: string
  endless: boolean
  result: 'victory' | 'defeat'
  waveReached: number
  players: RunRecordPlayer[]
}

export function buildRunRecord(run: Run, date: string): RunRecord {
  const sim = run.sim
  return {
    date,
    actId: run.actId,
    endless: run.endless,
    result: run.phase === 'victory' ? 'victory' : 'defeat',
    waveReached: sim.state.wave.number,
    players: sim.state.players.map((p) => ({
      id: p.id,
      classId: p.classId,
      level: p.level,
      kills: sim.tracker.killsFor(p.id),
      dealt: Math.round(sim.tracker.totalFor(p.id)),
      taken: Math.round(sim.tracker.takenSummary(p.id).taken),
      weapons: p.weapons.map((w) => ({ id: w.defId, tier: w.tier })),
      items: [...p.items],
      perks: p.perks.map((perk) => ({ perkId: perk.perkId, tier: perk.tier })),
      sources: [...sim.tracker.bySource(p.id).entries()]
        .map(([k, v]) => [k, Math.round(v)] as [string, number])
        .sort((a, b) => b[1] - a[1]),
    })),
  }
}
