import type { PlayerState } from '../core/state'
import type { Registry } from '../data/registry'
import { TIER_MULTIPLIER, type WeaponDef } from '../data/types'
import { emptyDefenses } from './damage'

/**
 * Baseline character stats — identical for every player, every run. There is
 * no permanent power; only perks and items move these numbers, and they are
 * recomputed from scratch whenever the build changes (never incrementally,
 * so nothing can drift).
 */
export const BASE = {
  maxHealth: 20,
  regen: 0,
  moveSpeed: 5,
  pickupRadius: 1.5,
  lifesteal: 0,
} as const

export function recomputePlayer(p: PlayerState, registry: Registry): void {
  const healthMissing = p.maxHealth - p.health

  p.maxHealth = BASE.maxHealth
  p.regen = BASE.regen
  p.moveSpeed = BASE.moveSpeed
  p.pickupRadius = BASE.pickupRadius
  p.lifesteal = BASE.lifesteal
  p.defenses = emptyDefenses()
  p.meleePct = 0
  p.rangedPct = 0
  p.magicPct = 0
  p.allPct = 0
  p.cooldownPct = 0
  p.goldPct = 0
  p.xpPct = 0

  // Class innate modifiers apply first — they are what the class IS.
  const cls = registry.classes.get(p.classId)
  if (cls?.mods) {
    const m = cls.mods
    if (m.maxHealth) p.maxHealth += m.maxHealth
    if (m.regen) p.regen += m.regen
    if (m.armor) p.defenses.armor += m.armor
    if (m.moveSpeedPct) p.moveSpeed += (BASE.moveSpeed * m.moveSpeedPct) / 100
    if (m.xpPct) p.xpPct += m.xpPct
    if (m.goldPct) p.goldPct += m.goldPct
    if (m.allPct) p.allPct += m.allPct
  }

  for (const owned of p.perks) {
    const def = registry.perk(owned.perkId)
    const amount = def.amount * TIER_MULTIPLIER[owned.tier]
    switch (def.attribute) {
      case 'maxHealth': p.maxHealth += amount; break
      case 'regen': p.regen += amount * 0.1; break // shown as whole "Recovery", ticks smoothly
      case 'armor': p.defenses.armor += amount; break
      case 'dodge': p.defenses.dodge += amount / 100; break
      case 'flatReduction': p.defenses.flatReduction += amount; break
      case 'resist': p.defenses.resist += amount / 100; break
      case 'lifesteal': p.lifesteal += amount / 100; break
      case 'moveSpeed': p.moveSpeed += (BASE.moveSpeed * amount) / 100; break
      case 'pickupRadius': p.pickupRadius += (BASE.pickupRadius * amount) / 100; break
      case 'meleePct': p.meleePct += amount; break
      case 'rangedPct': p.rangedPct += amount; break
      case 'magicPct': p.magicPct += amount; break
      case 'allPct': p.allPct += amount; break
      case 'cooldownPct': p.cooldownPct += amount; break
      case 'goldPct': p.goldPct += amount; break
      case 'xpPct': p.xpPct += amount; break
    }
  }

  // Caps that keep stacking honest.
  p.defenses.dodge = Math.min(0.6, p.defenses.dodge)
  p.cooldownPct = Math.min(50, p.cooldownPct)

  // Preserve missing health rather than current health, so a max-health perk
  // grants its new health immediately instead of leaving the player hurt.
  p.health = Math.max(1, p.maxHealth - healthMissing)
}

/**
 * Damage multiplier for a specific weapon, from the owner's build:
 * type bonus + all-damage bonus + the class's tag affinities.
 */
export function damageMultiplier(
  p: PlayerState,
  weapon: WeaponDef,
  registry: Registry,
): number {
  const typePct =
    weapon.damageType === 'Melee' ? p.meleePct :
    weapon.damageType === 'Ranged' ? p.rangedPct :
    weapon.damageType === 'Magic' ? p.magicPct : 0
  let affinityPct = 0
  const cls = registry.classes.get(p.classId)
  if (cls?.affinities) {
    for (const a of cls.affinities) {
      if (weapon.tags.includes(a.tag)) affinityPct += a.pct
    }
  }
  return Math.max(0.1, 1 + (p.allPct + typePct + affinityPct) / 100)
}
