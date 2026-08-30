import type { DamageType, Tag } from './tags'

/**
 * Content definition types. All game content is data: JSON files validated
 * against these shapes and loaded into a registry. The sim reads only
 * definitions from the registry — the same data drives the real game, the
 * headless simulator, and (eventually) the companion website.
 */

/** How a weapon (or pet/structure) picks its target. A property, not a global. */
export type TargetingRule =
  | 'nearest'
  | 'lowestHealth'
  | 'highestHealth'
  | 'farthest'
  | 'densest'
  | 'lastDamaged'

export interface WeaponDef {
  id: string
  name: string
  tags: Tag[]
  damageType: DamageType
  /** Base damage per hit before tier multipliers and stats. */
  damage: number
  /** Seconds between shots when a valid target exists. */
  cooldown: number
  /** World-unit range. Independent of damage type — melee at range exists. */
  range: number
  targeting: TargetingRule
  /** Melee weapons lunge; ranged emit a projectile with this speed. */
  projectileSpeed?: number
  /** Shop price at tier 1 (weapons are shop-only). */
  price: number
}

export type EnemyArchetype =
  | 'swarm' | 'chaser' | 'ranged' | 'charger' | 'exploder'
  | 'flyer' | 'blocker' | 'burrower' | 'spawner' | 'retaliator'

export interface EnemyDef {
  id: string
  name: string
  archetype: EnemyArchetype
  health: number
  damage: number
  /** World units per second. */
  speed: number
  /** Body radius in world units (collision + separation). */
  radius: number
  xp: number
  gold: number
  /** Flocking weights; omit for solitary movers. */
  flock?: { separation: number; alignment: number; cohesion: number }
  /** Splitters: on death, spawn `splitInto` copies of enemy `splitTo`. */
  splitInto?: number
  splitTo?: string
  /** Archetype-specific tuning knobs (standoff distance, ...). */
  props?: Record<string, number>
}

/**
 * Perks are the numbers layer of a build: per-character attribute unlocks
 * obtained only through level-up drafts. Every perk affects one attribute.
 * The tier it rolls at multiplies `amount` (whole numbers only).
 */
export type PerkAttribute =
  | 'maxHealth' | 'regen' | 'armor' | 'dodge' | 'flatReduction' | 'resist'
  | 'lifesteal' | 'moveSpeed' | 'pickupRadius'
  | 'meleePct' | 'rangedPct' | 'magicPct' | 'allPct'
  | 'cooldownPct' | 'goldPct' | 'xpPct'

export interface PerkDef {
  id: string
  name: string
  attribute: PerkAttribute
  /** Whole-number magnitude at tier 1; tiers multiply it. */
  amount: number
  tags: Tag[]
}

/** Quality tiers: one colour ladder for everything tiered. */
export const TIER_MULTIPLIER = [1, 2, 3, 4] as const
export const TIER_NAMES = ['White', 'Blue', 'Yellow', 'Green'] as const

export interface SpawnGroup {
  /** Seconds after wave start. */
  at: number
  enemy: string
  count: number
  /** Seconds between individual spawns within the group (0 = all at once). */
  spacing?: number
}

export interface WaveDef {
  /** 1-based wave number within the act. */
  wave: number
  groups: SpawnGroup[]
}

export interface ActDef {
  id: string
  name: string
  waves: WaveDef[]
  boss: string
}
