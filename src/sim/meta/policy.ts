import type { Rng } from '../core/rng'
import type { Sim } from '../core/sim'
import type { PlayerState } from '../core/state'
import type { Run } from '../run/run'
import { norm } from '../core/math'

/**
 * Headless player policies for Simulation Mode.
 *
 * The movement model is the simulator's dominant error term and is stated
 * honestly as such: `skill` (0..1) scales how well the fake player kites,
 * dodges telegraphs, and routes to pickups. Its outputs are hypotheses to
 * check in play, not verdicts.
 */

export function moveIntent(sim: Sim, p: PlayerState, skill: number, rng: Rng): { x: number; y: number } {
  const s = sim.state
  let vx = 0
  let vy = 0

  // A build's reach decides its footwork: ranged builds kite at distance,
  // melee builds orbit the edge of their swing instead of running forever.
  let maxRange = 0
  for (const w of p.weapons) {
    maxRange = Math.max(maxRange, sim.registry.weapon(w.defId).range)
  }
  const meleeBuild = maxRange > 0 && maxRange <= 2.4
  const fleeRadius2 = meleeBuild ? 2.25 : 64

  // Flee threat: enemies push away with 1/d² weighting.
  for (const e of s.enemies) {
    if (!sim.isTargetable(e) && rng.next() < skill) continue // skilled players ignore burrowed fake-outs
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d2 = Math.max(0.4, dx * dx + dy * dy)
    if (d2 > fleeRadius2) continue
    vx += (dx / d2) * 3
    vy += (dy / d2) * 3
  }

  // Melee builds close to the edge of their own reach.
  if (meleeBuild) {
    let nearest = null as { x: number; y: number } | null
    let best = Infinity
    for (const e of s.enemies) {
      if (!sim.isTargetable(e)) continue
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
      if (d2 < best) { best = d2; nearest = e }
    }
    if (nearest && best > (maxRange * 0.7) ** 2) {
      const n = norm(nearest.x - p.x, nearest.y - p.y)
      vx += n.x * 1.6
      vy += n.y * 1.6
    }
  }

  // Avoid telegraphed zones and pools — reliability scales with skill.
  for (const t of s.telegraphs) {
    const dx = p.x - t.x
    const dy = p.y - t.y
    const d2 = dx * dx + dy * dy
    if (d2 < (t.radius + 1) * (t.radius + 1) && rng.next() < skill) {
      const n = norm(dx, dy)
      vx += n.x * 4
      vy += n.y * 4
    }
  }
  for (const pool of s.pools) {
    const dx = p.x - pool.x
    const dy = p.y - pool.y
    if (dx * dx + dy * dy < pool.radius * pool.radius && rng.next() < skill) {
      const n = norm(dx, dy)
      vx += n.x * 2
      vy += n.y * 2
    }
  }

  // Surrounded: opposing threat vectors cancel and a naive flee stalls in
  // place. A real player picks the thinnest side of the ring and pushes
  // through it — sample 8 compass directions and take the least dangerous.
  const rawPressure = Math.sqrt(vx * vx + vy * vy)
  let nearby = 0
  for (const e of s.enemies) {
    const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d2 < 25) nearby++
  }
  if (nearby >= 5 && rawPressure < 1.0 && rng.next() < skill) {
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
    ]
    let bestDir = dirs[0]
    let bestDanger = Infinity
    for (const [dx, dy] of dirs) {
      const px = p.x + dx * 3
      const py = p.y + dy * 3
      if (Math.abs(px) > s.arenaW / 2 - 1 || Math.abs(py) > s.arenaH / 2 - 1) continue
      let danger = 0
      for (const e of s.enemies) {
        const d2 = Math.max(0.4, (e.x - px) ** 2 + (e.y - py) ** 2)
        if (d2 < 36) danger += 1 / d2
      }
      if (danger < bestDanger) { bestDanger = danger; bestDir = [dx, dy] }
    }
    vx += bestDir[0] * 5
    vy += bestDir[1] * 5
  }

  // Drift toward the nearest pickup when pressure is low.
  const pressure = Math.sqrt(vx * vx + vy * vy)
  if (pressure < 1.2 && s.pickups.length > 0) {
    let nearest = s.pickups[0]
    let best = Infinity
    for (const pk of s.pickups) {
      const d2 = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2
      if (d2 < best) { best = d2; nearest = pk }
    }
    const n = norm(nearest.x - p.x, nearest.y - p.y)
    vx += n.x
    vy += n.y
  }

  // Rescue downed teammates: overriding priority when it is safe enough.
  const downed = s.players.find((o) => o.alive && o.downed && o.id !== p.id)
  if (downed && pressure < 2.5) {
    const n = norm(downed.x - p.x, downed.y - p.y)
    vx += n.x * 3
    vy += n.y * 3
  }

  // Repel from arena walls so kiting does not corner itself.
  const margin = 2
  if (p.x > s.arenaW / 2 - margin) vx -= 1.5
  if (p.x < -s.arenaW / 2 + margin) vx += 1.5
  if (p.y > s.arenaH / 2 - margin) vy -= 1.5
  if (p.y < -s.arenaH / 2 + margin) vy += 1.5

  // Unskilled jitter.
  vx += (rng.next() - 0.5) * (1 - skill) * 1.5
  vy += (rng.next() - 0.5) * (1 - skill) * 1.5

  return norm(vx, vy)
}

/** Spend the A/B buttons on sensible moments (crowds, low health, escape). */
export function useActives(sim: Sim, p: PlayerState, rng: Rng): void {
  let nearby = 0
  for (const e of sim.state.enemies) {
    const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d2 < 16) nearby++
  }
  if (p.equipment && p.equipment.cdLeft <= 0) {
    const hurt = p.health < p.maxHealth * 0.5
    if (nearby >= 4 || (hurt && rng.next() < 0.1)) sim.useEquipment(p.id)
  }
  if (p.movement && p.movement.cdLeft <= 0 && nearby >= 5) {
    sim.useMovement(p.id)
  }
}

/**
 * Intermission policy: a simulated shopper needs a decision rule, and this
 * rule encodes an opinion about what is good — stated here so it can be
 * changed in one place. Perks: prefer damage, then survivability. Shop: fill
 * empty slots with the priciest affordable weapon, keep a small reserve.
 */
export function playIntermission(run: Run, playerId: number): void {
  const p = run.sim.player(playerId)

  // Rewards: the policy keeps everything (selling is a human judgement call).
  const rewardsScreen = run.personal.get(playerId)
  if (rewardsScreen) {
    rewardsScreen.rewards.forEach((r, i) => {
      if (!r.resolved) run.resolveReward(playerId, i, 'kept')
    })
  }

  while (run.personal.get(playerId)?.draft) {
    const screen = run.personal.get(playerId)
    if (!screen?.draft) break
    let bestIdx = 0
    let bestScore = -1
    screen.draft.forEach((offer, i) => {
      const def = run.perkDef(offer.perkId)
      const damage = ['meleePct', 'rangedPct', 'magicPct', 'allPct', 'cooldownPct'].includes(def.attribute)
      const surv = ['maxHealth', 'armor', 'regen', 'dodge', 'resist', 'lifesteal', 'flatReduction'].includes(def.attribute)
      const score = (damage ? 3 : surv ? 2 : 1) * (offer.tier + 1)
      if (score > bestScore) { bestScore = score; bestIdx = i }
    })
    run.pickPerk(playerId, bestIdx)
  }

  const screen = run.personal.get(playerId)
  if (screen) {
    // Fill empty slots first, best damage-per-second for the money.
    const dps = (weaponId: string, tier: number): number => {
      const def = run.registry.weapon(weaponId)
      // Extra pellets rarely all connect — count them at half value.
      const pellets = 1 + 0.5 * ((def.projectileCount ?? 1) - 1)
      return ((def.damage * pellets) / def.cooldown) * [1, 1.5, 2, 2.6][tier] +
        (def.grantsBlock ?? 0) * 0.5
    }
    let bought = true
    while (bought) {
      bought = false
      if (p.weapons.length >= run.weaponSlots(playerId)) break
      const candidates = screen.shop
        .map((entry, i) => ({ entry, i }))
        .filter(({ entry }) => !entry.sold && entry.price <= p.gold)
        .sort((a, b) => dps(b.entry.weaponId, b.entry.tier) - dps(a.entry.weaponId, a.entry.tier))
      if (candidates.length > 0) {
        bought = run.buyWeapon(playerId, candidates[0].i) === 'ok'
      }
    }
    // With full slots, trade the worst-tier weapon up when the shop offers
    // a strictly better tier the player can afford after the trade-in.
    for (let i = 0; i < screen.shop.length; i++) {
      const entry = screen.shop[i]
      if (entry.sold) continue
      let worstSlot = 0
      for (let sIdx = 1; sIdx < p.weapons.length; sIdx++) {
        if (p.weapons[sIdx].tier < p.weapons[worstSlot].tier) worstSlot = sIdx
      }
      if (p.weapons.length > 0 && entry.tier > p.weapons[worstSlot].tier + 1) {
        run.buyReplacing(playerId, i, worstSlot)
      }
    }
  }
  run.setReady(playerId)
}
