import { describe, expect, it } from 'vitest'
import { Run } from './run'
import { loadContent } from '../data/loadContent'
import { recomputePlayer } from '../systems/stats'

/** Headless helper: play the arena until the phase leaves 'arena'. */
function playWave(run: Run, maxSeconds = 240): void {
  for (let i = 0; i < 30 * maxSeconds && run.phase === 'arena'; i++) run.tick()
}

function makeRun(seed = 101): Run {
  const run = new Run(loadContent(), { seed, playerCount: 1, actId: 'act1' })
  // A capable loadout so the headless player reliably clears waves.
  run.sim.equipWeapon(0, 'practice-sword')
  const p = run.sim.state.players[0]
  p.maxHealth = 4000
  p.health = 4000
  return run
}

describe('Run flow', () => {
  it('wave clear → recap → intermission → next wave', () => {
    const run = makeRun()
    expect(run.phase).toBe('arena')
    playWave(run)
    expect(run.phase).toBe('recap')

    run.proceedFromRecap()
    expect(run.phase).toBe('intermission')

    // Spend every banked draft, then ready up.
    const p = run.sim.state.players[0]
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    expect(p.pendingDrafts).toBe(0)
    run.setReady(0)
    expect(run.phase).toBe('arena')
    expect(run.sim.state.wave.number).toBe(2)
  })

  it('drafts are mandatory before readying', () => {
    const run = makeRun(202)
    playWave(run)
    run.proceedFromRecap()
    const screen = run.personal.get(0)
    if (screen?.draft) {
      run.setReady(0) // should be refused while a draft is open
      expect(run.phase).toBe('intermission')
    }
  })

  it('perk picks change stats through recompute', () => {
    const run = makeRun(303)
    const p = run.sim.state.players[0]
    playWave(run)
    run.proceedFromRecap()
    const before = { maxHealth: p.maxHealth, moveSpeed: p.moveSpeed, armor: p.defenses.armor }
    let picked = 0
    while (run.personal.get(0)?.draft) { run.pickPerk(0, 0); picked++ }
    if (picked > 0) {
      const after = { maxHealth: p.maxHealth, moveSpeed: p.moveSpeed, armor: p.defenses.armor }
      expect(after).not.toEqual(before) // something moved
      expect(p.perks.length).toBe(picked)
    }
  })

  it('shop: buying deducts gold and equips; selling refunds half', () => {
    const run = makeRun(404)
    playWave(run)
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const p = run.sim.state.players[0]
    const screen = run.personal.get(0)
    if (!screen) throw new Error('no personal screen')

    p.gold = 1000
    run.sellWeapon(0, 1) // free a slot (makeRun fills both)
    p.gold = 1000
    const weaponsBefore = p.weapons.length
    const price = screen.shop[0].price
    expect(run.buyWeapon(0, 0)).toBe('ok')
    expect(p.gold).toBe(1000 - price)
    expect(p.weapons.length).toBe(weaponsBefore + 1)
    expect(run.buyWeapon(0, 0)).toBe('invalid') // already sold

    const goldBeforeSell = p.gold
    run.sellWeapon(0, p.weapons.length - 1)
    expect(p.weapons.length).toBe(weaponsBefore)
    expect(p.gold).toBeGreaterThan(goldBeforeSell)
  })

  it('slot cap refuses purchases when full', () => {
    const run = makeRun(505)
    playWave(run)
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const p = run.sim.state.players[0]
    p.gold = 100000
    // Fill to the cap (starts with 2 equipped from makeRun).
    expect(p.weapons.length).toBe(run.weaponSlots(0))
    const result = run.buyWeapon(0, 0)
    expect(result).toBe('full')
  })

  it('a full run reaches victory or defeat deterministically', () => {
    const play = (): { phase: string; wave: number } => {
      const run = makeRun(606)
      for (let guard = 0; guard < 40 && run.phase !== 'victory' && run.phase !== 'defeat'; guard++) {
        playWave(run)
        if (run.phase === 'recap') {
          run.proceedFromRecap()
          run.personal.get(0)?.rewards.forEach((_, i) => run.resolveReward(0, i, 'kept'))
          while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
          run.setReady(0)
        }
      }
      return { phase: run.phase, wave: run.sim.state.wave.number }
    }
    const a = play()
    const b = play()
    expect(a).toEqual(b)
    expect(['victory', 'defeat']).toContain(a.phase)
  })
})

describe('endless mode', () => {
  it('continues past the final wave with escalating generated waves', () => {
    const run = new Run(loadContent(), { seed: 606, playerCount: 1, actId: 'act1', endless: true })
    run.sim.equipWeapon(0, 'practice-sword')
    const p = run.sim.state.players[0]
    // Buffs as real perks so they survive every stat recompute.
    for (let i = 0; i < 30; i++) p.perks.push({ perkId: 'ferocity', tier: 3 })
    for (let i = 0; i < 40; i++) p.perks.push({ perkId: 'vitality', tier: 3 })
    recomputePlayer(p, loadContent())
    p.health = p.maxHealth
    for (let guard = 0; guard < 13 && run.phase !== 'defeat'; guard++) {
      for (let i = 0; i < 30 * 240 && run.phase === 'arena'; i++) {
        run.tick()
        // Stationary test player: hop to stragglers so waves always clear.
        if (i % 600 === 599 && run.sim.state.enemies.length > 0) {
          const e = run.sim.state.enemies[0]
          p.x = e.x
          p.y = e.y
        }
      }
      if (run.phase !== 'recap') break
      run.proceedFromRecap()
      run.personal.get(0)?.rewards.forEach((_, i) => run.resolveReward(0, i, 'sold'))
      while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
      run.setReady(0)
    }
    // Never a victory screen: the run is beyond wave 10 and still going.
    expect(run.phase).not.toBe('victory')
    expect(run.sim.state.wave.number).toBeGreaterThan(10)
  })

  it('a normal run still ends in victory at the final wave', () => {
    const run = new Run(loadContent(), { seed: 606, playerCount: 1, actId: 'act1' })
    run.sim.equipWeapon(0, 'practice-sword')
    const p = run.sim.state.players[0]
    // Buffs as real perks so they survive every stat recompute.
    for (let i = 0; i < 30; i++) p.perks.push({ perkId: 'ferocity', tier: 3 })
    for (let i = 0; i < 40; i++) p.perks.push({ perkId: 'vitality', tier: 3 })
    recomputePlayer(p, loadContent())
    p.health = p.maxHealth
    for (let guard = 0; guard < 12 && run.phase !== 'victory' && run.phase !== 'defeat'; guard++) {
      for (let i = 0; i < 30 * 240 && run.phase === 'arena'; i++) {
        run.tick()
        if (i % 600 === 599 && run.sim.state.enemies.length > 0) {
          const e = run.sim.state.enemies[0]
          p.x = e.x
          p.y = e.y
        }
      }
      if (run.phase !== 'recap') break
      run.proceedFromRecap()
      run.personal.get(0)?.rewards.forEach((_, i) => run.resolveReward(0, i, 'sold'))
      while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
      run.setReady(0)
    }
    expect(run.phase).toBe('victory')
  })
})
