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
  /** Fires this many projectiles in a fan (default 1). */
  projectileCount?: number
  /** Flat block granted while equipped (shields count as weapons). */
  grantsBlock?: number
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
  /** Spawners: enemy id produced while alive (cadence via props.spawnCd). */
  spawnId?: string
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
  | 'meleePct' | 'rangedPct' | 'magicPct' | 'petPct' | 'allPct'
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

/**
 * A class is a starting configuration plus tag relationships — never a
 * bundle of unique abilities. Later classes are differently shaped, not
 * stronger (the sidegrade rule).
 */
export interface ClassDef {
  id: string
  name: string
  description: string
  weaponSlots: number
  startingWeapons: string[]
  /** Slot items the class begins with (found/swappable content, not innate). */
  startingEquipment?: string
  startingMovement?: string
  /** Passive items the class begins with (e.g. the Engineer's turret kit). */
  startingItems?: string[]
  /**
   * Class item grants: at the listed level, the intermission offers a free
   * choice among the class's signature items — identity guaranteed, choice
   * preserved. Options are item or slot-item ids.
   */
  grants?: { level: number; options: string[] }[]
  /** Innate stat modifiers, applied before perks in the recompute. */
  mods?: Partial<Record<
    'maxHealth' | 'moveSpeedPct' | 'xpPct' | 'goldPct' | 'allPct' | 'armor' | 'regen' | 'lifesteal',
    number
  >>
  /** Permanent self-damage per second (the Vampire's clock). */
  selfDamagePerSec?: number
  /** Max health granted per item carried (the Looter's trade). */
  healthPerItem?: number
  /** Personal shop price adjustment in percent (+25 = pays a quarter more). */
  shopPricePct?: number
  /** Tag affinities: percent damage bonus/penalty when a weapon carries the tag. */
  affinities?: { tag: Tag; pct: number }[]
}

/**
 * Passive items: found in chests during waves (capped per wave — difficulty
 * is not luck), unveiled at the rewards screen, kept or sold. They accumulate;
 * stacking a second copy compounds. Effects are authored, not emergent.
 */
export type ItemEffect =
  | { kind: 'stat'; attribute: PerkAttribute; amount: number }
  | { kind: 'summon'; petId: string; count: number }
  | { kind: 'onKillExplode'; chance: number; radius: number; damage: number }
  | { kind: 'onKillHeal'; chance: number; amount: number }
  | { kind: 'onPickupDamage'; chance: number; radius: number; damage: number }
  | { kind: 'onPickupHeal'; chance: number; amount: number }

export interface ItemDef {
  id: string
  name: string
  /** One-line, quarter-screen legible. */
  description: string
  tags: Tag[]
  price: number
  effects: ItemEffect[]
}

/**
 * Active slot items: the entire manual input surface beyond movement.
 * Equipment fills the A slot (long cooldown, impactful, positional where
 * possible); movement items fill the B slot (short cooldown repositioning,
 * no invulnerability). One of each, exclusive, may be empty.
 */
export type ActiveEffect =
  | { kind: 'repulse'; radius: number; push: number }
  | { kind: 'maelstrom'; radius: number; pull: number }
  | { kind: 'groundSlam'; radius: number; damage: number }
  | { kind: 'heal'; radius: number; amount: number }
  | { kind: 'dash'; distance: number }
  | { kind: 'blink'; distance: number }

export interface ActiveDef {
  id: string
  name: string
  description: string
  slot: 'equipment' | 'movement'
  tags: Tag[]
  /** Seconds between uses. Equipment: long. Movement: short. */
  cooldown: number
  price: number
  effect: ActiveEffect
}

/**
 * Pets and structures: entities that fight for a player without being
 * controlled. The mortality split is the interesting part — structures and
 * tiny creatures are invulnerable (the player cannot protect them, so they
 * cannot die); large companions are mortal with a short respawn.
 * All pet damage is the Pet type and scales with the owner's pet bonuses.
 */
export interface PetDef {
  id: string
  name: string
  kind: 'companion' | 'structure'
  mortal: boolean
  health?: number
  /** Seconds until a killed mortal companion returns. */
  respawn?: number
  damage: number
  cooldown: number
  range: number
  /** Companions move; structures have speed 0. */
  speed: number
  radius: number
  targeting: TargetingRule
  /** Ranged pets emit projectiles at this speed; melee pets lunge. */
  projectileSpeed?: number
}

/** Behavioral unlock conditions — they ask you to DO something, not to grind. */
export type UnlockCondition =
  | { type: 'run-as-class'; classId: string }   // finish a run, win or lose
  | { type: 'win-act'; actId: string }
  | { type: 'reach-wave'; wave: number }
  | { type: 'total-kills'; count: number }      // lifetime, any run
  | { type: 'kills-in-one-wave'; count: number }

export interface UnlockDef {
  id: string
  name: string
  /** Player-facing condition text (visible before it is met — codex rule). */
  description: string
  condition: UnlockCondition
  rewards: { kind: 'class' | 'weapon' | 'perk'; id: string }[]
}

export interface SpawnGroup {
  /** Seconds after wave start. */
  at: number
  enemy: string
  count: number
  /** Seconds between individual spawns within the group (0 = all at once). */
  spacing?: number
  /** Elite modifier applied to every enemy in the group. */
  elite?: 'resistant' | 'enlarged' | 'shrunk'
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
