import type { PlayerState } from '../core/state'
import type { Registry } from '../data/registry'
import { TIER_MULTIPLIER, type WeaponDef } from '../data/types'
import { emptyDefenses } from './damage'
import { resolveItem } from '../data/variants'

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

function applyAttribute(p: PlayerState, attribute: string, amount: number): void {
  switch (attribute) {
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
    case 'petPct': p.petPct += amount; break
    case 'allPct': p.allPct += amount; break
    case 'cooldownPct': p.cooldownPct += amount; break
    case 'goldPct': p.goldPct += amount; break
    case 'xpPct': p.xpPct += amount; break
  }
}

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
  p.petPct = 0
  p.allPct = 0
  p.cooldownPct = 0
  p.goldPct = 0
  p.xpPct = 0

  // Class innate modifiers apply first — they are what the class IS.
  const cls = registry.classes.get(p.classId)
  if (cls?.mods) {
    const m = cls.mods
    if (m.maxHealth) p.maxHealth += m.maxHealth
    if (m.regen) p.regen += m.regen * 0.1
    if (m.armor) p.defenses.armor += m.armor
    if (m.moveSpeedPct) p.moveSpeed += (BASE.moveSpeed * m.moveSpeedPct) / 100
    if (m.xpPct) p.xpPct += m.xpPct
    if (m.goldPct) p.goldPct += m.goldPct
    if (m.allPct) p.allPct += m.allPct
    if (m.lifesteal) p.lifesteal += m.lifesteal / 100
  }
  // The Looter's trade: max health per item carried.
  if (cls?.healthPerItem) p.maxHealth += cls.healthPerItem * p.items.length

  // Passive items: stat effects stack per copy carried. The Curator shrugs
  // off half of every curse — only the negative halves of cursed items scale.
  const curseScale = cls?.cursedPenaltyPct !== undefined ? cls.cursedPenaltyPct / 100 : 1
  for (const itemId of p.items) {
    const item = resolveItem(registry, itemId)
    const cursed = itemId.startsWith('cursed:')
    for (const eff of item.effects) {
      if (eff.kind !== 'stat') continue
      const amount = cursed && eff.amount < 0 ? eff.amount * curseScale : eff.amount
      applyAttribute(p, eff.attribute, amount)
    }
  }

  for (const owned of p.perks) {
    const def = registry.perk(owned.perkId)
    applyAttribute(p, def.attribute, def.amount * TIER_MULTIPLIER[owned.tier])
  }

  // Shields count as weapons and carry their block with them.
  for (const w of p.weapons) {
    const def = registry.weapons.get(w.defId)
    if (def?.grantsBlock) p.defenses.block += def.grantsBlock
  }

  // Caps that keep stacking honest.
  p.defenses.dodge = Math.min(0.6, p.defenses.dodge)
  p.cooldownPct = Math.min(50, p.cooldownPct)

  // Preserve missing health rather than current health, so a max-health perk
  // grants its new health immediately instead of leaving the player hurt.
  p.health = Math.max(1, p.maxHealth - healthMissing)
}

/**
 * A fresh character of this class, before any items, perks, or weapons —
 * the baseline that stat-deviation colouring compares against.
 */
export function classBaseline(classId: string, registry: Registry): PlayerState {
  const p: PlayerState = {
    id: -1,
    classId,
    x: 0, y: 0, moveX: 0, moveY: 0,
    health: 0, maxHealth: 0, moveSpeed: 0, regen: 0, lifesteal: 0,
    defenses: emptyDefenses(),
    xp: 0, level: 1, pendingDrafts: 0, grantsClaimed: 0, gold: 0,
    pickupRadius: 0,
    perks: [], items: [],
    equipment: [], movement: [], trailCd: 0,
    auraAllPct: 0, auraRegen: 0,
    meleePct: 0, rangedPct: 0, magicPct: 0, petPct: 0, allPct: 0,
    cooldownPct: 0, goldPct: 0, xpPct: 0,
    weapons: [],
    alive: true, downed: false, bleedOut: 0, reviveProgress: 0,
  }
  recomputePlayer(p, registry)
  return p
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
  return Math.max(0.1, 1 + (p.allPct + p.auraAllPct + typePct + affinityPct) / 100)
}
