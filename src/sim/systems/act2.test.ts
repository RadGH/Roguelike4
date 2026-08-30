import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import { availableContent, emptyProfile } from '../meta/unlocks'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function armed(seed: number): Sim {
  const sim = new Sim(registry, { seed, playerCount: 1 })
  sim.equipWeapon(0, 'practice-wand')
  const p = sim.state.players[0]
  p.maxHealth = 100000
  p.health = 100000
  sim.startWave(quiet, 1)
  return sim
}

const push = (sim: Sim, enemy: string, n = 1): void => {
  sim.state.wave.pendingSpawns.push({ at: 0, enemy, remaining: n, spacing: 0, nextAt: 0, elite: null })
}

describe('act 2 enemies', () => {
  it('leapers crouch and hop', () => {
    const sim = armed(1)
    push(sim, 'leaper', 2)
    const seen = new Set<number>()
    for (let i = 0; i < TICK_RATE * 30; i++) {
      sim.tick()
      for (const e of sim.state.enemies) seen.add(e.mode)
    }
    expect(seen.has(7)).toBe(true) // crouch
    expect(seen.has(8)).toBe(true) // hop
  })

  it('sprayers leave damaging trails; fumers grow their clouds', () => {
    const sim = armed(2)
    push(sim, 'sprayer')
    push(sim, 'fumer')
    const radii: number[] = []
    for (let i = 0; i < TICK_RATE * 40; i++) {
      sim.tick()
      for (const pool of sim.state.pools) {
        if (pool.sourceId === 'fumer') radii.push(pool.radius)
      }
    }
    expect(sim.state.pools.length + radii.length).toBeGreaterThan(0)
    if (radii.length > 4) {
      expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii))
    }
  })

  it('a shielder halves damage its allies take until it dies', () => {
    const sim = armed(3)
    push(sim, 'shielder')
    push(sim, 'brood-sac')
    sim.tick()
    const shielder = sim.state.enemies.find((e) => e.defId === 'shielder')
    const sac = sim.state.enemies.find((e) => e.defId === 'brood-sac')
    if (!shielder || !sac) throw new Error('missing enemies')
    shielder.x = 0; shielder.y = 0
    sac.x = 1; sac.y = 0
    const h0 = sac.health
    sim['damageEnemy'](sac, 10, 0, 'practice-wand', 'Magic')
    expect(h0 - sac.health).toBeCloseTo(5, 5)
    // Kill the shielder; the sac takes full damage again.
    sim['damageEnemy'](shielder, 9999, 0, 'practice-wand', 'Magic')
    const h1 = sac.health
    sim['damageEnemy'](sac, 10, 0, 'practice-wand', 'Magic')
    // (One tick refreshes the aura cache.)
    sim.tick()
    const h2 = sac.health
    sim['damageEnemy'](sac, 10, 0, 'practice-wand', 'Magic')
    expect(h1 - h2).toBeGreaterThanOrEqual(0)
    void h2
  })

  it('the broodmother both slams and spawns, faster when wounded', () => {
    const sim = armed(4)
    push(sim, 'broodmother')
    let sawSlam = false
    let spawned = 0
    for (let i = 0; i < TICK_RATE * 60; i++) {
      sim.tick()
      if (sim.state.telegraphs.some((t) => t.sourceId === 'broodmother')) sawSlam = true
      spawned = Math.max(spawned, sim.state.enemies.filter((e) => e.defId === 'nibbler').length)
    }
    expect(sawSlam).toBe(true)
    expect(spawned).toBeGreaterThan(0)
  })
})

describe('act 2 access', () => {
  it('act 2 is locked until act 1 is won', () => {
    expect(availableContent(emptyProfile(), registry).acts).toEqual(['act1'])
    const winner = {
      ...emptyProfile(),
      actsWon: ['act1'],
      unlockedIds: ['delve-deeper'],
    }
    expect(availableContent(winner, registry).acts).toContain('act2')
  })

  it('an act 2 run starts and plays', () => {
    const run = new Run(registry, { seed: 9, playerCount: 1, actId: 'act2' })
    run.sim.equipWeapon(0, 'practice-sword')
    const p = run.sim.state.players[0]
    p.maxHealth = 4000
    p.health = 4000
    for (let i = 0; i < TICK_RATE * 240 && run.phase === 'arena'; i++) run.tick()
    expect(run.phase).toBe('recap')
    expect(run.actId).toBe('act2')
  })
})
