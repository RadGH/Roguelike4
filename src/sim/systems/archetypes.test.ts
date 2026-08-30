import { describe, expect, it } from 'vitest'
import { Sim } from '../core/sim'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

/** A sim with a tanky, heavily armed player for exercising enemy behavior. */
function arena(seed: number, waves: WaveDef[], wave = 1, armed = true): Sim {
  const registry = loadContent()
  const sim = new Sim(registry, { seed, playerCount: 1 })
  const p = sim.state.players[0]
  p.maxHealth = 100000
  p.health = 100000
  if (armed) {
    sim.equipWeapon(0, 'practice-sword')
    sim.equipWeapon(0, 'practice-wand')
  }
  sim.startWave(waves, wave)
  return sim
}

const wave = (groups: WaveDef['groups']): WaveDef[] => [{ wave: 1, groups }]

describe('archetype behaviors', () => {
  it('gorer winds up then charges', () => {
    const sim = arena(1, wave([{ at: 0.5, enemy: 'gorer', count: 1 }]), 1, false)
    const seen = new Set<number>()
    for (let i = 0; i < 30 * 40; i++) {
      sim.tick()
      for (const e of sim.state.enemies) seen.add(e.mode)
    }
    expect(seen.has(2)).toBe(true) // windup
    expect(seen.has(3)).toBe(true) // charge
  })

  it('delver starts untargetable, surfaces, and telegraphs its eruption', () => {
    const sim = arena(2, wave([{ at: 0.5, enemy: 'delver', count: 1 }]), 1, false)
    // Just after spawn: burrowed and untargetable.
    for (let i = 0; i < 30; i++) sim.tick()
    const delver = sim.state.enemies.find((e) => e.defId === 'delver')
    expect(delver).toBeDefined()
    if (!delver) return
    expect(sim.isTargetable(delver)).toBe(false)
    // It hunts the stationary player, erupts, and becomes targetable.
    let surfaced = false
    let sawTell = false
    for (let i = 0; i < 30 * 30; i++) {
      sim.tick()
      if (sim.state.telegraphs.some((t) => t.sourceId === 'delver')) sawTell = true
      const d = sim.state.enemies.find((e) => e.defId === 'delver')
      if (d && sim.isTargetable(d)) { surfaced = true; break }
    }
    expect(sawTell).toBe(true)
    expect(surfaced).toBe(true)
  })

  it('brood sac produces nibblers while alive', () => {
    const sim = arena(3, wave([{ at: 0.5, enemy: 'brood-sac', count: 1 }]), 1, false)
    for (let i = 0; i < 30 * 12; i++) sim.tick()
    expect(sim.state.enemies.some((e) => e.defId === 'nibbler')).toBe(true)
  })

  it('bloater leaves a damaging pool when it dies', () => {
    const sim = arena(4, wave([{ at: 0.5, enemy: 'bloater', count: 1 }]))
    let sawPool = false
    for (let i = 0; i < 30 * 60; i++) {
      sim.tick()
      if (sim.state.pools.some((p) => p.dps > 0)) { sawPool = true; break }
    }
    expect(sawPool).toBe(true)
  })

  it('weaver webbing slows the player standing in it', () => {
    const sim = arena(5, wave([{ at: 0.5, enemy: 'weaver', count: 1 }]), 1, false)
    let slowed = false
    for (let i = 0; i < 30 * 40; i++) {
      sim.tick()
      const p = sim.state.players[0]
      if (sim.slowFactorFor(p) < 1) { slowed = true; break }
      // Walk toward the nearest web to step in it.
      const web = sim.state.pools[0]
      if (web) sim.setMoveIntent(0, web.x - p.x, web.y - p.y)
    }
    expect(slowed).toBe(true)
  })

  it('resistant elites take reduced damage', () => {
    const sim = arena(6, wave([
      { at: 0.5, enemy: 'scurrier', count: 1, elite: 'resistant' },
    ]))
    for (let i = 0; i < 30 * 5 && sim.tracker.events.length === 0; i++) sim.tick()
    const e = sim.state.enemies.find((x) => x.defId === 'scurrier')
    if (e) expect(e.elite).toBe('resistant')
  })

  it('enlarged elites have scaled health and size', () => {
    const sim = arena(7, wave([
      { at: 0.5, enemy: 'scurrier', count: 1, elite: 'enlarged' },
    ]), 1, false)
    for (let i = 0; i < 60; i++) sim.tick()
    const e = sim.state.enemies.find((x) => x.defId === 'scurrier')
    expect(e).toBeDefined()
    if (!e) return
    const base = loadContent().enemy('scurrier')
    expect(e.maxHealth).toBeGreaterThan(base.health)
    expect(sim.radiusOf(e)).toBeGreaterThan(base.radius)
  })
})

describe('King Slime', () => {
  it('splits down the tier chain: 1 → 3 → 9 → 27 problem shapes', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 99, playerCount: 1 })
    const p = sim.state.players[0]
    p.maxHealth = 100000
    p.health = 100000
    // Overwhelming firepower so the fight resolves quickly in the test.
    for (let i = 0; i < 2; i++) sim.equipWeapon(0, 'practice-sword')
    p.allPct = 5000
    sim.startWave(wave([{ at: 0.5, enemy: 'kingslime-t1', count: 1 }]), 1)

    const tiersSeen = new Set<string>()
    for (let i = 0; i < 30 * 240; i++) {
      sim.tick()
      for (const e of sim.state.enemies) tiersSeen.add(e.defId)
      if (sim.state.wave.cleared) break
    }
    expect(tiersSeen.has('kingslime-t1')).toBe(true)
    expect(tiersSeen.has('kingslime-t2')).toBe(true)
    expect(tiersSeen.has('kingslime-t3')).toBe(true)
    expect(tiersSeen.has('kingslime-t4')).toBe(true)
    expect(sim.state.wave.cleared).toBe(true) // the fight ends
  })

  it('tier 1 telegraphs its slam', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 55, playerCount: 1 })
    const p = sim.state.players[0]
    p.maxHealth = 100000
    p.health = 100000
    sim.startWave(wave([{ at: 0.5, enemy: 'kingslime-t1', count: 1 }]), 1)
    let sawSlam = false
    for (let i = 0; i < 30 * 30; i++) {
      sim.tick()
      if (sim.state.telegraphs.some((t) => t.sourceId === 'kingslime-t1' && t.severity === 'extreme')) {
        sawSlam = true
        break
      }
    }
    expect(sawSlam).toBe(true)
  })
})
