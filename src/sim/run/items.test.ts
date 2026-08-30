import { describe, expect, it } from 'vitest'
import { Run } from './run'
import { Sim } from '../core/sim'
import { loadContent } from '../data/loadContent'
import { recomputePlayer } from '../systems/stats'

const registry = loadContent()

function playWave(run: Run, maxSeconds = 240): void {
  for (let i = 0; i < 30 * maxSeconds && run.phase === 'arena'; i++) run.tick()
}

function buffed(seed: number, players = 1): Run {
  const run = new Run(registry, { seed, playerCount: players, actId: 'act1' })
  for (const p of run.sim.state.players) {
    run.sim.equipWeapon(p.id, 'practice-sword')
    p.maxHealth = 4000
    p.health = 4000
  }
  return run
}

describe('item stat effects', () => {
  it('stack per copy and survive recompute', () => {
    const sim = new Sim(registry, { seed: 1, playerCount: 1 })
    const p = sim.state.players[0]
    const base = p.defenses.armor
    p.items.push('iron-plating', 'iron-plating')
    recomputePlayer(p, registry)
    expect(p.defenses.armor).toBe(base + 20)
  })
})

describe('chest drops and rewards', () => {
  it('chests are capped at 2 per wave', () => {
    const run = buffed(7)
    playWave(run)
    expect(run.sim.state.wave.chestsDropped).toBeLessThanOrEqual(2)
  })

  it('rewards must be resolved before readying; keeping equips, selling pays', () => {
    // Find a seed whose first wave drops at least one chest.
    for (let seed = 20; seed < 60; seed++) {
      const run = buffed(seed)
      playWave(run)
      if (run.phase !== 'recap') continue
      if (run.sim.state.wave.chestsDropped === 0) continue
      run.proceedFromRecap()
      const screen = run.personal.get(0)
      if (!screen) continue
      expect(screen.rewards.length).toBe(run.sim.state.wave.chestsDropped)

      while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
      run.setReady(0)
      expect(run.phase).toBe('intermission') // refused: rewards unresolved

      const p = run.sim.state.players[0]
      const goldBefore = p.gold
      const itemsBefore = p.items.length
      run.resolveReward(0, 0, 'kept')
      expect(p.items.length).toBe(itemsBefore + 1)
      screen.rewards.forEach((r, i) => {
        if (!r.resolved) run.resolveReward(0, i, 'sold')
      })
      if (screen.rewards.length > 1) expect(p.gold).toBeGreaterThan(goldBefore)
      run.setReady(0)
      expect(run.phase).toBe('arena')
      return
    }
    throw new Error('no seed produced a chest in wave 1')
  })

  it('round-robin: items alternate between players across chests', () => {
    // Play co-op waves until two chests have dropped in total; the two
    // rewards must not both go to the same player.
    const run = buffed(31, 2)
    const received: number[] = []
    for (let guard = 0; guard < 6 && received.length < 2; guard++) {
      playWave(run)
      if (run.phase !== 'recap') break
      run.proceedFromRecap()
      for (const p of run.sim.state.players) {
        const screen = run.personal.get(p.id)
        if (!screen) continue
        for (const r of screen.rewards) {
          received.push(p.id)
          void r
        }
        screen.rewards.forEach((_, i) => run.resolveReward(p.id, i, 'sold'))
        while (run.personal.get(p.id)?.draft) run.pickPerk(p.id, 0)
        run.setReady(p.id)
      }
    }
    if (received.length >= 2) {
      expect(received[0]).not.toBe(received[1])
    }
  })
})

describe('triggered item effects', () => {
  it('on-kill explosions deal attributed damage', () => {
    const run = buffed(11)
    const p = run.sim.state.players[0]
    p.items.push('killing-blow')
    recomputePlayer(p, registry)
    playWave(run)
    const bySource = run.sim.tracker.bySource(0)
    expect(bySource.get('killing-blow') ?? 0).toBeGreaterThan(0)
  })

  it('on-pickup healing triggers on any pickup', () => {
    const run = buffed(12)
    const p = run.sim.state.players[0]
    p.items.push('restorative-greed', 'restorative-greed', 'restorative-greed')
    recomputePlayer(p, registry)
    p.maxHealth = 4000
    p.health = 100 // hurt, so heals are observable
    let healed = false
    for (let i = 0; i < 30 * 120 && run.phase === 'arena'; i++) {
      const before = p.health
      run.tick()
      if (p.health > before + 0.5) { healed = true; break } // regen is 0; +1 heals show
    }
    expect(healed).toBe(true)
  })
})
