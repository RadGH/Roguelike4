import type { SimState } from './state'

/**
 * Order-stable FNV-1a hash of the sim state's numeric content. Used by tests
 * and Simulation Mode to prove two runs with the same seed are identical.
 */
export function hashState(s: SimState): number {
  let h = 0x811c9dc5

  const mix = (n: number): void => {
    // Fold the float's bits in via a scaled integer view; cheap and stable.
    const v = Math.round(n * 4096) | 0
    h ^= v & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 8) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 16) & 0xff
    h = Math.imul(h, 0x01000193)
    h ^= (v >>> 24) & 0xff
    h = Math.imul(h, 0x01000193)
  }

  mix(s.tick)
  mix(s.nextEntityId)
  for (const p of s.players) {
    mix(p.x); mix(p.y); mix(p.health); mix(p.xp); mix(p.gold); mix(p.level)
  }
  for (const e of s.enemies) {
    mix(e.id); mix(e.x); mix(e.y); mix(e.health); mix(e.mode)
  }
  for (const pool of s.pools) {
    mix(pool.id); mix(pool.x); mix(pool.y); mix(pool.ttl)
  }
  for (const pr of s.projectiles) {
    mix(pr.id); mix(pr.x); mix(pr.y)
  }
  for (const pk of s.pickups) {
    mix(pk.id); mix(pk.x); mix(pk.y); mix(pk.amount)
  }
  for (const t of s.telegraphs) {
    mix(t.id); mix(t.x); mix(t.y); mix(t.timeLeft)
  }
  mix(s.wave.number)
  mix(s.wave.elapsed)
  return h >>> 0
}
