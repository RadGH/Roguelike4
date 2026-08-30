import { describe, expect, it } from 'vitest'
import { ARMOR_K, emptyDefenses, resolveDamage, xpForLevel } from './damage'

describe('resolveDamage', () => {
  it('no defenses: full damage lands', () => {
    const r = resolveDamage(10, 'Melee', emptyDefenses(), true, 0.99)
    expect(r.taken).toBe(10)
    expect(r.mitigated).toBe(0)
    expect(r.dodged).toBe(false)
  })

  it('dodge avoids attacks entirely', () => {
    const d = { ...emptyDefenses(), dodge: 0.5 }
    const hit = resolveDamage(10, 'Melee', d, true, 0.6) // roll above dodge
    const miss = resolveDamage(10, 'Melee', d, true, 0.4) // roll below dodge
    expect(hit.taken).toBe(10)
    expect(miss.taken).toBe(0)
    expect(miss.dodged).toBe(true)
  })

  it('dodge never applies to hazards', () => {
    const d = { ...emptyDefenses(), dodge: 1 }
    const r = resolveDamage(10, 'Ranged', d, false, 0)
    expect(r.taken).toBe(10)
  })

  it('armor has diminishing returns', () => {
    const at = (armor: number): number =>
      resolveDamage(100, 'Melee', { ...emptyDefenses(), armor }, true, 0.99).taken
    expect(at(ARMOR_K)).toBeCloseTo(50) // armor = K → 50% reduction
    expect(at(ARMOR_K * 2)).toBeCloseTo(100 / 3) // 66%
    // Doubling armor never doubles reduction.
    expect(at(ARMOR_K) - at(ARMOR_K * 2)).toBeLessThan(at(0) - at(ARMOR_K))
  })

  it('Void ignores resistance but not armor or block', () => {
    const d = { ...emptyDefenses(), resist: 0.5, armor: ARMOR_K }
    const voidHit = resolveDamage(100, 'Void', d, true, 0.99)
    const magicHit = resolveDamage(100, 'Magic', d, true, 0.99)
    expect(voidHit.taken).toBeCloseTo(50) // armor applies
    expect(magicHit.taken).toBeCloseTo(25) // armor then resist
  })

  it('resistance is capped below immunity', () => {
    const d = { ...emptyDefenses(), resist: 5 }
    const r = resolveDamage(100, 'Magic', d, true, 0.99)
    expect(r.taken).toBeGreaterThan(0)
  })

  it('damage never goes negative', () => {
    const d = { ...emptyDefenses(), flatReduction: 999, block: 999 }
    const r = resolveDamage(5, 'Melee', d, true, 0.99)
    expect(r.taken).toBe(0)
  })
})

describe('xpForLevel', () => {
  it('is whole-numbered and strictly increasing', () => {
    for (let l = 1; l < 30; l++) {
      expect(Number.isInteger(xpForLevel(l))).toBe(true)
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l))
    }
  })
})
