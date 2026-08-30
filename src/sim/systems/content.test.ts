import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import { emptyProfile, availableContent } from '../meta/unlocks'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

describe('new weapons', () => {
  it('the shotgun fires a fan of three projectiles', () => {
    const sim = new Sim(registry, { seed: 2, playerCount: 1 })
    sim.state.players[0].maxHealth = 100000
    sim.state.players[0].health = 100000
    sim.equipWeapon(0, 'shotgun')
    sim.startWave(quiet, 1)
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'scurrier', remaining: 1, spacing: 0, nextAt: 0, elite: null })
    let maxProjectiles = 0
    for (let i = 0; i < TICK_RATE * 6; i++) {
      sim.tick()
      maxProjectiles = Math.max(maxProjectiles, sim.state.projectiles.length)
    }
    expect(maxProjectiles).toBe(3)
  })

  it('the shield grants block while equipped and loses it when sold', () => {
    const run = new Run(registry, { seed: 3, playerCount: 1, actId: 'act1' })
    const p = run.sim.state.players[0]
    const base = p.defenses.block
    run.sim.equipWeapon(0, 'shield')
    expect(p.defenses.block).toBe(base + (registry.weapon('shield').grantsBlock ?? 0))
    run.phase = 'intermission'
    run.personal.set(0, { rewards: [], draft: null, shop: [], rerollPrice: 10, done: false })
    run.sellWeapon(0, p.weapons.length - 1)
    expect(p.defenses.block).toBe(base)
  })

  it('the runed sword deals Magic damage in melee (type is independent of range)', () => {
    const def = registry.weapon('runed-sword')
    expect(def.damageType).toBe('Magic')
    expect(def.projectileSpeed).toBeUndefined()
  })
})

describe('new classes', () => {
  it('the vampire bleeds 1 per second and starts with lifesteal', () => {
    const sim = new Sim(registry, { seed: 4, playerCount: 1, classIds: ['vampire'] })
    sim.startWave(quiet, 1)
    const p = sim.state.players[0]
    expect(p.lifesteal).toBeCloseTo(0.2)
    const h0 = p.health
    for (let i = 0; i < TICK_RATE * 3; i++) sim.tick()
    expect(p.health).toBeCloseTo(h0 - 3, 0)
  })

  it('the vampire clock can end a solo run', () => {
    const sim = new Sim(registry, { seed: 5, playerCount: 1, classIds: ['vampire'] })
    sim.startWave(quiet, 1)
    for (let i = 0; i < TICK_RATE * 30; i++) sim.tick()
    expect(sim.state.players[0].alive).toBe(false)
  })

  it('the looter gains max health per item carried', () => {
    const run = new Run(registry, { seed: 6, playerCount: 1, actId: 'act1', classIds: ['looter'] })
    const p = run.sim.state.players[0]
    const before = p.maxHealth
    run.phase = 'intermission'
    run.personal.set(0, {
      rewards: [
        { itemId: 'heartstone', resolved: null },
        { itemId: 'lucky-coin', resolved: null },
      ],
      draft: null,
      shop: [],
      rerollPrice: 10,
      done: false,
    })
    run.resolveReward(0, 0, 'kept') // heartstone: +6 health +1 looter bonus
    run.resolveReward(0, 1, 'kept') // lucky coin: +1 looter bonus
    expect(p.maxHealth).toBe(before + 6 + 2)
  })

  it('the looter pays more at the shop', () => {
    const student = new Run(registry, { seed: 77, playerCount: 1, actId: 'act1', classIds: ['student'] })
    const looter = new Run(registry, { seed: 77, playerCount: 1, actId: 'act1', classIds: ['looter'] })
    expect(looter.priceQuote(0, 'hammer', 0)).toBeGreaterThan(student.priceQuote(0, 'hammer', 0))
  })

  it('priest and marksman are gated behind their unlocks', () => {
    const avail = availableContent(emptyProfile(), registry)
    for (const id of ['priest', 'marksman', 'looter', 'vampire']) {
      expect(avail.classes).not.toContain(id)
    }
    expect(avail.weapons).not.toContain('runed-sword')
    expect(avail.weapons).not.toContain('shotgun')
  })
})
