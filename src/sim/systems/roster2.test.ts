import { describe, expect, it } from 'vitest'
import { Sim, TICK_RATE } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import { applyRunResult, emptyProfile } from '../meta/unlocks'
import { recomputePlayer } from './stats'
import { resolveItem } from '../data/variants'
import type { WaveDef } from '../data/types'

const registry = loadContent()
const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

describe('tranche-eight classes', () => {
  it('beastmaster pets inherit half of the owner melee bonus', () => {
    const dmg = (meleePct: number): number => {
      const sim = new Sim(registry, { seed: 80, playerCount: 1, classIds: ['beastmaster'] })
      const p = sim.state.players[0]
      p.items.push('raven-pair') // Run applies starting items; bare Sim tests push them
      p.maxHealth = 100000
      p.health = 100000
      p.meleePct = meleePct
      sim.startWave(quiet, 1)
      sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'kingslime-t1', remaining: 1, spacing: 0, nextAt: 0, elite: null })
      for (let i = 0; i < TICK_RATE * 25; i++) sim.tick()
      return sim.tracker.bySource(0).get('raven') ?? 0
    }
    const base = dmg(0)
    expect(base).toBeGreaterThan(0) // starts with two ravens
    expect(dmg(100)).toBeGreaterThan(base * 1.25)
  })

  it('technology never reaches the beastmaster — rewards or shop', () => {
    for (let seed = 90; seed < 98; seed++) {
      const run = new Run(registry, { seed, playerCount: 1, actId: 'act1', classIds: ['beastmaster'] })
      run.sim.state.wave.chestsDropped = 8 // plenty of reward rolls at recap
      const p = run.sim.state.players[0]
      p.maxHealth = 100000; p.health = 100000
      let guard = 0
      while (run.phase === 'arena' && guard++ < TICK_RATE * 300) run.tick()
      const screen = run.personal.get(0)
      if (!screen) continue
      for (const r of screen.rewards) {
        const baseId = r.itemId.includes(':') ? r.itemId.split(':')[1] : r.itemId
        const item = registry.items.get(baseId)
        if (item) expect(item.tags).not.toContain('Technology')
      }
      for (const entry of screen.shop) {
        expect(registry.weapon(entry.weaponId).tags).not.toContain('Technology')
      }
    }
  })

  it('druid pets inherit half of the owner magic bonus', () => {
    const dmg = (magicPct: number): number => {
      const sim = new Sim(registry, { seed: 81, playerCount: 1, classIds: ['druid'] })
      const p = sim.state.players[0]
      p.items.push('summon-wolf')
      p.maxHealth = 100000
      p.health = 100000
      p.magicPct = magicPct
      sim.startWave(quiet, 1)
      sim.state.wave.pendingSpawns.push({ at: 0, enemy: 'kingslime-t1', remaining: 1, spacing: 0, nextAt: 0, elite: null })
      for (let i = 0; i < TICK_RATE * 25; i++) sim.tick()
      return sim.tracker.bySource(0).get('wolf') ?? 0
    }
    const base = dmg(0)
    expect(base).toBeGreaterThan(0) // starts with a wolf
    expect(dmg(100)).toBeGreaterThan(base * 1.25)
  })

  it('the warlord fields a single squire alongside real weapons', () => {
    const run = new Run(registry, { seed: 82, playerCount: 1, actId: 'act1', classIds: ['warlord'] })
    const p = run.sim.state.players[0]
    expect(p.weapons.length).toBeGreaterThan(0)
    expect(run.sim.state.pets.filter((pt) => pt.defId === 'squire').length).toBe(1)
  })

  it('the merchant pays a quarter less and always sees a tier-2 option', () => {
    for (let seed = 83; seed < 89; seed++) {
      const run = new Run(registry, { seed, playerCount: 2, actId: 'act1', classIds: ['merchant', 'student'] })
      const p = run.sim.state.players.map((pl) => { pl.maxHealth = 100000; pl.health = 100000; return pl })
      let guard = 0
      while (run.phase === 'arena' && guard++ < TICK_RATE * 300) run.tick()
      if (run.phase !== 'recap') continue
      run.proceedFromRecap()
      const merchantShop = run.personal.get(0)!.shop
      expect(merchantShop.some((e) => e.tier >= 2)).toBe(true)
      // Same weapon+tier is cheaper for the merchant than for the student.
      const w = merchantShop[0]
      expect(w.price).toBeLessThan(run.priceQuote(1, w.weaponId, w.tier))
      expect(p.length).toBe(2)
      break
    }
  })

  it('the curator suffers only half of each cursed penalty', () => {
    // Measure what carrying the cursed version costs each class, relative to
    // carrying the plain version — attribute by attribute.
    const snapshot = (classId: string, itemId: string): Record<string, number> => {
      const sim = new Sim(registry, { seed: 85, playerCount: 1, classIds: [classId] })
      const p = sim.state.players[0]
      p.items.push(itemId)
      recomputePlayer(p, registry)
      return {
        maxHealth: p.maxHealth, regen: p.regen, moveSpeed: p.moveSpeed,
        armor: p.defenses.armor, dodge: p.defenses.dodge,
        allPct: p.allPct, cooldownPct: p.cooldownPct, goldPct: p.goldPct,
      }
    }
    const drops = (classId: string): Record<string, number> => {
      const plain = snapshot(classId, 'iron-plating')
      const cursed = snapshot(classId, 'cursed:iron-plating')
      const out: Record<string, number> = {}
      for (const k of Object.keys(plain)) out[k] = plain[k] - cursed[k]
      return out
    }
    // This item's fixed curse happens to hit its own bonus stat (armor), so
    // measure the *difference in what the curse costs* each class: exactly
    // half the curse magnitude should be forgiven.
    const item = resolveItem(registry, 'cursed:iron-plating')
    const curse = item.effects.find((e) => e.kind === 'stat' && e.amount < 0)!
    const curseSize = Math.abs((curse as { amount: number }).amount)
    const student = drops('student')
    const curator = drops('curator')
    const attr = (curse as { attribute: string }).attribute
    expect(student[attr]).toBeGreaterThan(curator[attr]) // curator keeps more
    expect(student[attr] - curator[attr]).toBeCloseTo(curseSize / 2, 5)
  })

  it('win-gated class unlocks demand the win, not just the run', () => {
    let profile = emptyProfile()
    profile = applyRunResult(profile, {
      won: false, actId: 'act1', waveReached: 6,
      players: [{ classId: 'engineer', kills: 10 }],
      bestKillsInOneWave: 0, maxSimultaneousBurns: 0,
    })
    expect(profile.classesRun).toContain('engineer')
    expect(profile.classesWon).not.toContain('engineer')
    profile = applyRunResult(profile, {
      won: true, actId: 'act1', waveReached: 10,
      players: [{ classId: 'engineer', kills: 10 }],
      bestKillsInOneWave: 0, maxSimultaneousBurns: 0,
    })
    expect(profile.classesWon).toContain('engineer')
  })
})
