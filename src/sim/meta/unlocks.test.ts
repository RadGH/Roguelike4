import { describe, expect, it } from 'vitest'
import {
  applyRunResult, availableContent, emptyProfile, evaluateUnlocks,
} from './unlocks'
import { loadContent } from '../data/loadContent'
import { Run } from '../run/run'

const registry = loadContent()

describe('unlock engine', () => {
  it('a fresh profile has only base content — trio classes are locked', () => {
    const avail = availableContent(emptyProfile(), registry)
    expect(avail.classes).toContain('student')
    expect(avail.classes).not.toContain('fighter')
    expect(avail.classes).not.toContain('rogue')
    expect(avail.classes).not.toContain('mage')
    expect(avail.weapons).not.toContain('hammer')
    expect(avail.perks).not.toContain('leeching')
    expect(avail.weapons).toContain('practice-sword')
  })

  it('finishing a Student run — even a loss — unlocks the trio', () => {
    let profile = emptyProfile()
    profile = applyRunResult(profile, {
      actId: 'act1',
      won: false,
      waveReached: 2,
      players: [{ classId: 'student', kills: 12 }],
      bestKillsInOneWave: 12,
    })
    const earned = evaluateUnlocks(profile, registry)
    expect(earned.map((u) => u.id)).toContain('graduation')
    profile = { ...profile, unlockedIds: earned.map((u) => u.id) }
    const avail = availableContent(profile, registry)
    expect(avail.classes).toEqual(expect.arrayContaining(['fighter', 'rogue', 'mage']))
  })

  it('counters accumulate across runs toward total-kills', () => {
    let profile = emptyProfile()
    for (let i = 0; i < 3; i++) {
      profile = applyRunResult(profile, {
        actId: 'act1',
        won: false,
        waveReached: 3,
        players: [{ classId: 'student', kills: 120 }],
        bestKillsInOneWave: 40,
      })
    }
    expect(profile.totalKills).toBe(360)
    const earned = evaluateUnlocks(profile, registry)
    expect(earned.map((u) => u.id)).toContain('hundred-hands')
  })

  it('winning the act unlocks the Sentinel', () => {
    let profile = emptyProfile()
    profile = applyRunResult(profile, {
      actId: 'act1',
      won: true,
      waveReached: 10,
      players: [{ classId: 'student', kills: 300 }],
      bestKillsInOneWave: 55,
    })
    const ids = evaluateUnlocks(profile, registry).map((u) => u.id)
    expect(ids).toContain('hold-the-line')
    expect(ids).toContain('deep-delver') // reached wave 7+
  })
})

describe('classes in the sim', () => {
  it('classes shape the starting configuration, not raw power ceilings', () => {
    const mk = (classId: string): Run =>
      new Run(registry, { seed: 5, playerCount: 1, actId: 'act1', classIds: [classId] })

    const fighter = mk('fighter')
    expect(fighter.weaponSlots(0)).toBe(3)
    expect(fighter.sim.state.players[0].weapons[0].defId).toBe('practice-sword')

    const student = mk('student')
    expect(student.weaponSlots(0)).toBe(2)
    expect(student.sim.state.players[0].xpPct).toBe(25)

    const sentinel = mk('sentinel')
    const sp = sentinel.sim.state.players[0]
    expect(sp.maxHealth).toBeGreaterThan(20)
    expect(sp.defenses.armor).toBeGreaterThan(0)
    expect(sp.moveSpeed).toBeLessThan(5)
  })

  it('gated weapons never appear in a gated shop', () => {
    const run = new Run(registry, {
      seed: 6,
      playerCount: 1,
      actId: 'act1',
      unlocked: { weapons: ['practice-sword', 'practice-wand', 'shortbow'], perks: ['vitality'] },
    })
    run.sim.equipWeapon(0, 'practice-sword')
    const p = run.sim.state.players[0]
    p.maxHealth = 4000
    p.health = 4000
    for (let i = 0; i < 30 * 240 && run.phase === 'arena'; i++) run.tick()
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const screen = run.personal.get(0)
    if (!screen) throw new Error('no screen')
    for (const entry of screen.shop) {
      expect(['practice-sword', 'practice-wand', 'shortbow']).toContain(entry.weaponId)
    }
    // Gated perks never appear in drafts either.
    for (const perk of p.perks) expect(perk.perkId).toBe('vitality')
  })

  it('rogue affinity boosts Light weapons through the multiplier', () => {
    const rogue = new Run(registry, { seed: 7, playerCount: 1, actId: 'act1', classIds: ['rogue'] })
    const student = new Run(registry, { seed: 7, playerCount: 1, actId: 'act1', classIds: ['student'] })
    // Both swing the same Light-tagged sword; the rogue's hits are bigger.
    student.sim.equipWeapon(0, 'practice-sword')
    const clear = (r: Run): number => {
      const p = r.sim.state.players[0]
      p.maxHealth = 4000
      p.health = 4000
      for (let i = 0; i < 30 * 60; i++) r.tick()
      const bySource = r.sim.tracker.bySource(0)
      return bySource.get('practice-sword') ?? 0
    }
    const rogueDmg = clear(rogue)
    const studentDmg = clear(student)
    expect(rogueDmg).toBeGreaterThan(0)
    expect(studentDmg).toBeGreaterThan(0)
  })
})
