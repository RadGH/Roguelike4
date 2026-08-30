import { describe, expect, it } from 'vitest'
import { loadContent } from './loadContent'
import { parseItemId, resolveItem, rollVariant, variantEligible } from './variants'
import { Sim } from '../core/sim'
import { recomputePlayer } from '../systems/stats'

const registry = loadContent()

describe('item variants', () => {
  it('corrupt: stronger, paid in health specifically', () => {
    const base = registry.item('iron-plating') // +10 armor
    const corrupt = resolveItem(registry, 'corrupt:iron-plating')
    const armor = corrupt.effects.find((e) => e.kind === 'stat' && e.attribute === 'armor')
    const health = corrupt.effects.find((e) => e.kind === 'stat' && e.attribute === 'maxHealth')
    expect(armor && armor.kind === 'stat' && armor.amount).toBe(15)
    expect(health && health.kind === 'stat' && health.amount).toBe(-3)
    expect(corrupt.price).toBeGreaterThan(base.price)
  })

  it('cursed: the same base item always carries the same curse', () => {
    const a = resolveItem(registry, 'cursed:fleet-boots')
    const b = resolveItem(registry, 'cursed:fleet-boots')
    expect(a.effects).toEqual(b.effects)
    // Boosted own stat plus exactly one penalty stat.
    const penalties = a.effects.filter((e) => e.kind === 'stat' && e.amount < 0)
    expect(penalties.length).toBe(1)
  })

  it('relic: base effects untouched plus one bonus', () => {
    const base = registry.item('heartstone')
    const relic = resolveItem(registry, 'relic:heartstone')
    expect(relic.effects.length).toBe(base.effects.length + 1)
  })

  it('variant items flow through the stat recompute', () => {
    const sim = new Sim(registry, { seed: 1, playerCount: 1 })
    const p = sim.state.players[0]
    const before = p.defenses.armor
    p.items.push('corrupt:iron-plating')
    recomputePlayer(p, registry)
    expect(p.defenses.armor).toBe(before + 15)
    expect(p.maxHealth).toBe(20 - 3)
  })

  it('plain ids parse as no variant; summon-only items are ineligible', () => {
    expect(parseItemId('iron-plating')).toEqual({ baseId: 'iron-plating', variant: null })
    expect(parseItemId('holo:lodestone').variant).toBe('holo')
    expect(variantEligible(registry.item('turret-kit'))).toBe(false)
    expect(variantEligible(registry.item('iron-plating'))).toBe(true)
  })

  it('variant odds: most rolls are plain', () => {
    expect(rollVariant(0.5)).toBeNull()
    expect(rollVariant(0.01)).toBe('corrupt')
    expect(rollVariant(0.1)).toBe('cursed')
    expect(rollVariant(0.16)).toBe('relic')
    expect(rollVariant(0.2)).toBe('holo')
  })
})
