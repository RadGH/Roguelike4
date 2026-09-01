import type { DamageType } from '../data/tags'
import type { Defenses } from '../systems/damage'

/**
 * The full mutable state of a run's arena simulation. Plain data only —
 * serializable, hashable, and renderer-agnostic. The renderer reads it;
 * only Sim.tick() writes it.
 */

export interface PlayerState {
  id: number
  /** Class def id — the starting configuration this character was built from. */
  classId: string
  x: number
  y: number
  /** Unit movement intent from input, applied at tick time. */
  moveX: number
  moveY: number
  health: number
  maxHealth: number
  moveSpeed: number
  /** Passive health per second. */
  regen: number
  /** 0..1 fraction of damage dealt returned as healing. Any source, any type. */
  lifesteal: number
  defenses: Defenses
  xp: number
  level: number
  /** Level-ups not yet spent on a perk draft (drafts open at intermission). */
  pendingDrafts: number
  /** How many class item grants have been claimed. */
  grantsClaimed: number
  gold: number
  /** Pickup attraction radius in world units. */
  pickupRadius: number
  /** Drafted perks (the numbers layer of the build). */
  perks: OwnedPerk[]
  /** Passive items carried (the effects layer). Duplicates stack. */
  items: string[]
  /** A-slot equipment items (count is a class trait; usually one). */
  equipment: ActiveSlot[]
  /** B-slot movement items (count is a class trait; usually one). */
  movement: ActiveSlot[]
  /** Seconds until the next movement-trail drop (trail classes only). */
  trailCd: number
  /** Whole-number percent modifiers derived from perks (see stats.ts). */
  /** Transient aura bonuses, rebuilt every tick from carried aura items. */
  auraAllPct: number
  auraRegen: number
  meleePct: number
  rangedPct: number
  magicPct: number
  petPct: number
  allPct: number
  cooldownPct: number
  goldPct: number
  xpPct: number
  /** Equipped weapon instance list (ids into registry + per-instance state). */
  weapons: WeaponInstance[]
  /** False only when fully dead (bled out); dead players return at wave clear. */
  alive: boolean
  /**
   * Downed: at zero health with teammates still standing. Immobile, holds
   * fire, ignored by enemies, revivable in place. Bleeding out leads to dead.
   */
  downed: boolean
  /** Seconds until a downed player bleeds out. */
  bleedOut: number
  /** Seconds of teammate proximity accumulated toward a revive. */
  reviveProgress: number
}

export interface ActiveSlot {
  defId: string
  /** Seconds until usable again. */
  cdLeft: number
}

export interface OwnedPerk {
  perkId: string
  /** 0-based tier index into TIER_MULTIPLIER (White/Blue/Yellow/Green). */
  tier: number
}

export interface WeaponInstance {
  defId: string
  /** Quality tier index (White/Blue/Yellow/Green). Multiplies damage. */
  tier: number
  /** Seconds until this weapon may fire again. */
  cooldownLeft: number
  /** Per-weapon stagger offset so weapons spread across targets. */
  staggerOffset: number
  /** Melee wind-up: seconds until the committed swing lands (0 = idle). */
  windupLeft: number
  /** Target the wind-up committed to when it began. */
  windupTargetId: number | null
  /** Entity id of the current target, if any (render reads this for aim). */
  targetId: number | null
  /** Sim tick of the last shot — the renderer animates the melee lunge from it. */
  firedTick: number
}

export interface EnemyState {
  id: number
  defId: string
  x: number
  y: number
  health: number
  maxHealth: number
  /** Velocity carried between ticks for flocking smoothness. */
  vx: number
  vy: number
  /** Ticks since last damaged (for lastDamaged targeting). */
  lastDamagedTick: number
  /** Seconds until this enemy may land another contact hit. */
  touchCdLeft: number
  /** Seconds until a ranged/special enemy may attack again. */
  attackCdLeft: number
  /**
   * Behavior state machine for special archetypes (charger, burrower, flyer,
   * boss). 0 is always the default mode; meanings are per-archetype.
   */
  mode: number
  /** Seconds remaining in the current mode. */
  modeTime: number
  /** Committed movement direction for charges and dives. */
  dirX: number
  dirY: number
  /** Elite modifier, if any. */
  elite: EliteKind | null
  /** Burn: damage over time, attributed to whoever lit the fire. */
  burnDps: number
  burnTtl: number
  burnOwnerId: number
  burnSourceId: string
  /** Shocked: takes extra damage from everything; Lightning arcs off it. */
  shockTtl: number
  /** Chilled: slowed, with diminishing returns per reapplication. */
  chillTtl: number
  chillSlow: number
  chillsApplied: number
  /** Poison: stacking damage over time, no cap by design. */
  poisonDps: number
  poisonTtl: number
  poisonOwnerId: number
  poisonSourceId: string
  /** The Grudge: grows stronger each time it is damaged but not killed. */
  rage: number
  /** Reflectors: time until the mirror can return damage again. */
  reflectCdLeft: number
}

export type EliteKind = 'resistant' | 'enlarged' | 'shrunk'

/**
 * A lingering ground hazard on the floor plane: exploder pools, webbing.
 * Damages and/or slows players standing inside.
 */
export interface PoolState {
  id: number
  x: number
  y: number
  radius: number
  /** Damage per second to players inside (0 for pure slows). */
  dps: number
  /** Movement multiplier applied to players inside (1 = no slow). */
  slowFactor: number
  /** Seconds remaining. */
  ttl: number
  sourceId: string
  /** Present on player-made pools: damages enemies, attributed to the owner. */
  ownerId?: number
  /** Dormant until this many seconds pass (the Seeder's buried hazards). */
  armDelay?: number
}

export interface ProjectileState {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  damageType: DamageType
  /** Player who owns it, for attribution. */
  ownerId: number
  sourceId: string
  /** Remaining lifetime in seconds. */
  ttl: number
  /** Splash radius on impact (area weapons). */
  aoe?: number
  /** Zigzag flight (thrown stars): degrees of alternating deflection. */
  wobble?: number
  wobblePhase?: number
}

export interface PickupState {
  id: number
  kind: 'gold' | 'xp'
  amount: number
  x: number
  y: number
  /** Set when auto-collect is sweeping it toward a player. */
  magnetTo: number | null
}

/** An allied entity fighting on a player's behalf (companion or structure). */
export interface PetState {
  id: number
  defId: string
  ownerId: number
  x: number
  y: number
  vx: number
  vy: number
  /** Mortal pets only; invulnerable pets keep full health forever. */
  health: number
  maxHealth: number
  /** Seconds until a killed mortal companion returns (0 = active). */
  respawnLeft: number
  /** Temporary allies vanish when this hits zero (0 = permanent). */
  expireLeft: number
  cooldownLeft: number
  targetId: number | null
  /** Sim tick of the last attack, for the renderer's lunge. */
  firedTick: number
}

export type TelegraphSeverity = 'light' | 'heavy' | 'extreme'

/**
 * A telegraphed danger zone on the floor plane. The longer the window, the
 * larger the payload — the tell itself is the information. Damage lands once,
 * when the window expires, on anything still inside.
 */
export interface TelegraphState {
  id: number
  x: number
  y: number
  radius: number
  severity: TelegraphSeverity
  /** Full reaction window in seconds. */
  window: number
  /** Seconds remaining before impact. */
  timeLeft: number
  damage: number
  damageType: DamageType
  /** Enemy def that owns it, for attribution and death-cleanup decisions. */
  sourceId: string
}

export interface WaveRuntime {
  /** 1-based wave number; 0 = not started. */
  number: number
  /** Seconds elapsed in the current wave. */
  elapsed: number
  /** Spawn groups not yet fully spawned. */
  pendingSpawns: PendingSpawn[]
  /** Enemies deferred by the density cap, spawned as space frees up. */
  deferred: DeferredSpawn[]
  /** Chests found this wave (capped — difficulty is not luck). */
  chestsDropped: number
  cleared: boolean
}

export interface PendingSpawn {
  at: number
  enemy: string
  remaining: number
  spacing: number
  nextAt: number
  elite: EliteKind | null
}

export interface DeferredSpawn {
  enemy: string
  elite: EliteKind | null
}

export interface SimState {
  tick: number
  /** Seconds of simulated time. */
  time: number
  nextEntityId: number
  players: PlayerState[]
  enemies: EnemyState[]
  projectiles: ProjectileState[]
  pickups: PickupState[]
  telegraphs: TelegraphState[]
  pools: PoolState[]
  pets: PetState[]
  wave: WaveRuntime
  /** Arena half-extents in world units (arena is a bounded rectangle). */
  arenaW: number
  arenaH: number
}
