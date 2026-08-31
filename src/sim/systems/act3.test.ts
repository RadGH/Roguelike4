import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
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

describe('act 3 enemies', () => {
  it('harriers hold an orbit ring between dives instead of closing in', () => {
    const sim = armed(1)
    push(sim, 'harrier')
    sim.tick()
    const h = sim.state.enemies[0]
    h.x = 12; h.y = 0
    h.mode = 0 // it dove on spawn tick; clear that or its end resets the cd
    h.attackCdLeft = 999 // never dive: isolate the orbit behavior
    const p = sim.state.players[0]
    const dists: number[] = []
    for (let i = 0; i < TICK_RATE * 12; i++) {
      sim.tick()
      dists.push(Math.hypot(h.x - p.x, h.y - p.y))
    }
    // Settles near the 5.5 ring and stays there — never a contact-range chase.
    const late = dists.slice(-TICK_RATE * 6)
    expect(Math.min(...late)).toBeGreaterThan(3.5)
    expect(Math.max(...late)).toBeLessThan(8)
  })

  it('the grasper roots in place and drags players toward it', () => {
    const sim = armed(2)
    push(sim, 'grasper')
    sim.tick()
    const g = sim.state.enemies[0]
    const p = sim.state.players[0]
    g.x = p.x + 3.5
    g.y = p.y
    const grasperX = g.x
    const before = Math.abs(g.x - p.x)
    for (let i = 0; i < TICK_RATE * 2; i++) sim.tick() // player stands still
    expect(g.x).toBeCloseTo(grasperX, 5) // the grasper never moved
    expect(Math.abs(g.x - p.x)).toBeLessThan(before) // the player was pulled in
  })

  it('seeders bury hazards that stay harmless until they arm', () => {
    const sim = armed(3)
    push(sim, 'seeder')
    sim.tick()
    const p = sim.state.players[0]
    const s = sim.state.enemies[0]
    s.x = p.x + 2; s.y = p.y
    // Let it plant one seed, then remove the seeder so only the seed can hurt.
    while (sim.state.pools.length === 0) sim.tick()
    sim['damageEnemy'](s, 99999, 0, 'practice-wand', 'Magic')
    const seed = sim.state.pools.find((pool) => pool.sourceId === 'seeder')!
    p.x = seed.x; p.y = seed.y; p.health = p.maxHealth
    let sawDormant = false
    let sawArmed = false
    for (let i = 0; i < TICK_RATE * 8; i++) {
      p.x = seed.x; p.y = seed.y // stand on the seed the whole time
      sim.tick()
      if (seed.armDelay && seed.armDelay > 0) {
        sawDormant = true
        expect(p.health).toBe(p.maxHealth) // dormant seeds never hurt anyone
      } else if (seed.ttl > 0) {
        sawArmed = true
      }
    }
    expect(sawDormant).toBe(true)
    expect(sawArmed).toBe(true)
    expect(p.health).toBeLessThan(p.maxHealth) // armed seeds do
  })

  it('reflectors return a share of damage taken to the attacker', () => {
    const sim = armed(4)
    push(sim, 'reflector')
    sim.tick()
    const r = sim.state.enemies[0]
    const p = sim.state.players[0]
    const before = p.health
    sim['damageEnemy'](r, 10, 0, 'practice-wand', 'Magic')
    expect(r.health).toBeLessThan(30)
    expect(p.health).toBeLessThan(before) // 25% came back
  })

  it('the grudge grows stronger with every wound that fails to kill it', () => {
    const sim = armed(5)
    push(sim, 'grudge')
    sim.tick()
    const g = sim.state.enemies[0]
    expect(g.rage).toBe(0)
    for (let i = 0; i < 5; i++) sim['damageEnemy'](g, 2, 0, 'practice-wand', 'Magic')
    expect(g.rage).toBeCloseTo(2.5, 5)
    // Capped: rage never exceeds the authored ceiling.
    for (let i = 0; i < 40; i++) sim['damageEnemy'](g, 0.1, 0, 'practice-wand', 'Magic')
    expect(g.rage).toBeLessThanOrEqual(8)
  })

  it('a living beacon turns the whole horde onto its marked player', () => {
    const sim = new Sim(registry, { seed: 6, playerCount: 2 })
    sim.equipWeapon(0, 'practice-wand')
    for (const p of sim.state.players) { p.maxHealth = 100000; p.health = 100000 }
    sim.startWave(quiet, 1)
    const [p0, p1] = sim.state.players
    p0.x = -10; p0.y = 0
    p1.x = 10; p1.y = 0
    push(sim, 'beacon')
    push(sim, 'scurrier')
    sim.tick()
    const beacon = sim.state.enemies.find((e) => e.defId === 'beacon')!
    const scurrier = sim.state.enemies.find((e) => e.defId === 'scurrier')!
    // Place the beacon by p0 and the scurrier by p1: without the mark the
    // scurrier would chase p1, but the beacon marks p0 and the horde obeys.
    beacon.x = -9; beacon.y = 1
    beacon.attackCdLeft = 0
    scurrier.x = 9; scurrier.y = 1
    const startDist = Math.hypot(scurrier.x - p0.x, scurrier.y - p0.y)
    for (let i = 0; i < TICK_RATE * 3; i++) sim.tick()
    const endDist = Math.hypot(scurrier.x - p0.x, scurrier.y - p0.y)
    expect(endDist).toBeLessThan(startDist)
    // Kill the beacon and put the scurrier back by p1: with no mark it
    // reverts to nearest-player targeting and closes on p1 again.
    sim['damageEnemy'](beacon, 99999, 0, 'practice-wand', 'Magic')
    scurrier.x = 9; scurrier.y = 1
    const distToP1 = () => Math.hypot(scurrier.x - p1.x, scurrier.y - p1.y)
    const beforeRevert = distToP1()
    for (let i = 0; i < TICK_RATE * 2; i++) sim.tick()
    expect(distToP1()).toBeLessThan(beforeRevert)
  })

  it('act 3 exists, ends on the Warden, and unlocks by finishing act 2', () => {
    const act = registry.acts.get('act3')!
    expect(act.waves.length).toBe(10)
    expect(act.boss).toBe('warden')
    const locked = availableContent(emptyProfile(), registry)
    expect(locked.acts).not.toContain('act3')
    const profile = emptyProfile()
    profile.actsWon.push('act1', 'act2')
    profile.unlockedIds.push('the-deep-gate')
    const open = availableContent(profile, registry)
    expect(open.acts).toContain('act3')
  })
})
