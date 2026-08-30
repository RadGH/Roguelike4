import { describe, expect, it } from 'vitest'
import { Sim } from './sim'
import { loadContent } from '../data/loadContent'

function makeSim(seed: number, players = 1): Sim {
  const registry = loadContent()
  const sim = new Sim(registry, { seed, playerCount: players })
  for (const p of sim.state.players) sim.equipWeapon(p.id, 'practice-wand')
  const act = registry.act('act1')
  sim.startWave(act.waves, 1)
  return sim
}

describe('Sim determinism', () => {
  it('same seed → identical state hash after 2000 ticks', () => {
    const a = makeSim(1111)
    const b = makeSim(1111)
    for (let i = 0; i < 2000; i++) {
      a.tick()
      b.tick()
    }
    expect(a.hash()).toBe(b.hash())
    expect(a.state.enemies.length).toBe(b.state.enemies.length)
    expect(a.tracker.events.length).toBe(b.tracker.events.length)
  })

  it('different seeds → different trajectories', () => {
    const a = makeSim(1)
    const b = makeSim(2)
    for (let i = 0; i < 2000; i++) {
      a.tick()
      b.tick()
    }
    expect(a.hash()).not.toBe(b.hash())
  })

  it('same seed at 4 players stays deterministic', () => {
    const a = makeSim(77, 4)
    const b = makeSim(77, 4)
    for (let i = 0; i < 1500; i++) {
      a.tick()
      b.tick()
    }
    expect(a.hash()).toBe(b.hash())
  })
})

describe('Sim behavior', () => {
  it('spawns wave enemies over time', () => {
    const sim = makeSim(5)
    for (let i = 0; i < 90; i++) sim.tick() // 3 seconds
    expect(sim.state.enemies.length).toBeGreaterThan(0)
  })

  it('weapons only fire with a target in range (hold-fire)', () => {
    const registry = loadContent()
    const sim = new Sim(registry, { seed: 9, playerCount: 1 })
    sim.equipWeapon(0, 'practice-wand')
    // No wave started — no enemies — no projectiles ever.
    for (let i = 0; i < 300; i++) sim.tick()
    expect(sim.state.projectiles.length).toBe(0)
  })

  it('kills drop pickups and collection is shared-and-multiplied', () => {
    const sim = makeSim(21, 2)
    // Run long enough for kills and pickups to happen.
    for (let i = 0; i < 30 * 60 && sim.tracker.events.length === 0; i++) sim.tick()
    expect(sim.tracker.events.length).toBeGreaterThan(0)
    // Keep running until some gold is collected.
    for (let i = 0; i < 30 * 60 && sim.state.players[0].gold === 0; i++) sim.tick()
    // Shared gold: both players always have the identical amount.
    expect(sim.state.players[0].gold).toBe(sim.state.players[1].gold)
  })

  it('slimes split into slimelings on death', () => {
    const sim = makeSim(33)
    const act = loadContent().act('act1')
    sim.startWave(act.waves, 3)
    let sawSlimeling = false
    for (let i = 0; i < 30 * 120; i++) {
      sim.tick()
      if (sim.state.enemies.some((e) => e.defId === 'slimeling')) {
        sawSlimeling = true
        break
      }
    }
    expect(sawSlimeling).toBe(true)
  })

  it('attribution tracker groups damage by source', () => {
    const sim = makeSim(55)
    for (let i = 0; i < 30 * 30; i++) sim.tick()
    const bySource = sim.tracker.bySource(0)
    const total = [...bySource.values()].reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(sim.tracker.totalFor(0), 5)
  })
})
