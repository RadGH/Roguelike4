import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

describe('Rng', () => {
  it('same seed produces the same sequence', () => {
    const a = new Rng(12345)
    const b = new Rng(12345)
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next())
  })

  it('different seeds diverge', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('values stay in [0, 1)', () => {
    const r = new Rng(999)
    for (let i = 0; i < 10000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int stays inclusive of both bounds and hits them', () => {
    const r = new Rng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(r.int(1, 4))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })

  it('forks with different labels diverge, same labels agree', () => {
    const mk = (label: string): number[] => {
      const f = new Rng(42).fork(label)
      return Array.from({ length: 5 }, () => f.next())
    }
    expect(mk('waves')).toEqual(mk('waves'))
    expect(mk('waves')).not.toEqual(mk('combat'))
  })

  it('weighted respects zero weights', () => {
    const r = new Rng(3)
    for (let i = 0; i < 200; i++) {
      const v = r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))
      expect(v).not.toBe('b')
    }
  })
})
