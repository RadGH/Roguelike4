import { describe, expect, it } from 'vitest'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import { Rng } from '../core/rng'
import { moveIntent, playIntermission, useActives } from './policy'
import { TICK_RATE } from '../core/sim'
import { buildRunRecord } from './history'

const registry = loadContent()

describe('run history records', () => {
  it('a finished run keeps its full build and complete damage attribution', () => {
    const run = new Run(registry, { seed: 500, playerCount: 1, actId: 'act1', classIds: ['student'] })
    const rng = new Rng(500 ^ 0x9a17)
    let guard = 0
    while (run.phase !== 'victory' && run.phase !== 'defeat' && guard++ < 40) {
      let ticks = 0
      while (run.phase === 'arena' && ticks++ < TICK_RATE * 300) {
        for (const p of run.sim.state.players) {
          if (!p.alive || p.downed) continue
          const i = moveIntent(run.sim, p, 0.6, rng)
          run.sim.setMoveIntent(p.id, i.x, i.y)
          useActives(run.sim, p, rng)
        }
        run.tick()
      }
      if (run.phase === 'recap') {
        run.proceedFromRecap()
        for (const p of run.sim.state.players) playIntermission(run, p.id)
      } else if (run.phase === 'arena') break
    }

    const record = buildRunRecord(run, '2026-08-31 12:00')
    expect(record.date).toBe('2026-08-31 12:00')
    expect(record.actId).toBe('act1')
    expect(record.endless).toBe(false)
    expect(['victory', 'defeat']).toContain(record.result)
    expect(record.waveReached).toBeGreaterThan(0)

    const p = record.players[0]
    expect(p.classId).toBe('student')
    expect(p.level).toBeGreaterThanOrEqual(1)
    expect(p.kills).toBeGreaterThan(0)
    expect(p.weapons.length).toBeGreaterThan(0) // the build survives retirement
    expect(p.sources.length).toBeGreaterThan(0)
    // Attribution is complete and consistent: sources sum to the total dealt
    // (both sides rounded, so allow rounding drift per source).
    const sourceSum = p.sources.reduce((a, [, v]) => a + v, 0)
    expect(Math.abs(sourceSum - p.dealt)).toBeLessThanOrEqual(p.sources.length)
    // Sorted descending — the screen reads "what carried this build" first.
    for (let i = 1; i < p.sources.length; i++) {
      expect(p.sources[i - 1][1]).toBeGreaterThanOrEqual(p.sources[i][1])
    }
    // The record is plain data: it survives a JSON round-trip unchanged.
    expect(JSON.parse(JSON.stringify(record))).toEqual(record)
  })
})
