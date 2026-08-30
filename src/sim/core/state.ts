import type { DamageType } from '../data/tags'

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
  xp: number
  level: number
  gold: number
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
  wave: WaveRuntime
  /** Arena half-extents in world units (arena is a bounded rectangle). */
  arenaW: number
  arenaH: number
}
