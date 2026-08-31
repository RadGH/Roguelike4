import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function armedSim(weaponId: string, seed = 3): Sim {
  const sim = new Sim(registry, { seed, playerCount: 1 })
  sim.equipWeapon(0, weaponId)
  const p = sim.state.players[0]
  p.maxHealth = 100000
  p.health = 100000
  sim.startWave(quiet, 1)
  return sim
}

function spawnTanky(sim: Sim, count = 3): void {
  sim.state.wave.pendingSpawns.push({
    at: 0, enemy: 'brood-sac', remaining: count, spacing: 0, nextAt: 0, elite: null,
  })
  // Brood sacs are stationary and spawn on the boundary — pull them into
  // weapon range so appliers have a target that survives the hit.
  sim.tick()
  const p = sim.state.players[0]
  sim.state.enemies.forEach((e, i) => {
    if (e.defId !== 'brood-sac') return
    e.x = p.x + 1.2 + i * 0.8 // first one inside even melee range
    e.y = p.y
  })
}

describe('elements are effects, not damage types', () => {
  it('the ember wand sets enemies burning, with attributed burn damage', () => {
    const sim = armedSim('ember-wand')
    spawnTanky(sim)
    let sawBurn = false
    for (let i = 0; i < TICK_RATE * 60; i++) {
      sim.tick()
      if (sim.state.enemies.some((e) => e.burnTtl > 0)) sawBurn = true
    }
    expect(sawBurn).toBe(true)
    expect(sim.tracker.bySource(0).get('ember-wand') ?? 0).toBeGreaterThan(0)
    expect(sim.maxSimultaneousBurns).toBeGreaterThan(0)
  })

  it('a plain wand never burns — effects are authored, not automatic', () => {
    const sim = armedSim('practice-wand')
    spawnTanky(sim)
    for (let i = 0; i < TICK_RATE * 30; i++) {
      sim.tick()
      expect(sim.state.enemies.every((e) => e.burnTtl === 0)).toBe(true)
    }
  })

  it('chill slows movement with diminishing reapplication, never a stop', () => {
    const sim = armedSim('ice-shotgun')
    spawnTanky(sim, 1)
    for (let i = 0; i < TICK_RATE * 40; i++) {
      sim.tick()
      const chilled = sim.state.enemies.find((e) => e.chillTtl > 0)
      if (chilled) {
        expect(chilled.chillSlow).toBeGreaterThan(0)
        expect(chilled.chillSlow).toBeLessThanOrEqual(0.6)
      }
    }
    const e = sim.state.enemies[0]
    if (e && e.chillsApplied >= 2) {
      // Diminishing: the current slow is weaker than a first application.
      expect(e.chillSlow).toBeLessThan(0.4)
    }
  })

  it('shocked targets take amplified damage and lightning arcs off them', () => {
    const sim = armedSim('storm-javelin', 9)
    spawnTanky(sim, 3)
    let sawShock = false
    for (let i = 0; i < TICK_RATE * 60; i++) {
      sim.tick()
      if (sim.state.enemies.some((e) => e.shockTtl > 0)) { sawShock = true; break }
    }
    expect(sawShock).toBe(true)
    // Amplification: a shocked target takes 1.25x from any source.
    const target = sim.state.enemies.find((e) => e.shockTtl > 0)
    if (target) {
      const before = target.health
      sim['damageEnemy'](target, 10, 0, 'practice-sword', 'Melee')
      expect(before - target.health).toBeCloseTo(12.5, 1)
    }
  })

  it('the ignition charm makes any weapon a fire weapon', () => {
    const sim = armedSim('practice-sword', 11)
    sim.state.players[0].items.push('ignition-charm')
    // Slimes and their 5-health slimelings survive 4-damage sword hits, so
    // the on-hit applier gets many rolls (appliers never roll on lethal hits).
    sim.state.wave.pendingSpawns.push({
      at: 0, enemy: 'slime', remaining: 4, spacing: 0.5, nextAt: 0, elite: null,
    })
    let sawBurn = false
    for (let i = 0; i < TICK_RATE * 90; i++) {
      sim.tick()
      if (sim.state.enemies.some((e) => e.burnTtl > 0)) { sawBurn = true; break }
    }
    expect(sawBurn).toBe(true)
  })
})

describe('tranche-seven class mechanics', () => {
  it('poison stacks without limit and deals attributed damage', () => {
    const sim = new Sim(registry, { seed: 70, playerCount: 1, classIds: ['toxicologist'] })
    sim.equipWeapon(0, 'throwing-stars')
    const p = sim.state.players[0]
    p.maxHealth = 100000
    p.health = 100000
    sim.startWave(quiet, 1)
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'kingslime-t1', remaining: 1, spacing: 0, nextAt: 0, elite: null })
    let maxStack = 0
    for (let i = 0; i < TICK_RATE * 60; i++) {
      sim.tick()
      for (const e of sim.state.enemies) maxStack = Math.max(maxStack, e.poisonDps)
    }
    expect(maxStack).toBeGreaterThan(1) // stacked beyond one application
    expect(sim.tracker.bySource(0).get('throwing-stars') ?? 0).toBeGreaterThan(0)
  })

  it('the necromancer raises temporary allies from kills, and they expire', () => {
    const sim = new Sim(registry, { seed: 71, playerCount: 1, classIds: ['necromancer'] })
    sim.equipWeapon(0, 'practice-wand')
    const p = sim.state.players[0]
    p.maxHealth = 100000
    p.health = 100000
    sim.startWave(quiet, 1)
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 40, spacing: 0.2, nextAt: 0, elite: null })
    let sawRisen = false
    for (let i = 0; i < TICK_RATE * 120; i++) {
      sim.tick()
      if (sim.state.pets.some((pet) => pet.defId === 'risen')) sawRisen = true
      if (sawRisen && sim.state.enemies.length === 0 && sim.state.wave.pendingSpawns.length === 0) break
    }
    expect(sawRisen).toBe(true)
    // Risen expire: run the clock with nothing to kill.
    for (let i = 0; i < TICK_RATE * 14; i++) sim.tick()
    expect(sim.state.pets.filter((pet) => pet.defId === 'risen').length).toBe(0)
  })
})
