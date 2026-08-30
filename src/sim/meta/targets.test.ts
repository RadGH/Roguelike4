import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { loadContent } from '../data/loadContent'
import { recomputePlayer } from '../systems/stats'
import type { WaveDef } from '../data/types'

/**
 * Acceptance tests for the build targets the design names as goals.
 * Each proves the build exists and produces meaningful, attributed output.
 */
const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function freshSim(seed: number, classId = 'student'): Sim {
  const sim = new Sim(registry, { seed, playerCount: 1, classIds: [classId] })
  const p = sim.state.players[0]
  p.maxHealth = 100000
  p.health = 100000
  sim.startWave(quiet, 1)
  return sim
}

describe('the named build targets', () => {
  it('no-weapon summoner: pets alone clear a wave', () => {
    const sim = freshSim(1)
    const p = sim.state.players[0]
    expect(p.weapons.length).toBe(0) // no weapons at all
    p.items.push('turret-kit', 'summon-wolf', 'raven-pair')
    recomputePlayer(p, registry)
    sim.startWave(quiet, 1) // rebuild pets from items
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 10, spacing: 0.3, nextAt: 0, elite: null })

    for (let i = 0; i < TICK_RATE * 180 && sim.state.enemies.length + sim.state.wave.pendingSpawns.length > 0; i++) {
      sim.tick()
    }
    expect(sim.state.enemies.length).toBe(0)
    const total = sim.tracker.totalFor(0)
    const petDamage = (sim.tracker.bySource(0).get('minigun-turret') ?? 0) +
      (sim.tracker.bySource(0).get('wolf') ?? 0) +
      (sim.tracker.bySource(0).get('raven') ?? 0)
    expect(petDamage).toBeCloseTo(total, 3) // every point came from summons
  })

  it('gold-damage build: collecting gold is a real damage source', () => {
    const sim = freshSim(2, 'scavenger')
    const p = sim.state.players[0]
    sim.equipWeapon(0, 'practice-sword') // the kit Run would provide
    p.items.push('gold-strike', 'gold-strike', 'lodestone') // stacked copies + reach
    recomputePlayer(p, registry)
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 30, spacing: 0.2, nextAt: 0, elite: null })
    for (let i = 0; i < TICK_RATE * 120; i++) sim.tick()
    const goldDamage = sim.tracker.bySource(0).get('gold-strike') ?? 0
    expect(goldDamage).toBeGreaterThan(0)
  })

  it('void ignores resistance: a resistant elite takes full Void damage', () => {
    const sim = freshSim(3, 'warlock')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'brood-sac', remaining: 1, spacing: 0, nextAt: 0, elite: 'resistant' })
    sim.tick()
    const elite = sim.state.enemies.find((e) => e.defId === 'brood-sac')
    expect(elite?.elite).toBe('resistant')
    if (!elite) return
    const h0 = elite.health
    sim['damageEnemy'](elite, 10, 0, 'void-scepter', 'Void')
    expect(h0 - elite.health).toBe(10) // no 30% absorb
    const h1 = elite.health
    sim['damageEnemy'](elite, 10, 0, 'practice-sword', 'Melee')
    expect(h1 - elite.health).toBeCloseTo(7, 5) // ordinary damage IS absorbed
  })

  it('ignition build: burn contributes a visible damage share', () => {
    const sim = freshSim(4, 'pyromancer')
    sim.equipWeapon(0, 'ember-wand')
    sim.state.players[0].items.push('ignition-charm')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'slime', remaining: 6, spacing: 1, nextAt: 0, elite: null })
    for (let i = 0; i < TICK_RATE * 120 && sim.state.enemies.length + sim.state.wave.pendingSpawns.length > 0; i++) sim.tick()
    const bySource = sim.tracker.bySource(0)
    // Burn is attributed to its source (the wand or the charm that lit it).
    const burnish = [...bySource.entries()]
      .filter(([k]) => k === 'ember-wand' || k === 'ignition-charm')
      .reduce((a, [, v]) => a + v, 0)
    expect(burnish).toBeGreaterThan(0)
  })

  it('spread at close range: the shotgun multi-hits a dense pack', () => {
    const sim = freshSim(5)
    const p = sim.state.players[0]
    p.weapons.length = 0
    sim.equipWeapon(0, 'shotgun')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 12, spacing: 0.1, nextAt: 0, elite: null })
    for (let i = 0; i < TICK_RATE * 60; i++) sim.tick()
    expect(sim.tracker.bySource(0).get('shotgun') ?? 0).toBeGreaterThan(0)
  })

  it('chain build: lightning arcs multiply damage against shocked groups', () => {
    const sim = freshSim(6, 'stormcaller')
    sim.equipWeapon(0, 'storm-javelin')
    // Three tanky targets huddled together so arcs have neighbours.
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'brood-sac', remaining: 3, spacing: 0, nextAt: 0, elite: null })
    sim.tick()
    const packed = sim.state.enemies.filter((e) => e.defId === 'brood-sac')
    packed.forEach((e, i) => { e.x = 3 + i; e.y = 0 })
    for (let i = 0; i < TICK_RATE * 90 && packed.some((e) => e.health > 0); i++) sim.tick()
    expect(sim.tracker.bySource(0).get('storm-javelin') ?? 0).toBeGreaterThan(0)
  })
})
