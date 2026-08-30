import { describe, expect, it } from 'vitest'
import { BLEED_OUT_SECONDS, REVIVE_SECONDS, Sim } from '../core/sim'
import { Run } from '../run/run'
import { loadContent } from '../data/loadContent'
import type { WaveDef } from '../data/types'

const quiet: WaveDef[] = [{ wave: 1, groups: [{ at: 999, enemy: 'nibbler', count: 1 }] }]

function coopSim(players: number): Sim {
  const sim = new Sim(loadContent(), { seed: 7, playerCount: players })
  sim.startWave(quiet, 1)
  return sim
}

/** Drop a player to zero via a real damage path (a scripted telegraph). */
function down(sim: Sim, playerId: number): void {
  const p = sim.state.players[playerId]
  p.health = 0.01
  sim.state.telegraphs.push({
    id: 99999 + playerId,
    x: p.x,
    y: p.y,
    radius: 1,
    severity: 'light',
    window: 0.1,
    timeLeft: 0.001,
    damage: 5,
    damageType: 'Melee',
    sourceId: 'test',
  })
  sim.tick()
}

describe('downed and revival', () => {
  it('a player at zero health goes down, not dead, when teammates stand', () => {
    const sim = coopSim(2)
    down(sim, 1)
    const p = sim.state.players[1]
    expect(p.downed).toBe(true)
    expect(p.alive).toBe(true)
    expect(p.bleedOut).toBeCloseTo(BLEED_OUT_SECONDS, 0)
  })

  it('a teammate standing close revives them at half health', () => {
    const sim = coopSim(2)
    down(sim, 1)
    const downedP = sim.state.players[1]
    const rescuer = sim.state.players[0]
    rescuer.x = downedP.x
    rescuer.y = downedP.y
    for (let i = 0; i < 30 * (REVIVE_SECONDS + 1); i++) sim.tick()
    expect(downedP.downed).toBe(false)
    expect(downedP.health).toBe(Math.round(downedP.maxHealth / 2))
  })

  it('walking away resets revive progress, and bleed-out kills', () => {
    const sim = coopSim(2)
    down(sim, 1)
    const downedP = sim.state.players[1]
    // Rescuer stays far away the whole time.
    sim.state.players[0].x = 10
    sim.state.players[0].y = 8
    for (let i = 0; i < 30 * (BLEED_OUT_SECONDS + 1); i++) sim.tick()
    expect(downedP.alive).toBe(false)
    expect(downedP.downed).toBe(false)
  })

  it('enemies ignore downed players', () => {
    const sim = coopSim(2)
    down(sim, 1)
    // Keep the rescuer out of revive range so P2 stays down for the test.
    sim.state.players[0].x = 10
    sim.state.players[0].y = 8
    const before = sim.tracker.takenSummary(1).taken
    // Spawn a scurrier on top of the downed player.
    sim.state.wave.pendingSpawns.push({
      at: 0, enemy: 'scurrier', remaining: 1, spacing: 0, nextAt: 0, elite: null,
    })
    for (let i = 0; i < 30 * 5; i++) sim.tick()
    expect(sim.tracker.takenSummary(1).taken).toBe(before)
  })

  it('solo: zero health is death, not downed', () => {
    const sim = coopSim(1)
    down(sim, 0)
    const p = sim.state.players[0]
    expect(p.downed).toBe(false)
    expect(p.alive).toBe(false)
  })
})

describe('run end rules', () => {
  it('one survivor keeps the run alive; all down ends it', () => {
    const run = new Run(loadContent(), { seed: 11, playerCount: 2, actId: 'act1' })
    down(run.sim, 1)
    run.tick()
    expect(run.phase).toBe('arena') // P1 still standing
    down(run.sim, 0)
    run.tick()
    expect(run.phase).toBe('defeat')
  })

  it('dead players return at half health when the next wave starts', () => {
    const run = new Run(loadContent(), { seed: 12, playerCount: 2, actId: 'act1' })
    run.sim.equipWeapon(0, 'practice-sword')
    const p0 = run.sim.state.players[0]
    p0.maxHealth = 4000
    p0.health = 4000
    // Kill P2 outright (P1 stands, so P2 goes down; let them bleed out).
    down(run.sim, 1)
    run.sim.state.players[0].x = 10
    run.sim.state.players[0].y = 8
    for (let i = 0; i < 30 * (BLEED_OUT_SECONDS + 1); i++) run.tick()
    expect(run.sim.state.players[1].alive).toBe(false)

    // Play out the wave, then advance through the intermission.
    for (let i = 0; i < 30 * 240 && run.phase === 'arena'; i++) run.tick()
    expect(run.phase).toBe('recap')
    run.proceedFromRecap()
    for (const p of run.sim.state.players) {
      while (run.personal.get(p.id)?.draft) run.pickPerk(p.id, 0)
      run.setReady(p.id)
    }
    expect(run.phase).toBe('arena')
    const p1 = run.sim.state.players[1]
    expect(p1.alive).toBe(true)
    expect(p1.health).toBe(Math.round(p1.maxHealth / 2))
  })
})
