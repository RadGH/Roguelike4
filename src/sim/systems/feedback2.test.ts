import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { loadContent } from '../data/loadContent'
import { hasInfoSight } from './stats'

const registry = loadContent()

function armed(weapons: string[], seed = 300): Sim {
  const sim = new Sim(registry, { seed, playerCount: 1 })
  for (const w of weapons) sim.equipWeapon(0, w)
  const p = sim.state.players[0]
  p.maxHealth = 100000
  p.health = 100000
  return sim
}

const push = (sim: Sim, enemy: string, n = 1): void => {
  sim.state.wave.pendingSpawns.push({ at: 0, enemy, remaining: n, spacing: 0, nextAt: 0, elite: null })
}

describe('playtest round 2 — combat feel', () => {
  it('an empty field pulls the next spawn group forward to 2 seconds', () => {
    const sim = armed(['practice-wand'])
    // One group scheduled 30s out and nothing alive: dead air by design flaw.
    sim.startWave([{ wave: 1, groups: [{ at: 30, enemy: 'nibbler', count: 3, spacing: 0.5 }] }], 1)
    let firstSpawnAt = -1
    for (let i = 0; i < TICK_RATE * 10; i++) {
      sim.tick()
      if (firstSpawnAt < 0 && sim.state.enemies.length > 0) {
        firstSpawnAt = sim.state.wave.elapsed
        break
      }
    }
    expect(firstSpawnAt).toBeGreaterThan(1.5)
    expect(firstSpawnAt).toBeLessThan(3) // not 30
  })

  it('the pulled schedule keeps groups in their relative order', () => {
    const sim = armed(['practice-wand'])
    sim.startWave([{ wave: 1, groups: [
      { at: 20, enemy: 'nibbler', count: 1 },
      { at: 26, enemy: 'scurrier', count: 1 },
    ] }], 1)
    const seen: string[] = []
    for (let i = 0; i < TICK_RATE * 12; i++) {
      sim.tick()
      for (const e of sim.state.enemies) {
        if (!seen.includes(e.defId)) seen.push(e.defId)
      }
    }
    expect(seen[0]).toBe('nibbler') // 2s after clear
    expect(seen[1]).toBe('scurrier') // ~6s later, gap preserved
  })

  it('three identical weapons volley on different ticks, not as one shot', () => {
    const sim = armed(['storm-javelin', 'storm-javelin', 'storm-javelin'])
    sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
    push(sim, 'brood-sac', 3)
    sim.tick()
    const p = sim.state.players[0]
    sim.state.enemies.forEach((e, i) => { e.x = p.x + 3 + i; e.y = p.y })
    for (let i = 0; i < TICK_RATE * 2; i++) sim.tick()
    const ticks = p.weapons.map((w) => w.firedTick)
    expect(new Set(ticks).size).toBe(3) // three distinct fire ticks
  })

  it('weapons spread across targets when there are enough enemies', () => {
    const sim = armed(['storm-javelin', 'storm-javelin', 'storm-javelin'])
    sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
    push(sim, 'brood-sac', 3)
    sim.tick()
    const p = sim.state.players[0]
    sim.state.enemies.forEach((e, i) => { e.x = p.x + 3 + i * 0.5; e.y = p.y })
    for (let i = 0; i < TICK_RATE * 2; i++) sim.tick()
    const targets = p.weapons.map((w) => w.targetId).filter((t) => t !== null)
    expect(new Set(targets).size).toBe(3) // one enemy each
  })

  it('weapons stack on one target only when enemies run short', () => {
    const sim = armed(['storm-javelin', 'storm-javelin', 'storm-javelin'])
    sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
    push(sim, 'brood-sac', 1)
    sim.tick()
    const p = sim.state.players[0]
    sim.state.enemies[0].x = p.x + 3
    sim.state.enemies[0].y = p.y
    for (let i = 0; i < TICK_RATE * 2; i++) sim.tick()
    const targets = p.weapons.map((w) => w.targetId)
    expect(targets.every((t) => t === sim.state.enemies[0]?.id || t === null)).toBe(true)
  })

  it('melee winds up before landing — instant kills are gone', () => {
    const sim = armed(['practice-sword'])
    sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
    push(sim, 'brood-sac', 1)
    sim.tick()
    const p = sim.state.players[0]
    const sac = sim.state.enemies[0]
    sac.x = p.x + 1; sac.y = p.y
    const before = sac.health
    // Wind-up is 0.2s: for the first 4 ticks nothing lands.
    for (let i = 0; i < 4; i++) sim.tick()
    expect(sac.health).toBe(before)
    for (let i = 0; i < TICK_RATE; i++) sim.tick()
    expect(sac.health).toBeLessThan(before)
  })

  it('a committed swing whiffs when the target escapes the wind-up', () => {
    const sim = armed(['hammer']) // 0.5s wind-up: plenty of time to escape
    sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
    push(sim, 'brood-sac', 1)
    sim.tick()
    const p = sim.state.players[0]
    const sac = sim.state.enemies[0]
    sac.x = p.x + 1.5; sac.y = p.y
    // Let the hammer commit, then yank the target away mid-swing.
    let committed = false
    for (let i = 0; i < TICK_RATE * 2; i++) {
      sim.tick()
      const w = p.weapons[0]
      if (!committed && w.windupLeft > 0) {
        committed = true
        sac.x = p.x + 12
      }
    }
    expect(committed).toBe(true)
    expect(sac.health).toBe(registry.enemy('brood-sac').health) // untouched
  })

  it('thrown stars zigzag while wands fly straight', () => {
    const flightYs = (weapon: string): number[] => {
      const sim = armed([weapon], 301)
      sim.startWave([{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }], 1)
      push(sim, 'brood-sac', 1)
      sim.tick()
      const p = sim.state.players[0]
      sim.state.enemies[0].x = p.x + 5.5
      sim.state.enemies[0].y = p.y
      const ys: number[] = []
      for (let i = 0; i < TICK_RATE * 2; i++) {
        sim.tick()
        for (const pr of sim.state.projectiles) ys.push(pr.vy)
      }
      return ys
    }
    const starVy = flightYs('throwing-stars')
    // A zigzagging star's vertical velocity flips sign as it flutters.
    expect(Math.max(...starVy)).toBeGreaterThan(0.1)
    expect(Math.min(...starVy)).toBeLessThan(-0.1)
    const wandVy = flightYs('practice-wand')
    // The wand bolt holds one heading (target is dead ahead: vy stays ~0).
    expect(Math.max(...wandVy.map(Math.abs))).toBeLessThan(0.5)
  })
})

describe('information sight is earned, not free', () => {
  it('the oracle sees wave intel; a student does not', () => {
    const oracle = new Sim(registry, { seed: 400, playerCount: 1, classIds: ['oracle'] })
    const student = new Sim(registry, { seed: 400, playerCount: 1, classIds: ['student'] })
    expect(hasInfoSight(oracle.state.players[0], registry)).toBe(true)
    expect(hasInfoSight(student.state.players[0], registry)).toBe(false)
  })

  it('a crystal ball grants the same sight, variants included', () => {
    const sim = new Sim(registry, { seed: 401, playerCount: 1, classIds: ['student'] })
    const p = sim.state.players[0]
    p.items.push('crystal-ball')
    expect(hasInfoSight(p, registry)).toBe(true)
    p.items.length = 0
    p.items.push('corrupt:crystal-ball')
    expect(hasInfoSight(p, registry)).toBe(true)
  })

  it('the crystal ball is authored rare', () => {
    expect(registry.item('crystal-ball').weight).toBeLessThan(0.5)
  })
})
