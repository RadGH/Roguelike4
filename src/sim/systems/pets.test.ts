import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function simWithPet(itemId: string, seed = 8): Sim {
  const sim = new Sim(registry, { seed, playerCount: 1 })
  sim.state.players[0].items.push(itemId)
  sim.state.players[0].maxHealth = 100000
  sim.state.players[0].health = 100000
  sim.startWave(quiet, 1)
  return sim
}

describe('pets and structures', () => {
  it('summon items deploy their pets at wave start', () => {
    const sim = simWithPet('raven-pair')
    expect(sim.state.pets.filter((p) => p.defId === 'raven').length).toBe(2)
  })

  it('structures spawn somewhere in the arena, not at the player', () => {
    let awayFromPlayer = false
    for (let seed = 1; seed < 12; seed++) {
      const sim = simWithPet('turret-kit', seed)
      const turret = sim.state.pets[0]
      const p = sim.state.players[0]
      if (Math.hypot(turret.x - p.x, turret.y - p.y) > 4) awayFromPlayer = true
    }
    expect(awayFromPlayer).toBe(true)
  })

  it('a turret attacks with attributed Pet damage', () => {
    const sim = simWithPet('turret-kit')
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'nibbler', remaining: 8, spacing: 0.2, nextAt: 0, elite: null })
    for (let i = 0; i < TICK_RATE * 60; i++) sim.tick()
    expect(sim.tracker.bySource(0).get('minigun-turret') ?? 0).toBeGreaterThan(0)
  })

  it('pet damage scales with the owner pet bonus', () => {
    const dmg = (petPct: number): number => {
      const sim = simWithPet('turret-kit', 21)
      sim.state.players[0].petPct = petPct
      // A 200-health target so total damage is throughput, not kill-capped.
      sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'kingslime-t1', remaining: 1, spacing: 0, nextAt: 0, elite: null })
      for (let i = 0; i < TICK_RATE * 20; i++) sim.tick()
      return sim.tracker.bySource(0).get('minigun-turret') ?? 0
    }
    const base = dmg(0)
    const boosted = dmg(100)
    expect(base).toBeGreaterThan(0)
    expect(boosted).toBeGreaterThan(base * 1.5)
  })

  it('a wolf can die to contact and respawns after its timer', () => {
    const sim = simWithPet('summon-wolf')
    const wolf = sim.state.pets[0]
    // Kill it directly through the incidental-damage path.
    for (let i = 0; i < 10; i++) sim['damagePet'](wolf, 5)
    expect(wolf.respawnLeft).toBeGreaterThan(0)
    for (let i = 0; i < TICK_RATE * 9; i++) sim.tick()
    expect(wolf.respawnLeft).toBeLessThanOrEqual(0)
    expect(wolf.health).toBe(wolf.maxHealth)
  })

  it('invulnerable pets cannot be damaged', () => {
    const sim = simWithPet('raven-pair')
    const raven = sim.state.pets[0]
    sim['damagePet'](raven, 999)
    expect(raven.health).toBe(raven.maxHealth)
    expect(raven.respawnLeft).toBe(0)
  })

  it('the engineer starts with a turret in play', () => {
    const run = new Run(registry, { seed: 30, playerCount: 1, actId: 'act1', classIds: ['engineer'] })
    expect(run.sim.state.players[0].items).toContain('turret-kit')
    expect(run.sim.state.pets.some((p) => p.defId === 'minigun-turret')).toBe(true)
  })

  it('pets persist across waves via rebuild (kept summons redeploy)', () => {
    const run = new Run(registry, { seed: 31, playerCount: 1, actId: 'act1', classIds: ['engineer'] })
    run.sim.equipWeapon(0, 'practice-sword')
    const p = run.sim.state.players[0]
    p.maxHealth = 4000
    p.health = 4000
    for (let i = 0; i < 30 * 240 && run.phase === 'arena'; i++) run.tick()
    run.proceedFromRecap()
    run.personal.get(0)?.rewards.forEach((_, i) => run.resolveReward(0, i, 'sold'))
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    run.setReady(0)
    expect(run.sim.state.wave.number).toBe(2)
    expect(run.sim.state.pets.some((pt) => pt.defId === 'minigun-turret')).toBe(true)
  })
})

describe('conversion classes', () => {
  it('squires inherit half the owner melee bonus', () => {
    const dmg = (meleePct: number): number => {
      const sim = new Sim(registry, { seed: 44, playerCount: 1, classIds: ['king'] })
      const p = sim.state.players[0]
      p.items.push('squire-band')
      p.maxHealth = 100000
      p.health = 100000
      p.meleePct = meleePct
      sim.startWave(quiet, 1)
      sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'kingslime-t1', remaining: 1, spacing: 0, nextAt: 0, elite: null })
      for (let i = 0; i < TICK_RATE * 25; i++) sim.tick()
      return sim.tracker.bySource(0).get('squire') ?? 0
    }
    const base = dmg(0)
    const invested = dmg(100) // squires should swing ~50% harder
    expect(base).toBeGreaterThan(0)
    expect(invested).toBeGreaterThan(base * 1.25)
  })

  it('the king starts weaponless with three squires', () => {
    const run = new Run(registry, { seed: 45, playerCount: 1, actId: 'act1', classIds: ['king'] })
    const p = run.sim.state.players[0]
    expect(p.weapons.length).toBe(0)
    expect(run.weaponSlots(0)).toBe(0)
    expect(run.sim.state.pets.filter((pt) => pt.defId === 'squire').length).toBe(3)
  })

  it('the paladin armors allies standing close', () => {
    const sim = new Sim(registry, { seed: 46, playerCount: 2, classIds: ['paladin', 'student'] })
    sim.startWave(quiet, 1)
    const [pal, friend] = sim.state.players
    friend.maxHealth = 1000
    friend.health = 1000
    const hitAt = (dist: number): number => {
      friend.health = 1000
      friend.x = pal.x + dist
      friend.y = pal.y
      sim['damagePlayer'](friend, 20, 'Melee', 'test', false)
      return 1000 - friend.health
    }
    const near = hitAt(1)
    const far = hitAt(12)
    expect(near).toBeLessThan(far)
  })

  it('the dragon knight ignites with melee weapons only', () => {
    const sim = new Sim(registry, { seed: 47, playerCount: 1, classIds: ['dragon-knight'] })
    sim.equipWeapon(0, 'practice-sword')
    const p = sim.state.players[0]
    p.maxHealth = 100000
    p.health = 100000
    sim.startWave(quiet, 1)
    sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'slime', remaining: 4, spacing: 0.5, nextAt: 0, elite: null })
    let sawBurn = false
    for (let i = 0; i < TICK_RATE * 90; i++) {
      sim.tick()
      if (sim.state.enemies.some((e) => e.burnTtl > 0)) { sawBurn = true; break }
    }
    expect(sawBurn).toBe(true)
  })
})
