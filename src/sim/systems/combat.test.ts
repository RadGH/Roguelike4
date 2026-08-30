import { describe, expect, it } from 'vitest'
import { Sim } from '../core/sim'
import { loadContent } from '../data/loadContent'

describe('telegraphs', () => {
  it('spitters create telegraphs and zone damage can land', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 42, playerCount: 1 })
    // No weapons: the player just stands there while spitters attack.
    // Tanky enough to survive the swarm long enough for spitters to arrive.
    sim.state.players[0].maxHealth = 100000
    sim.state.players[0].health = 100000
    const act = registry.act('act1')
    sim.startWave(act.waves, 2) // wave 2 introduces spitters
    let sawTelegraph = false
    for (let i = 0; i < 30 * 60; i++) {
      sim.tick()
      if (sim.state.telegraphs.length > 0) sawTelegraph = true
      if (sawTelegraph && sim.tracker.takenEvents.some((e) => e.sourceId === 'spitter')) break
    }
    expect(sawTelegraph).toBe(true)
    expect(sim.tracker.takenEvents.length).toBeGreaterThan(0)
  })

  it('telegraph impacts stay deterministic', () => {
    const run = (): number => {
      const registry = loadContent()
      const sim = new Sim(registry, { seed: 7, playerCount: 2 })
      const act = registry.act('act1')
      sim.startWave(act.waves, 2)
      for (let i = 0; i < 30 * 45; i++) sim.tick()
      return sim.hash()
    }
    expect(run()).toBe(run())
  })
})

describe('leveling', () => {
  it('collecting XP levels up and banks drafts', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 3, playerCount: 1 })
    sim.equipWeapon(0, 'practice-wand')
    sim.equipWeapon(0, 'practice-sword')
    const act = registry.act('act1')
    sim.startWave(act.waves, 1)
    for (let i = 0; i < 30 * 120 && sim.state.players[0].level === 1; i++) sim.tick()
    const p = sim.state.players[0]
    expect(p.level).toBeGreaterThan(1)
    expect(p.pendingDrafts).toBe(p.level - 1)
  })
})

describe('contact damage', () => {
  it('is discrete and routed through defenses', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 11, playerCount: 1 })
    sim.state.players[0].defenses.armor = 50 // 50% reduction at K=50
    const act = registry.act('act1')
    sim.startWave(act.waves, 1)
    for (let i = 0; i < 30 * 40 && sim.tracker.takenEvents.length < 3; i++) sim.tick()
    const contact = sim.tracker.takenEvents.filter((e) => !e.dodged && e.taken > 0)
    expect(contact.length).toBeGreaterThan(0)
    for (const e of contact) {
      expect(e.taken).toBeLessThan(e.amount) // armor mitigated something
      expect(e.mitigated).toBeCloseTo(e.amount - e.taken, 5)
    }
  })

  it('lifesteal heals the owner from damage dealt', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 19, playerCount: 1 })
    sim.equipWeapon(0, 'practice-wand')
    const p = sim.state.players[0]
    p.lifesteal = 0.5
    p.health = 5 // hurt, so healing is observable
    const act = registry.act('act1')
    sim.startWave(act.waves, 1)
    let healed = false
    for (let i = 0; i < 30 * 60; i++) {
      const before = p.health
      sim.tick()
      // Ignore ticks where damage was also taken; look for any net-up moment.
      if (p.health > before) { healed = true; break }
    }
    expect(healed).toBe(true)
  })
})
