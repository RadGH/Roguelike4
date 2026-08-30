/**
 * Seeded, fork-able random number generator (splitmix32 core).
 *
 * Every random draw in a run flows through one of these. A run is exactly
 * reproducible from its seed (a Simulation Mode requirement), so nothing in
 * the sim may ever call Math.random().
 *
 * Fork discipline: each system takes its own fork (`rng.fork('waves')`) so
 * that adding a draw in one system does not shift every draw after it in
 * unrelated systems. That keeps seeds comparable across code changes.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let z = (this.state = (this.state + 0x9e3779b9) | 0)
    z ^= z >>> 16
    z = Math.imul(z, 0x21f0aaad)
    z ^= z >>> 15
    z = Math.imul(z, 0x735a2d97)
    z ^= z >>> 15
    return ((z >>> 0) / 4294967296)
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Pick one element. Throws on empty input — callers decide the fallback. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array')
    return items[this.int(0, items.length - 1)]
  }

  /** Weighted pick. Weights <= 0 are never chosen. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0
    for (const it of items) total += Math.max(0, weightOf(it))
    if (total <= 0) return this.pick(items)
    let roll = this.next() * total
    for (const it of items) {
      roll -= Math.max(0, weightOf(it))
      if (roll < 0) return it
    }
    return items[items.length - 1]
  }

  /** In-place Fisher–Yates shuffle, returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }

  /**
   * Derive an independent stream. The label hashes into the derived seed so
   * different systems forked from the same parent do not correlate.
   */
  fork(label: string): Rng {
    let h = 0x811c9dc5
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return new Rng((h ^ Math.floor(this.next() * 4294967296)) >>> 0)
  }
}
