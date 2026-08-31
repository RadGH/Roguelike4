import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

const push = (sim: Sim, enemy: string, n = 1): void => {
  sim.state.wave.pendingSpawns.push({ at: 0, enemy, remaining: n, spacing: 0, nextAt: 0, elite: null })
}

describe('tranche-nine classes', () => {
  it('the shaman plants a totem that deals Magic damage and expires', () => {
    const run = new Run(registry, { seed: 200, playerCount: 1, actId: 'act1', classIds: ['shaman'] })
    const sim = run.sim
    const p = sim.state.players[0]
    p.maxHealth = 100000; p.health = 100000
    expect(p.equipment.some((slot) => slot.defId === 'summon-totem')).toBe(true)
    push(sim, 'brood-sac', 1)
    sim.tick()
    const sac = sim.state.enemies[0]
    sac.x = p.x + 2; sac.y = p.y
    sim.useEquipment(0)
    expect(sim.state.pets.some((pet) => pet.defId === 'totem')).toBe(true)
    for (let i = 0; i < TICK_RATE * 5; i++) sim.tick()
    expect(sim.tracker.bySource(0).get('totem') ?? 0).toBeGreaterThan(0)
    // Expiry: after its 10 seconds the totem is gone.
    for (let i = 0; i < TICK_RATE * 7; i++) sim.tick()
    expect(sim.state.pets.some((pet) => pet.defId === 'totem')).toBe(false)
  })

  it('a plain carrier keeps an aura to themselves; the bard shares it wide', () => {
    const setup = (classId: string): Sim => {
      const sim = new Sim(registry, { seed: 201, playerCount: 2, classIds: [classId, 'student'] })
      const [carrier, ally] = sim.state.players
      carrier.items.push('war-banner')
      carrier.maxHealth = 100000; carrier.health = 100000
      ally.maxHealth = 100000; ally.health = 100000
      sim.startWave(quiet, 1)
      carrier.x = 0; carrier.y = 0
      ally.x = 3; ally.y = 0 // inside radius 5 (and the bard's 7.5)
      sim.tick()
      return sim
    }
    const plain = setup('student')
    expect(plain.state.players[0].auraAllPct).toBe(8) // carrier always benefits
    expect(plain.state.players[1].auraAllPct).toBe(0) // ally does not

    const bard = setup('bard')
    // (Bare Sim skips startingItems, so only the pushed banner is in play.)
    expect(bard.state.players[0].auraAllPct).toBe(8)
    expect(bard.state.players[1].auraAllPct).toBe(8) // the ally hears it too
    // Walk the ally out of reach: the aura is a place, not a buff icon.
    bard.state.players[1].x = 20
    bard.tick()
    expect(bard.state.players[1].auraAllPct).toBe(0)
  })

  it('mortar shells splash, and the bombardier leaves fire where they land', () => {
    const sim = new Sim(registry, { seed: 202, playerCount: 1, classIds: ['bombardier'] })
    sim.equipWeapon(0, 'mortar')
    const p = sim.state.players[0]
    p.maxHealth = 100000; p.health = 100000
    sim.startWave(quiet, 1)
    push(sim, 'brood-sac', 3)
    sim.tick()
    // Cluster three sacs inside one blast radius, in mortar range.
    sim.state.enemies.forEach((e, i) => { e.x = p.x + 5 + (i % 2) * 0.8; e.y = p.y + Math.floor(i / 2) * 0.8 })
    let hitAtOnce = 0
    let sawOwnPool = false
    for (let i = 0; i < TICK_RATE * 12; i++) {
      const before = sim.state.enemies.map((e) => e.health)
      sim.tick()
      const hurtNow = sim.state.enemies.filter((e, j) => e.health < before[j]).length
      hitAtOnce = Math.max(hitAtOnce, hurtNow)
      if (sim.state.pools.some((pool) => pool.ownerId === 0 && pool.sourceId === 'mortar')) sawOwnPool = true
    }
    expect(hitAtOnce).toBeGreaterThanOrEqual(2) // one shell, several victims
    expect(sawOwnPool).toBe(true)
  })

  it('artificer structures grow stronger as the waves pass', () => {
    const structureHit = (wave: number): number => {
      const sim = new Sim(registry, { seed: 203, playerCount: 1, classIds: ['artificer'] })
      const p = sim.state.players[0]
      p.items.push('turret-kit')
      p.maxHealth = 100000; p.health = 100000
      sim.startWave(quiet.map((w) => ({ ...w, wave })), wave)
      push(sim, 'brood-sac', 1)
      sim.tick()
      const turret = sim.state.pets.find((pet) => pet.defId === 'minigun-turret')!
      const sac = sim.state.enemies[0]
      sac.x = turret.x + 2; sac.y = turret.y
      const before = sac.health
      for (let i = 0; i < TICK_RATE * 3 && sac.health === before; i++) sim.tick()
      return before - sac.health
    }
    const early = structureHit(1)
    const late = structureHit(7) // two tiers up at every-3-waves
    expect(early).toBeGreaterThan(0)
    expect(late).toBeCloseTo(early * 2, 1)
  })
})
