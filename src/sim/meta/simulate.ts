import { Rng } from '../core/rng'
import { TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import { moveIntent, playIntermission, useActives } from './policy'

/**
 * Batch run simulator. Plays full runs headlessly with the policy players,
 * then aggregates the questions worth asking: where do runs end, does the
 * build curve arrive on time, does the economy work, what dominates damage.
 */

export interface SimulateOptions {
  runs: number
  players: number
  skill: number
  /** Base seed; run i uses seed base + i, so batches are reproducible. */
  seed: number
  classIds?: string[]
}

export interface RunOutcome {
  seed: number
  won: boolean
  waveReached: number
  /** Simulated seconds of arena time. */
  duration: number
  kills: number
  finalLevels: number[]
  firstWeaponBuyWave: number | null
  goldEarned: number
}

export interface BatchReport {
  options: SimulateOptions
  outcomes: RunOutcome[]
  winRate: number
  deathWaveHistogram: Record<number, number>
  avgDurationMin: number
  avgKills: number
  damageBySource: [string, number][]
  avgFirstWeaponBuyWave: number | null
}

export function simulateOne(opts: { seed: number; players: number; skill: number; classIds?: string[] }): RunOutcome {
  const registry = loadContent()
  const run = new Run(registry, {
    seed: opts.seed,
    playerCount: opts.players,
    actId: 'act1',
    classIds: opts.classIds,
  })
  const policyRng = new Rng(opts.seed ^ 0x9a17)
  let firstBuyWave: number | null = null
  const goldBaseline = run.sim.state.players.map((p) => p.gold)

  let guard = 0
  while (run.phase !== 'victory' && run.phase !== 'defeat' && guard < 40) {
    guard++
    // Play the arena.
    let ticks = 0
    while (run.phase === 'arena' && ticks < TICK_RATE * 300) {
      ticks++
      for (const p of run.sim.state.players) {
        if (!p.alive || p.downed) continue
        const intent = moveIntent(run.sim, p, opts.skill, policyRng)
        run.sim.setMoveIntent(p.id, intent.x, intent.y)
        useActives(run.sim, p, policyRng)
      }
      run.tick()
    }
    if (run.phase === 'recap') {
      run.proceedFromRecap()
      for (const p of run.sim.state.players) {
        const before = p.weapons.length
        playIntermission(run, p.id)
        if (firstBuyWave === null && p.weapons.length > before) {
          firstBuyWave = run.sim.state.wave.number
        }
      }
    } else if (run.phase === 'arena') {
      break // stalled wave (should not happen; guard against infinite loops)
    }
  }

  const kills = run.sim.state.players.reduce((a, p) => a + run.sim.tracker.killsFor(p.id), 0)
  const goldEarned = run.sim.state.players.reduce((a, p, i) => a + (p.gold - goldBaseline[i]), 0)
  return {
    seed: opts.seed,
    won: run.phase === 'victory',
    waveReached: run.sim.state.wave.number,
    duration: run.sim.state.time,
    kills,
    finalLevels: run.sim.state.players.map((p) => p.level),
    firstWeaponBuyWave: firstBuyWave,
    goldEarned,
  }
}

export function simulateBatch(opts: SimulateOptions): BatchReport {
  const outcomes: RunOutcome[] = []
  const damage = new Map<string, number>()

  for (let i = 0; i < opts.runs; i++) {
    const seed = opts.seed + i
    outcomes.push(simulateOne({ seed, players: opts.players, skill: opts.skill, classIds: opts.classIds }))
  }

  // Re-run one representative seed to collect a damage-by-source profile
  // (cheaper than accumulating across every run, close enough for shares).
  {
    const registry = loadContent()
    const run = new Run(registry, { seed: opts.seed, playerCount: opts.players, actId: 'act1', classIds: opts.classIds })
    const policyRng = new Rng(opts.seed ^ 0x9a17)
    let guard = 0
    while (run.phase !== 'victory' && run.phase !== 'defeat' && guard < 40) {
      guard++
      let ticks = 0
      while (run.phase === 'arena' && ticks < TICK_RATE * 300) {
        ticks++
        for (const p of run.sim.state.players) {
          if (!p.alive || p.downed) continue
          const intent = moveIntent(run.sim, p, opts.skill, policyRng)
          run.sim.setMoveIntent(p.id, intent.x, intent.y)
          useActives(run.sim, p, policyRng)
        }
        run.tick()
      }
      if (run.phase === 'recap') {
        run.proceedFromRecap()
        for (const p of run.sim.state.players) playIntermission(run, p.id)
      } else if (run.phase === 'arena') break
    }
    for (const p of run.sim.state.players) {
      for (const [source, amount] of run.sim.tracker.bySource(p.id)) {
        damage.set(source, (damage.get(source) ?? 0) + amount)
      }
    }
  }

  const hist: Record<number, number> = {}
  for (const o of outcomes) {
    if (!o.won) hist[o.waveReached] = (hist[o.waveReached] ?? 0) + 1
  }
  const buys = outcomes.filter((o) => o.firstWeaponBuyWave !== null)
  return {
    options: opts,
    outcomes,
    winRate: outcomes.filter((o) => o.won).length / outcomes.length,
    deathWaveHistogram: hist,
    avgDurationMin: outcomes.reduce((a, o) => a + o.duration, 0) / outcomes.length / 60,
    avgKills: outcomes.reduce((a, o) => a + o.kills, 0) / outcomes.length,
    damageBySource: [...damage.entries()].sort((a, b) => b[1] - a[1]),
    avgFirstWeaponBuyWave: buys.length > 0
      ? buys.reduce((a, o) => a + (o.firstWeaponBuyWave ?? 0), 0) / buys.length
      : null,
  }
}

export function formatReport(r: BatchReport): string {
  const lines: string[] = []
  lines.push(`runs=${r.options.runs} players=${r.options.players} skill=${r.options.skill}`)
  lines.push(`win rate: ${(r.winRate * 100).toFixed(0)}%`)
  lines.push(`avg duration: ${r.avgDurationMin.toFixed(1)} min arena time`)
  lines.push(`avg kills: ${r.avgKills.toFixed(0)}`)
  lines.push(`avg wave of first weapon purchase: ${r.avgFirstWeaponBuyWave?.toFixed(1) ?? 'never'}`)
  lines.push('death wave histogram:')
  for (let w = 1; w <= 10; w++) {
    const n = r.deathWaveHistogram[w] ?? 0
    lines.push(`  wave ${String(w).padStart(2)}: ${'#'.repeat(n)}${n > 0 ? ` ${n}` : ''}`)
  }
  lines.push('damage by source (representative run):')
  const total = r.damageBySource.reduce((a, [, v]) => a + v, 0)
  for (const [source, amount] of r.damageBySource.slice(0, 10)) {
    lines.push(`  ${source.padEnd(16)} ${((amount / total) * 100).toFixed(1)}%`)
  }
  return lines.join('\n')
}
