import { describe, expect, it } from 'vitest'
import { Sim } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function sim1(): Sim {
  const sim = new Sim(registry, { seed: 5, playerCount: 1 })
  sim.state.players[0].maxHealth = 100000
  sim.state.players[0].health = 100000
  sim.startWave(quiet, 1)
  return sim
}

describe('the two-button budget', () => {
  it('dash displaces along the move intent, on a cooldown', () => {
    const sim = sim1()
    const p = sim.state.players[0]
    sim.equipActive(0, 'dash')
    sim.setMoveIntent(0, 1, 0)
    const x0 = p.x
    expect(sim.useMovement(0)).toBe(true)
    expect(p.x).toBeGreaterThan(x0 + 2)
    expect(sim.useMovement(0)).toBe(false) // on cooldown
    for (let i = 0; i < 30 * 4; i++) sim.tick()
    expect(sim.useMovement(0)).toBe(true) // recovered
  })

  it('empty slots are a legitimate state — buttons do nothing', () => {
    const sim = sim1()
    expect(sim.useEquipment(0)).toBe(false)
    expect(sim.useMovement(0)).toBe(false)
  })

  it('repulse pushes enemies away without disabling them', () => {
    const sim = sim1()
    const p = sim.state.players[0]
    sim.equipActive(0, 'repulse')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'scurrier', remaining: 3, spacing: 0, nextAt: 0, elite: null })
    for (let i = 0; i < 30 * 6; i++) sim.tick() // let them close in
    const before = sim.state.enemies.map((e) => Math.hypot(e.x - p.x, e.y - p.y))
    sim.useEquipment(0)
    const after = sim.state.enemies.map((e) => Math.hypot(e.x - p.x, e.y - p.y))
    const pushed = after.filter((d, i) => d > before[i] + 1).length
    expect(pushed).toBeGreaterThan(0)
    // Not control: enemies still move afterward.
    const posBefore = sim.state.enemies.map((e) => e.x + e.y)
    for (let i = 0; i < 30; i++) sim.tick()
    const posAfter = sim.state.enemies.map((e) => e.x + e.y)
    expect(posAfter).not.toEqual(posBefore)
  })

  it('ground slam deals attributed damage', () => {
    const sim = sim1()
    sim.equipActive(0, 'ground-slam')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 5, spacing: 0, nextAt: 0, elite: null })
    for (let i = 0; i < 30 * 8; i++) sim.tick()
    sim.useEquipment(0)
    expect(sim.tracker.bySource(0).get('ground-slam') ?? 0).toBeGreaterThan(0)
  })

  it('heal restores self and nearby allies', () => {
    const sim = new Sim(registry, { seed: 9, playerCount: 2 })
    sim.startWave(quiet, 1)
    sim.equipActive(0, 'lesser-heal')
    const [a, b] = sim.state.players
    a.health = 5
    b.health = 5
    b.x = a.x + 1
    b.y = a.y
    sim.useEquipment(0)
    expect(a.health).toBe(11)
    expect(b.health).toBe(11)
  })
})

describe('classes and rewards with slot items', () => {
  it('class starting slots are equipped content, not innate abilities', () => {
    const rogue = new Run(registry, { seed: 3, playerCount: 1, actId: 'act1', classIds: ['rogue'] })
    expect(rogue.sim.state.players[0].movement?.defId).toBe('dash')
    const sentinel = new Run(registry, { seed: 3, playerCount: 1, actId: 'act1', classIds: ['sentinel'] })
    expect(sentinel.sim.state.players[0].equipment?.defId).toBe('repulse')
    const student = new Run(registry, { seed: 3, playerCount: 1, actId: 'act1', classIds: ['student'] })
    expect(student.sim.state.players[0].equipment).toBeNull()
    expect(student.sim.state.players[0].movement).toBeNull()
  })

  it('keeping a slot reward replaces the old item and refunds half its price', () => {
    const run = new Run(registry, { seed: 4, playerCount: 1, actId: 'act1', classIds: ['rogue'] })
    run.phase = 'intermission'
    const p = run.sim.state.players[0]
    run.personal.set(0, {
      rewards: [{ itemId: 'blink', resolved: null }],
      draft: null,
      grant: null,
      shop: [],
      rerollPrice: 10,
      done: false,
    })
    const goldBefore = p.gold
    run.resolveReward(0, 0, 'kept')
    expect(p.movement?.defId).toBe('blink')
    expect(p.gold).toBe(goldBefore + Math.round(registry.active('dash').price / 2))
  })
})
