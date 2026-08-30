import { describe, expect, it } from 'vitest'
import { Run } from './run'
import { loadContent } from '../data/loadContent'

function playWave(run: Run, maxSeconds = 240): void {
  for (let i = 0; i < 30 * maxSeconds && run.phase === 'arena'; i++) run.tick()
}

function buffed(run: Run): Run {
  run.sim.equipWeapon(0, 'practice-sword')
  const p = run.sim.state.players[0]
  p.maxHealth = 4000
  p.health = 4000
  return run
}

describe('save and resume', () => {
  it('round-trips a run through serialize → resume', () => {
    const run = buffed(new Run(loadContent(), { seed: 42, playerCount: 1, actId: 'act1' }))
    playWave(run)
    expect(run.phase).toBe('recap')
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const p = run.sim.state.players[0]
    p.gold = 137

    const save = run.serialize(777)
    expect(save.nextWave).toBe(2)

    const resumed = Run.resume(loadContent(), save)
    const rp = resumed.sim.state.players[0]
    expect(resumed.phase).toBe('arena')
    expect(resumed.sim.state.wave.number).toBe(2)
    expect(rp.gold).toBe(137)
    expect(rp.level).toBe(p.level)
    expect(rp.perks).toEqual(p.perks)
    expect(rp.weapons.map((w) => w.defId)).toEqual(p.weapons.map((w) => w.defId))
    // Perk effects survived through recompute.
    expect(rp.maxHealth).toBe(p.maxHealth)
    // Attribution history survived.
    expect(resumed.sim.tracker.totalFor(0)).toBeCloseTo(run.sim.tracker.totalFor(0), 3)
    expect(resumed.sim.tracker.waveSummary(0, 1).kills).toBe(run.sim.tracker.waveSummary(0, 1).kills)
  })

  it('a resumed run is playable', () => {
    const run = buffed(new Run(loadContent(), { seed: 43, playerCount: 1, actId: 'act1' }))
    playWave(run)
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const resumed = Run.resume(loadContent(), run.serialize(888))
    resumed.sim.state.players[0].maxHealth = 4000
    resumed.sim.state.players[0].health = 4000
    playWave(resumed)
    expect(['recap', 'defeat']).toContain(resumed.phase)
    // Wave 2 events landed on top of the restored wave 1 aggregates.
    expect(resumed.sim.tracker.waveSummary(0, 2).dealt).toBeGreaterThan(0)
  })
})

describe('equip prompt (buyReplacing)', () => {
  it('replaces an equipped weapon, refunding half', () => {
    const run = buffed(new Run(loadContent(), { seed: 44, playerCount: 1, actId: 'act1' }))
    playWave(run)
    run.proceedFromRecap()
    while (run.personal.get(0)?.draft) run.pickPerk(0, 0)
    const p = run.sim.state.players[0]
    const screen = run.personal.get(0)
    if (!screen) throw new Error('no screen')
    expect(p.weapons.length).toBe(run.weaponSlots(0)) // full

    p.gold = 1000
    const entry = screen.shop[0]
    const oldDef = run.registry.weapon(p.weapons[0].defId)
    const result = run.buyReplacing(0, 0, 0)
    expect(result).toBe('ok')
    expect(p.weapons.length).toBe(run.weaponSlots(0)) // still full, new weapon in
    expect(p.weapons.some((w) => w.defId === entry.weaponId)).toBe(true)
    expect(p.gold).toBe(1000 + Math.round(oldDef.price * 0.5) - entry.price)
  })
})
