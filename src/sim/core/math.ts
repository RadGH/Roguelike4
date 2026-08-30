/**
 * Deterministic math helpers for the sim.
 *
 * IEEE-754 add/sub/mul/div and Math.sqrt are exactly specified and therefore
 * reproducible everywhere. Math.sin/cos/atan2 are implementation-defined and
 * may differ between engines, so the sim NEVER calls them — direction work is
 * done with vectors and normalization instead of angles. (The renderer may use
 * trig freely; it carries no game state.)
 */

export interface Vec {
  x: number
  y: number
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

export function dist(a: Vec, b: Vec): number {
  return len(a.x - b.x, a.y - b.y)
}

export function distSq(a: Vec, b: Vec): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/** Normalize in place-free style; returns {0,0} for the zero vector. */
export function norm(x: number, y: number): Vec {
  const l = len(x, y)
  if (l === 0) return { x: 0, y: 0 }
  return { x: x / l, y: y / l }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Move `from` toward `to` by at most `step`, without overshooting. */
export function moveToward(from: Vec, to: Vec, step: number): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const l = len(dx, dy)
  if (l <= step || l === 0) return { x: to.x, y: to.y }
  return { x: from.x + (dx / l) * step, y: from.y + (dy / l) * step }
}
