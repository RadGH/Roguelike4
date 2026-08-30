import type { DamageType } from '../data/tags'
import type { Defenses } from '../systems/damage'

/**
 * The full mutable state of a run's arena simulation. Plain data only —
 * serializable, hashable, and renderer-agnostic. The renderer reads it;
 * only Sim.tick() writes it.
 */

export interface PlayerState {
  id: number
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
  gold: number
  /** Pickup attraction radius in world units. */
  pickupRadius: number
  /** Equipped weapon instance list (ids into registry + per-instance state). */
  weapons: WeaponInstance[]
  alive: boolean
}

export interface WeaponInstance {
  defId: string
  /** Seconds until this weapon may fire again. */
  cooldownLeft: number
  /** Per-weapon stagger offset so weapons spread across targets. */
  staggerOffset: number
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
  deferred: string[]
  cleared: boolean
}

export interface PendingSpawn {
  at: number
  enemy: string
  remaining: number
  spacing: number
  nextAt: number
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
  wave: WaveRuntime
  /** Arena half-extents in world units (arena is a bounded rectangle). */
  arenaW: number
  arenaH: number
}
