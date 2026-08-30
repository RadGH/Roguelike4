import type { Registry } from './registry'
import type { ItemDef, ItemEffect, PerkAttribute } from './types'

/**
 * Item variants, encoded as an id prefix ("corrupt:iron-plating") so they
 * flow through inventories, stacking, and saves as plain strings.
 *
 * The separation that keeps them distinct:
 * - Corrupt  — a straight power increase paid in survivability, always the
 *   same axis, so a player learns what corruption costs.
 * - Cursed   — an arbitrary trade: stronger, but one other stat suffers.
 *   Each base item always carries the same curse (learnable, not random).
 * - Relic    — the base item plus one extra stat.
 * - Holographic — visibly distinct and slightly stronger.
 */
export type Variant = 'corrupt' | 'cursed' | 'relic' | 'holo'

export const VARIANT_LABEL: Record<Variant, string> = {
  corrupt: 'Corrupt',
  cursed: 'Cursed',
  relic: 'Relic',
  holo: 'Holographic',
}

const CURSE_POOL: { attribute: PerkAttribute; amount: number }[] = [
  { attribute: 'moveSpeed', amount: -8 },
  { attribute: 'armor', amount: -8 },
  { attribute: 'goldPct', amount: -15 },
  { attribute: 'cooldownPct', amount: -6 },
  { attribute: 'dodge', amount: -3 },
]

const RELIC_POOL: { attribute: PerkAttribute; amount: number }[] = [
  { attribute: 'maxHealth', amount: 3 },
  { attribute: 'moveSpeed', amount: 4 },
  { attribute: 'goldPct', amount: 8 },
  { attribute: 'armor', amount: 4 },
  { attribute: 'dodge', amount: 2 },
]

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function parseItemId(id: string): { baseId: string; variant: Variant | null } {
  const sep = id.indexOf(':')
  if (sep === -1) return { baseId: id, variant: null }
  const prefix = id.slice(0, sep) as Variant
  if (!(prefix in VARIANT_LABEL)) return { baseId: id, variant: null }
  return { baseId: id.slice(sep + 1), variant: prefix }
}

function scaleEffect(eff: ItemEffect, mult: number): ItemEffect {
  switch (eff.kind) {
    case 'stat':
      return { ...eff, amount: Math.round(eff.amount * mult) }
    case 'onKillExplode':
    case 'onPickupDamage':
      return { ...eff, damage: Math.round(eff.damage * mult), chance: Math.min(1, eff.chance * (1 + (mult - 1) / 2)) }
    case 'onKillHeal':
    case 'onPickupHeal':
      return { ...eff, amount: Math.round(eff.amount * mult), chance: Math.min(1, eff.chance * (1 + (mult - 1) / 2)) }
    default:
      return eff // summons and appliers pass through unchanged
  }
}

const cache = new Map<string, ItemDef>()

/** Resolve any item id (base or variant-prefixed) to an effective definition. */
export function resolveItem(registry: Registry, id: string): ItemDef {
  const cached = cache.get(id)
  if (cached) return cached
  const { baseId, variant } = parseItemId(id)
  const base = registry.item(baseId)
  if (!variant) return base

  let def: ItemDef
  if (variant === 'corrupt') {
    def = {
      ...base,
      id,
      name: `Corrupt ${base.name}`,
      description: `${base.description} Strengthened, at the cost of your health.`,
      price: Math.round(base.price * 1.5),
      effects: [
        ...base.effects.map((e) => scaleEffect(e, 1.5)),
        { kind: 'stat', attribute: 'maxHealth', amount: -3 },
      ],
    }
  } else if (variant === 'cursed') {
    const curse = CURSE_POOL[hash(baseId) % CURSE_POOL.length]
    def = {
      ...base,
      id,
      name: `Cursed ${base.name}`,
      description: `${base.description} Stronger, but something else suffers.`,
      price: Math.round(base.price * 1.3),
      effects: [
        ...base.effects.map((e) => scaleEffect(e, 1.5)),
        { kind: 'stat', ...curse },
      ],
    }
  } else if (variant === 'relic') {
    const bonus = RELIC_POOL[hash(baseId) % RELIC_POOL.length]
    def = {
      ...base,
      id,
      name: `Relic ${base.name}`,
      description: `${base.description} An old one, carrying a little extra.`,
      price: Math.round(base.price * 1.6),
      effects: [...base.effects, { kind: 'stat', ...bonus }],
    }
  } else {
    def = {
      ...base,
      id,
      name: `Holographic ${base.name}`,
      description: base.description,
      price: Math.round(base.price * 1.4),
      effects: base.effects.map((e) => scaleEffect(e, 1.25)),
    }
  }
  cache.set(id, def)
  return def
}

/** Can this base item roll a variant? Summon-only items cannot. */
export function variantEligible(def: ItemDef): boolean {
  return def.effects.some((e) => e.kind !== 'summon')
}

/** Variant odds at reward time. Returns null most of the time. */
export function rollVariant(roll: number): Variant | null {
  if (roll < 0.07) return 'corrupt'
  if (roll < 0.14) return 'cursed'
  if (roll < 0.19) return 'relic'
  if (roll < 0.23) return 'holo'
  return null
}
