import { Rng } from './rng'
import { hashState } from './hash'
import { clamp, dist, distSq, moveToward, norm } from './math'
import type {
  DeferredSpawn, EliteKind, EnemyState, PetState, PickupState, PlayerState,
  ProjectileState, SimState, TelegraphSeverity, WeaponInstance,
} from './state'
import type { Registry } from '../data/registry'
import type { ActiveDef, EnemyDef, WaveDef } from '../data/types'
import type { DamageType } from '../data/tags'
import { Tracker } from '../systems/tracker'
import { emptyDefenses, resolveDamage, xpForLevel } from '../systems/damage'
import { damageMultiplier, recomputePlayer } from '../systems/stats'
import { resolveItem } from '../data/variants'

/** Telegraph severities: the longer the window, the larger the payload. */
export const TELEGRAPH_WINDOWS: Record<TelegraphSeverity, number> = {
  light: 0.9,
  heavy: 1.6,
  extreme: 2.6,
}

/** Fixed timestep: 30 sim ticks per second. Rendering interpolates freely. */
export const TICK_RATE = 30
export const TICK_DT = 1 / TICK_RATE

/** Enemies on the field above this count are deferred, not stacked (readability rule). */
export const DENSITY_CAP = 220

/** Weapon quality tiers multiply damage; higher tiers appear in later shops. */
export const WEAPON_TIER_MULT = [1, 1.5, 2, 2.6]

/** Downed-and-revive tuning (fun over punishment — nobody sits out long). */
export const BLEED_OUT_SECONDS = 15
export const REVIVE_RADIUS = 1.6
export const REVIVE_SECONDS = 3
export const REVIVE_HEALTH_FRACTION = 0.5

export interface SimOptions {
  seed: number
  playerCount: number
  /** Class per player id; defaults to the Student for any unspecified. */
  classIds?: string[]
}

/**
 * The deterministic arena simulation. Pure data in (registry, inputs), pure
 * data out (state, tracker events). No rendering, no real time, no Math.random.
 * The real game and headless Simulation Mode both run exactly this class.
 */
export class Sim {
  readonly state: SimState
  readonly tracker = new Tracker()
  private readonly rng: Rng
  private readonly rngSpawn: Rng
  private readonly rngCombat: Rng
  private waveTable: WaveDef[] = []

  constructor(readonly registry: Registry, opts: SimOptions) {
    this.rng = new Rng(opts.seed)
    this.rngSpawn = this.rng.fork('spawn')
    this.rngCombat = this.rng.fork('combat')
    this.state = {
      tick: 0,
      time: 0,
      nextEntityId: 1,
      players: [],
      enemies: [],
      projectiles: [],
      pickups: [],
      telegraphs: [],
      pools: [],
      pets: [],
      wave: { number: 0, elapsed: 0, pendingSpawns: [], deferred: [], chestsDropped: 0, cleared: true },
      arenaW: 28,
      arenaH: 20,
    }
    for (let i = 0; i < opts.playerCount; i++) {
      this.addPlayer(i, opts.classIds?.[i] ?? 'student')
    }
  }

  private addPlayer(id: number, classId: string): void {
    const p: PlayerState = {
      id,
      classId,
      x: -2 + id * 1.5,
      y: 0,
      moveX: 0,
      moveY: 0,
      health: 20,
      maxHealth: 20,
      moveSpeed: 5,
      regen: 0,
      lifesteal: 0,
      defenses: emptyDefenses(),
      xp: 0,
      level: 1,
      pendingDrafts: 0,
      grantsClaimed: 0,
      gold: 0,
      pickupRadius: 1.5,
      perks: [],
      items: [],
      equipment: [],
      movement: [],
      trailCd: 0,
      auraAllPct: 0,
      auraRegen: 0,
      meleePct: 0,
      rangedPct: 0,
      magicPct: 0,
      petPct: 0,
      allPct: 0,
      cooldownPct: 0,
      goldPct: 0,
      xpPct: 0,
      weapons: [],
      alive: true,
      downed: false,
      bleedOut: 0,
      reviveProgress: 0,
    }
    this.state.players.push(p)
    // Apply the class's innate modifiers immediately.
    recomputePlayer(p, this.registry)
    p.health = p.maxHealth
  }

  /** Players who can act: standing, not downed. */
  activePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.alive && !p.downed)
  }

  /** Hot-join: a new player enters mid-run beside player 1, at half health. */
  addPlayerMidRun(classId: string): PlayerState {
    const id = this.state.players.length
    this.addPlayer(id, classId)
    const p = this.state.players[id]
    const anchor = this.activePlayers()[0] ?? this.state.players[0]
    p.x = clamp(anchor.x + 1.5, -this.state.arenaW / 2, this.state.arenaW / 2)
    p.y = anchor.y
    p.health = Math.round(p.maxHealth / 2)
    return p
  }

  equipWeapon(playerId: number, weaponDefId: string, tier = 0): void {
    const def = this.registry.weapon(weaponDefId)
    const p = this.player(playerId)
    const inst: WeaponInstance = {
      defId: def.id,
      tier,
      cooldownLeft: 0,
      // Stagger spreads target selection so multiple weapons fan out.
      staggerOffset: (p.weapons.length * 0.37) % 1,
      targetId: null,
      firedTick: -1000,
    }
    p.weapons.push(inst)
    recomputePlayer(p, this.registry) // weapons can grant defenses (shields)
  }

  player(id: number): PlayerState {
    const p = this.state.players.find((x) => x.id === id)
    if (!p) throw new Error(`no player ${id}`)
    return p
  }

  setMoveIntent(playerId: number, x: number, y: number): void {
    const p = this.player(playerId)
    const n = norm(x, y)
    p.moveX = n.x
    p.moveY = n.y
  }

  startWave(waves: WaveDef[], waveNumber: number): void {
    this.waveTable = waves
    const def = waves.find((w) => w.wave === waveNumber)
    if (!def) throw new Error(`no wave ${waveNumber}`)
    this.state.wave = {
      number: waveNumber,
      elapsed: 0,
      cleared: false,
      deferred: [],
      chestsDropped: 0,
      pendingSpawns: def.groups.map((g) => ({
        at: g.at,
        enemy: g.enemy,
        // Spawn counts scale with the head-count: +50% per extra player.
        remaining: Math.round(g.count * (1 + 0.5 * (this.state.players.length - 1))),
        spacing: g.spacing ?? 0,
        nextAt: g.at,
        elite: g.elite ?? null,
      })),
    }
    this.rebuildPets()
  }

  /**
   * Pets are rebuilt from carried summon items at every wave start:
   * structures deploy at a random arena point (the player does not place
   * them), companions gather at their owner. Deaths never outlive a wave.
   */
  private rebuildPets(): void {
    const s = this.state
    s.pets = []
    for (const p of s.players) {
      for (const itemId of p.items) {
        const item = resolveItem(this.registry, itemId)
        for (const eff of item.effects) {
          if (eff.kind !== 'summon') continue
          for (let i = 0; i < eff.count; i++) this.spawnPet(p, eff.petId)
        }
      }
    }
  }

  private spawnPet(owner: PlayerState, petId: string, expire = 0): void {
    const s = this.state
    const def = this.registry.pet(petId)
    const structure = def.kind === 'structure'
    const x = structure
      ? (this.rngSpawn.next() - 0.5) * s.arenaW * 0.7
      : clamp(owner.x + (this.rngSpawn.next() - 0.5) * 2, -s.arenaW / 2, s.arenaW / 2)
    const y = structure
      ? (this.rngSpawn.next() - 0.5) * s.arenaH * 0.7
      : clamp(owner.y + (this.rngSpawn.next() - 0.5) * 2, -s.arenaH / 2, s.arenaH / 2)
    s.pets.push({
      id: s.nextEntityId++,
      defId: petId,
      ownerId: owner.id,
      x,
      y,
      vx: 0,
      vy: 0,
      health: def.health ?? 1,
      maxHealth: def.health ?? 1,
      respawnLeft: 0,
      expireLeft: expire,
      cooldownLeft: 0,
      targetId: null,
      firedTick: -1000,
    })
  }

  private tickPets(): void {
    const s = this.state
    for (const pet of s.pets) {
      if (pet.expireLeft > 0) {
        pet.expireLeft -= TICK_DT
        if (pet.expireLeft <= 0) pet.expireLeft = -1 // marked for removal
      }
      const def = this.registry.pet(pet.defId)
      const owner = s.players.find((p) => p.id === pet.ownerId)
      if (!owner) continue

      // Mortal companions respawn at their owner after a short wait.
      if (pet.respawnLeft > 0) {
        pet.respawnLeft -= TICK_DT
        if (pet.respawnLeft <= 0) {
          pet.health = pet.maxHealth
          pet.x = owner.x
          pet.y = owner.y
        }
        continue
      }

      pet.cooldownLeft -= TICK_DT

      // Companions follow: chase nearby enemies, else return to the owner.
      if (def.kind === 'companion') {
        let target: EnemyState | null = null
        let best = 36 // engage within 6 units of the pet
        for (const e of s.enemies) {
          if (!this.isTargetable(e)) continue
          const d2 = distSq(e, pet)
          if (d2 < best) { best = d2; target = e }
        }
        const goal = target ?? owner
        const d = dist(pet, goal)
        const keep = target ? def.range * 0.7 : 1.2
        if (d > keep) {
          const n = norm(goal.x - pet.x, goal.y - pet.y)
          pet.vx = n.x * def.speed
          pet.vy = n.y * def.speed
          pet.x = clamp(pet.x + pet.vx * TICK_DT, -s.arenaW / 2, s.arenaW / 2)
          pet.y = clamp(pet.y + pet.vy * TICK_DT, -s.arenaH / 2, s.arenaH / 2)
        } else {
          pet.vx = 0
          pet.vy = 0
        }
      }

      // Attack: same hold-fire discipline as weapons, Pet damage type.
      if (pet.cooldownLeft <= 0) {
        let target: EnemyState | null = null
        let bestD = def.range * def.range
        for (const e of s.enemies) {
          if (!this.isTargetable(e)) continue
          const d2 = distSq(e, pet)
          if (d2 <= bestD) { bestD = d2; target = e }
        }
        pet.targetId = target?.id ?? null
        if (target) {
          pet.cooldownLeft = def.cooldown
          pet.firedTick = s.tick
          // Conversion: some pets inherit a share of their owner's melee bonus.
          const ownerCls = this.registry.class(owner.classId)
          const inherited =
            ((def.inheritMeleePct ?? 0) + (ownerCls.petsInheritMeleePct ?? 0)) / 100 * owner.meleePct +
            (ownerCls.petsInheritMagicPct ?? 0) / 100 * owner.magicPct
          let damage = def.damage * (1 + (owner.allPct + owner.petPct + inherited) / 100)
          // The Artificer's structures improve as the run goes on.
          const tierWaves = ownerCls.structureTierWaves
          if (tierWaves && def.kind === 'structure') {
            damage *= 1 + 0.5 * Math.floor((s.wave.number - 1) / tierWaves)
          }
          const petType = def.damageType ?? 'Pet'
          if (def.projectileSpeed) {
            const n = norm(target.x - pet.x, target.y - pet.y)
            s.projectiles.push({
              id: s.nextEntityId++,
              x: pet.x,
              y: pet.y,
              vx: n.x * def.projectileSpeed,
              vy: n.y * def.projectileSpeed,
              damage,
              damageType: petType,
              ownerId: owner.id,
              sourceId: def.id,
              ttl: def.range / def.projectileSpeed + 0.2,
            })
          } else {
            this.damageEnemy(target, damage, owner.id, def.id, petType)
          }
        }
      }
    }
  }

  /** Enemy contact hits a mortal pet standing in the way (incidental, not hunted). */
  private damagePet(pet: PetState, amount: number): void {
    const def = this.registry.pet(pet.defId)
    if (!def.mortal || pet.respawnLeft > 0) return
    pet.health -= amount
    if (pet.health <= 0) {
      pet.health = 0
      pet.respawnLeft = def.respawn ?? 8
    }
  }

  /** Advance exactly one fixed tick. */
  tick(): void {
    const s = this.state
    s.tick++
    s.time += TICK_DT
    if (!s.wave.cleared) s.wave.elapsed += TICK_DT

    this.tickSpawns()
    this.tickPlayers()
    this.tickEnemies()
    this.tickPets()
    this.tickEffects()
    this.tickTelegraphs()
    this.tickPools()
    this.tickAuras()
    this.tickWeapons()
    this.tickProjectiles()
    this.tickPickups()
    this.checkWaveClear()
  }

  hash(): number {
    return hashState(this.state)
  }

  // ---- systems -------------------------------------------------------------

  private tickSpawns(): void {
    const s = this.state
    const w = s.wave
    if (w.cleared) return

    // Deferred spawns re-enter as the density cap frees up.
    while (w.deferred.length > 0 && s.enemies.length < DENSITY_CAP) {
      const d = w.deferred.shift() as DeferredSpawn
      this.spawnEnemy(d.enemy, d.elite)
    }

    for (const g of w.pendingSpawns) {
      while (g.remaining > 0 && w.elapsed >= g.nextAt) {
        if (s.enemies.length >= DENSITY_CAP) {
          w.deferred.push({ enemy: g.enemy, elite: g.elite })
        } else {
          this.spawnEnemy(g.enemy, g.elite)
        }
        g.remaining--
        g.nextAt += g.spacing
        if (g.spacing === 0) {
          // spacing 0 means the whole group this tick
          continue
        }
      }
    }
    w.pendingSpawns = w.pendingSpawns.filter((g) => g.remaining > 0)
  }

  private spawnEnemy(defId: string, elite: EliteKind | null = null): EnemyState {
    const def = this.registry.enemy(defId)
    const s = this.state
    // Spawn on the arena boundary, away from the nearest player.
    const side = this.rngSpawn.int(0, 3)
    const rx = this.rngSpawn.next()
    let x = 0
    let y = 0
    if (side === 0) { x = -s.arenaW / 2; y = (rx - 0.5) * s.arenaH }
    if (side === 1) { x = s.arenaW / 2; y = (rx - 0.5) * s.arenaH }
    if (side === 2) { y = -s.arenaH / 2; x = (rx - 0.5) * s.arenaW }
    if (side === 3) { y = s.arenaH / 2; x = (rx - 0.5) * s.arenaW }
    const hpScale = elite === 'enlarged' ? 1.8 : elite === 'shrunk' ? 0.8 : 1
    const e: EnemyState = {
      id: s.nextEntityId++,
      defId,
      x,
      y,
      health: Math.round(def.health * hpScale),
      maxHealth: Math.round(def.health * hpScale),
      vx: 0,
      vy: 0,
      lastDamagedTick: -1,
      touchCdLeft: 0,
      attackCdLeft: def.props?.attackCd ? def.props.attackCd * 0.5 : 0,
      mode: 0,
      modeTime: 0,
      dirX: 0,
      dirY: 0,
      elite,
      burnDps: 0,
      burnTtl: 0,
      burnOwnerId: -1,
      burnSourceId: '',
      shockTtl: 0,
      chillTtl: 0,
      chillSlow: 0,
      chillsApplied: 0,
      poisonDps: 0,
      poisonTtl: 0,
      poisonOwnerId: -1,
      poisonSourceId: '',
      rage: 0,
      reflectCdLeft: 0,
    }
    s.enemies.push(e)
    return e
  }

  /** Effective radius including elite size changes (readability: size = threat). */
  radiusOf(e: EnemyState): number {
    const def = this.registry.enemy(e.defId)
    const scale = e.elite === 'enlarged' ? 1.4 : e.elite === 'shrunk' ? 0.7 : 1
    return def.radius * scale
  }

  private speedOf(e: EnemyState, base: number): number {
    const scale = e.elite === 'enlarged' ? 0.75 : e.elite === 'shrunk' ? 1.5 : 1
    const chill = e.chillTtl > 0 ? 1 - e.chillSlow : 1
    return base * scale * chill
  }

  /** Burrowed enemies cannot be targeted or hit until they surface. */
  isTargetable(e: EnemyState): boolean {
    const def = this.registry.enemy(e.defId)
    if (def.archetype === 'burrower') return e.mode >= 5
    return true
  }

  private tickPlayers(): void {
    const s = this.state
    const active = this.activePlayers()
    for (const p of s.players) {
      if (!p.alive) continue

      if (p.downed) {
        // Rescue is a positional problem: a teammate must stand close and stay.
        const reviver = active.find((a) => dist(a, p) <= REVIVE_RADIUS)
        if (reviver) {
          p.reviveProgress += TICK_DT
          if (p.reviveProgress >= REVIVE_SECONDS) {
            p.downed = false
            p.reviveProgress = 0
            p.health = Math.max(1, Math.round(p.maxHealth * REVIVE_HEALTH_FRACTION))
          }
        } else {
          p.reviveProgress = Math.max(0, p.reviveProgress - TICK_DT)
        }
        p.bleedOut -= TICK_DT
        if (p.downed && p.bleedOut <= 0) {
          p.downed = false
          p.alive = false // bled out; returns at wave clear
        }
        continue
      }

      const speed = p.moveSpeed * this.slowFactorFor(p)
      p.x = clamp(p.x + p.moveX * speed * TICK_DT, -s.arenaW / 2, s.arenaW / 2)
      p.y = clamp(p.y + p.moveY * speed * TICK_DT, -s.arenaH / 2, s.arenaH / 2)
      if (p.regen + p.auraRegen > 0 && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + (p.regen + p.auraRegen) * TICK_DT)
      }
      // The Vampire's clock: unavoidable, unmitigated, always ticking.
      const selfDamage = this.registry.classes.get(p.classId)?.selfDamagePerSec
      if (selfDamage) {
        p.health -= selfDamage * TICK_DT
        if (p.health <= 0) {
          p.health = 0
          const others = this.activePlayers().filter((o) => o.id !== p.id)
          if (others.length > 0) {
            p.downed = true
            p.bleedOut = BLEED_OUT_SECONDS
            p.reviveProgress = 0
          } else {
            p.alive = false
          }
        }
      }
      for (const slot of p.equipment) { if (slot.cdLeft > 0) slot.cdLeft -= TICK_DT }
      for (const slot of p.movement) { if (slot.cdLeft > 0) slot.cdLeft -= TICK_DT }

      // Trail classes leave burning ground while moving (the Windrunner).
      const trail = this.registry.classes.get(p.classId)?.moveTrail
      if (trail && (p.moveX !== 0 || p.moveY !== 0)) {
        p.trailCd -= TICK_DT
        if (p.trailCd <= 0) {
          p.trailCd = trail.interval
          s.pools.push({
            id: s.nextEntityId++,
            x: p.x,
            y: p.y,
            radius: trail.radius,
            dps: trail.dps,
            slowFactor: 1,
            ttl: trail.ttl,
            sourceId: 'move-trail',
            ownerId: p.id,
          })
        }
      }
    }
  }

  /** How many of each slot type this player's class allows. */
  slotCapacity(playerId: number, kind: 'equipment' | 'movement'): number {
    const cls = this.registry.classes.get(this.player(playerId).classId)
    return kind === 'equipment' ? (cls?.equipmentSlots ?? 1) : (cls?.movementSlots ?? 1)
  }

  /**
   * Equip a slot item. Fills a free slot if the class allows more than one;
   * otherwise replaces the first. Returns the replaced def id, if any;
   * returns undefined-refused as null when the class has no such slot at all.
   */
  equipActive(playerId: number, defId: string): { replaced: string | null; ok: boolean } {
    const def = this.registry.active(defId)
    const p = this.player(playerId)
    const arr = def.slot === 'equipment' ? p.equipment : p.movement
    const capacity = this.slotCapacity(playerId, def.slot)
    if (capacity === 0) return { replaced: null, ok: false }
    if (arr.length < capacity) {
      arr.push({ defId: def.id, cdLeft: 0 })
      return { replaced: null, ok: true }
    }
    const old = arr[0].defId
    arr[0] = { defId: def.id, cdLeft: 0 }
    return { replaced: old, ok: true }
  }

  /** One button per slot type: fires the first ready item of that kind. */
  private useActiveOf(playerId: number, kind: 'equipment' | 'movement'): boolean {
    const p = this.player(playerId)
    if (!p.alive || p.downed) return false
    const arr = kind === 'equipment' ? p.equipment : p.movement
    const slot = arr.find((s2) => s2.cdLeft <= 0)
    if (!slot) return false
    const def = this.registry.active(slot.defId)
    this.executeActive(p, def)
    // The Quartermaster pattern: class-reduced equipment cooldowns.
    const cdPct = kind === 'equipment'
      ? (this.registry.classes.get(p.classId)?.equipmentCooldownPct ?? 0)
      : 0
    slot.cdLeft = def.cooldown * (1 - cdPct / 100)
    return true
  }

  /** The A button. */
  useEquipment(playerId: number): boolean {
    return this.useActiveOf(playerId, 'equipment')
  }

  /** The B button. */
  useMovement(playerId: number): boolean {
    return this.useActiveOf(playerId, 'movement')
  }

  private executeActive(p: PlayerState, def: ActiveDef): void {
    const s = this.state
    const eff = def.effect
    switch (eff.kind) {
      case 'repulse': {
        // Moves the horde without disabling it — space, not control.
        const r2 = eff.radius * eff.radius
        for (const e of s.enemies) {
          if (distSq(e, p) > r2) continue
          const n = norm(e.x - p.x, e.y - p.y)
          e.x = clamp(e.x + n.x * eff.push, -s.arenaW / 2, s.arenaW / 2)
          e.y = clamp(e.y + n.y * eff.push, -s.arenaH / 2, s.arenaH / 2)
        }
        break
      }
      case 'maelstrom': {
        // The offensive mirror of flocking: compress the horde yourself.
        const r2 = eff.radius * eff.radius
        for (const e of s.enemies) {
          if (distSq(e, p) > r2) continue
          const n = norm(p.x - e.x, p.y - e.y)
          const d = dist(e, p)
          const pull = Math.min(eff.pull, Math.max(0, d - 1))
          e.x = clamp(e.x + n.x * pull, -s.arenaW / 2, s.arenaW / 2)
          e.y = clamp(e.y + n.y * pull, -s.arenaH / 2, s.arenaH / 2)
        }
        break
      }
      case 'groundSlam': {
        const r2 = eff.radius * eff.radius
        for (const e of [...s.enemies]) {
          if (!this.isTargetable(e)) continue
          if (distSq(e, p) <= r2) {
            this.damageEnemy(e, eff.damage, p.id, def.id, 'Melee')
          }
        }
        break
      }
      case 'heal': {
        const r2 = eff.radius * eff.radius
        for (const ally of s.players) {
          if (!ally.alive || ally.downed) continue
          if (ally.id === p.id || distSq(ally, p) <= r2) {
            ally.health = Math.min(ally.maxHealth, ally.health + eff.amount)
          }
        }
        break
      }
      case 'summonPet': {
        s.pets.push({
          id: s.nextEntityId++,
          defId: eff.petId,
          ownerId: p.id,
          x: p.x,
          y: p.y,
          vx: 0, vy: 0,
          health: this.registry.pet(eff.petId).health ?? 1,
          maxHealth: this.registry.pet(eff.petId).health ?? 1,
          cooldownLeft: 0,
          respawnLeft: 0,
          targetId: null,
          firedTick: -999,
          expireLeft: eff.duration,
        })
        break
      }
      case 'dash':
      case 'blink': {
        // Purely positional; no invulnerability, no consequences cancelled.
        const dir = (p.moveX !== 0 || p.moveY !== 0)
          ? { x: p.moveX, y: p.moveY }
          : { x: 1, y: 0 }
        const n = norm(dir.x, dir.y)
        p.x = clamp(p.x + n.x * eff.distance, -s.arenaW / 2, s.arenaW / 2)
        p.y = clamp(p.y + n.y * eff.distance, -s.arenaH / 2, s.arenaH / 2)
        break
      }
    }
  }

  private tickEnemies(): void {
    const s = this.state
    // Enemies ignore downed players entirely — kicking someone who is down
    // adds nothing but misery, and the bleed-out timer is pressure enough.
    const alivePlayers = this.activePlayers()
    if (alivePlayers.length === 0) return

    // A living Beacon marks one player (nearest to it, re-marked on a timer,
    // stored in dirX — beacons never move so the field is free) and the whole
    // horde converges on them. Killing the beacon is the counterplay.
    let markedId = -1
    for (const e of s.enemies) {
      const bp = this.registry.enemy(e.defId).props
      if (!bp?.beacon) continue
      if (e.attackCdLeft <= 0 || !alivePlayers.some((p) => p.id === e.dirX)) {
        let t = alivePlayers[0]
        let bd = distSq(e, t)
        for (const p of alivePlayers) {
          const d = distSq(e, p)
          if (d < bd) { bd = d; t = p }
        }
        e.dirX = t.id
        e.attackCdLeft = bp.markCd ?? 8
      }
      markedId = e.dirX
      break
    }

    for (const e of s.enemies) {
      const def = this.registry.enemy(e.defId)
      // Nearest living player is the default pursuit target.
      let target = alivePlayers[0]
      let best = distSq(e, target)
      for (const p of alivePlayers) {
        const d = distSq(e, p)
        if (d < best) { best = d; target = p }
      }
      if (markedId >= 0 && !def.props?.beacon) {
        const marked = alivePlayers.find((p) => p.id === markedId)
        if (marked) target = marked
      }

      e.touchCdLeft -= TICK_DT
      e.attackCdLeft -= TICK_DT
      e.reflectCdLeft -= TICK_DT
      if (e.modeTime > 0) e.modeTime -= TICK_DT

      this.behave(e, def, target)

      // Contact damage: a discrete, dodgeable hit with a per-enemy cooldown.
      // Suppressed while airborne (mode 1) or burrowed.
      const canTouch = e.mode !== 1 && e.mode !== 2 && this.isTargetable(e) && def.damage > 0
      if (canTouch && e.touchCdLeft <= 0) {
        // A nearby Bannerman emboldens the hit.
        let banner = 1
        for (const b of this.bannermen) {
          if (b === e) continue
          const bp = this.registry.enemy(b.defId).props
          const r = bp?.auraRadius ?? 4
          if (distSq(b, e) <= r * r) {
            banner = 1 + (bp?.auraDamagePct ?? 30) / 100
            break
          }
        }
        let hit = false
        for (const p of alivePlayers) {
          const touch = this.radiusOf(e) + 0.4
          if (distSq(e, p) < touch * touch) {
            this.damagePlayer(p, def.damage * banner * (1 + e.rage * 0.1), 'Melee', def.id, true)
            e.touchCdLeft = def.props?.touchCd ?? 0.8
            hit = true
            break
          }
        }
        // A mortal pet standing in the way soaks the hit instead (body-block).
        if (!hit) {
          for (const pet of s.pets) {
            const touch = this.radiusOf(e) + 0.3
            if (pet.respawnLeft <= 0 && distSq(e, pet) < touch * touch) {
              this.damagePet(pet, def.damage)
              e.touchCdLeft = def.props?.touchCd ?? 0.8
              break
            }
          }
        }
      }
    }
  }

  /** Per-archetype behavior dispatch. Sets velocity and advances mode machines. */
  private behave(e: EnemyState, def: EnemyDef, target: PlayerState): void {
    const s = this.state
    const props = def.props ?? {}
    const speed = this.speedOf(e, def.speed)
    const d = dist(e, target)

    // Leap-slam (King Slime tiers): telegraph a zone, go airborne, land on it.
    if (props.slamCd) {
      if (e.mode === 1) {
        this.moveBy(e, e.dirX, e.dirY)
        if (e.modeTime <= 0) e.mode = 0
        return
      }
      if (e.attackCdLeft <= 0 && d <= (props.slamRange ?? 9)) {
        const severity = (['light', 'heavy', 'extreme'] as const)[props.slamSeverity ?? 1]
        const window = TELEGRAPH_WINDOWS[severity]
        const zx = clamp(target.x + target.moveX * target.moveSpeed * window * 0.6, -s.arenaW / 2, s.arenaW / 2)
        const zy = clamp(target.y + target.moveY * target.moveSpeed * window * 0.6, -s.arenaH / 2, s.arenaH / 2)
        this.pushTelegraph(zx, zy, props.slamRadius ?? 2, severity, props.slamDamage ?? def.damage, 'Melee', def.id)
        e.mode = 1
        e.modeTime = window
        e.dirX = (zx - e.x) / window
        e.dirY = (zy - e.y) / window
        e.attackCdLeft = props.slamCd
        return
      }
      // A slamming spawner (the Broodmother) keeps producing between leaps.
      if (def.spawnId) this.doSpawn(e, def)
      this.chaseMove(e, def, target, speed)
      return
    }

    switch (def.archetype) {
      case 'chaser': {
        // Leapers close in bursts: crouch, then a committed hop.
        if (props.hopCd) {
          if (e.mode === 7) { // crouch
            e.vx = 0; e.vy = 0
            if (e.modeTime <= 0) { e.mode = 8; e.modeTime = props.hopTime ?? 0.45 }
            return
          }
          if (e.mode === 8) { // airborne hop
            this.moveBy(e, e.dirX * (props.hopSpeed ?? 9), e.dirY * (props.hopSpeed ?? 9))
            if (e.modeTime <= 0) { e.mode = 0; e.attackCdLeft = props.hopCd }
            return
          }
          if (e.attackCdLeft <= 0 && d > 1.2) {
            const n = norm(target.x - e.x, target.y - e.y)
            e.mode = 7
            e.modeTime = props.hopCrouch ?? 0.4
            e.dirX = n.x
            e.dirY = n.y
            e.vx = 0; e.vy = 0
            return
          }
        }
        this.chaseMove(e, def, target, speed)
        return
      }

      case 'charger': {
        if (!props.chargeCd) { this.chaseMove(e, def, target, speed); return }
        if (e.mode === 2) { // windup: rooted, committed direction shown by the body
          e.vx = 0; e.vy = 0
          if (e.modeTime <= 0) { e.mode = 3; e.modeTime = props.chargeTime ?? 0.9 }
          return
        }
        if (e.mode === 3) { // the charge itself
          this.moveBy(e, e.dirX * (props.chargeSpeed ?? 10), e.dirY * (props.chargeSpeed ?? 10))
          const hitWall =
            Math.abs(e.x) >= s.arenaW / 2 - 0.05 || Math.abs(e.y) >= s.arenaH / 2 - 0.05
          if (e.modeTime <= 0 || hitWall) { e.mode = 0; e.attackCdLeft = props.chargeCd }
          return
        }
        if (e.attackCdLeft <= 0 && d < (props.chargeTrigger ?? 7)) {
          const n = norm(target.x - e.x, target.y - e.y)
          e.mode = 2
          e.modeTime = props.windup ?? 0.8
          e.dirX = n.x
          e.dirY = n.y
          e.vx = 0; e.vy = 0
          return
        }
        this.chaseMove(e, def, target, speed)
        return
      }

      case 'flyer': {
        if (e.mode === 4) { // dive
          this.moveBy(e, e.dirX * (props.diveSpeed ?? 9), e.dirY * (props.diveSpeed ?? 9))
          if (e.modeTime <= 0) { e.mode = 0; e.attackCdLeft = props.diveCd ?? 4 }
          return
        }
        if (e.attackCdLeft <= 0) {
          const n = norm(target.x - e.x, target.y - e.y)
          e.mode = 4
          e.modeTime = props.diveTime ?? 0.55
          e.dirX = n.x
          e.dirY = n.y
          return
        }
        // Harriers circle a fixed ring around the target between dives.
        if (props.orbitRadius) {
          const n = norm(target.x - e.x, target.y - e.y)
          const err = clamp(d - props.orbitRadius, -2, 2)
          const t = norm(-n.y + n.x * err * 0.5, n.x + n.y * err * 0.5)
          this.moveBy(e, t.x * speed, t.y * speed)
          return
        }
        // Erratic wander biased toward the target.
        if (e.modeTime <= 0) {
          const n = norm(
            (target.x - e.x) * 0.4 + (this.rngCombat.next() - 0.5) * 10,
            (target.y - e.y) * 0.4 + (this.rngCombat.next() - 0.5) * 10,
          )
          e.dirX = n.x
          e.dirY = n.y
          e.modeTime = props.wanderCd ?? 1.1
        }
        this.moveBy(e, e.dirX * speed, e.dirY * speed)
        return
      }

      case 'burrower': {
        if (e.mode === 5) { // erupting under its telegraph
          e.vx = 0; e.vy = 0
          if (e.modeTime <= 0) { e.mode = 6; e.modeTime = props.surfacedTime ?? 2.5 }
          return
        }
        if (e.mode === 6) { // surfaced and vulnerable
          this.chaseMove(e, def, target, speed)
          if (e.modeTime <= 0) e.mode = 0
          return
        }
        // Burrowed: fast underground tracking, then erupt with a tell.
        this.chaseMove(e, def, target, this.speedOf(e, props.burrowSpeed ?? 3.4))
        if (d < (props.eruptTrigger ?? 1.4)) {
          e.mode = 5
          e.modeTime = props.eruptWindow ?? 1.1
          this.pushTelegraph(e.x, e.y, props.eruptRadius ?? 1.4, 'heavy', def.damage, 'Melee', def.id)
        }
        return
      }

      case 'spawner': {
        // Mobile spawners (the Caller) drift toward the fight; sacs sit still.
        if (def.speed > 0) this.chaseMove(e, def, target, speed * 0.6)
        else { e.vx = 0; e.vy = 0 }
        this.doSpawn(e, def)
        return
      }

      case 'ranged': {
        // Keep distance, then lob a telegraphed shot at the predicted position.
        const standoff = props.standoff ?? 6
        let dirX = target.x - e.x
        let dirY = target.y - e.y
        if (d < standoff) { dirX = -dirX; dirY = -dirY }
        else if (d < standoff * 1.3) { dirX = 0; dirY = 0 }
        const n = norm(dirX, dirY)
        e.vx = n.x * speed
        e.vy = n.y * speed
        this.moveBy(e, e.vx, e.vy)
        if (props.attackCd && e.attackCdLeft <= 0 && d <= (props.attackRange ?? 8)) {
          e.attackCdLeft = props.attackCd
          const window = TELEGRAPH_WINDOWS.light
          const px = clamp(target.x + target.moveX * target.moveSpeed * window * 0.7, -s.arenaW / 2, s.arenaW / 2)
          const py = clamp(target.y + target.moveY * target.moveSpeed * window * 0.7, -s.arenaH / 2, s.arenaH / 2)
          this.pushTelegraph(px, py, props.attackRadius ?? 1.2, 'light', def.damage, 'Ranged', def.id)
        }
        return
      }

      default: {
        // Graspers root in place and drag players toward their arms — a
        // positional threat, not crowd control: movement stays in your hands,
        // the pull just fights it.
        if (props.pullRadius) {
          e.vx = 0; e.vy = 0
          const r2 = props.pullRadius * props.pullRadius
          for (const p of this.activePlayers()) {
            const d2 = distSq(e, p)
            if (d2 < r2 && d2 > 0.8) {
              const n = norm(e.x - p.x, e.y - p.y)
              const pull = (props.pullStrength ?? 2) * TICK_DT
              p.x = clamp(p.x + n.x * pull, -s.arenaW / 2, s.arenaW / 2)
              p.y = clamp(p.y + n.y * pull, -s.arenaH / 2, s.arenaH / 2)
            }
          }
          return
        }
        // Chase, flock if flocking, and lay ground effects if so equipped.
        this.chaseMove(e, def, target, speed)
        // Seeders bury hazards that arm after a delay — dormant marks first.
        if (props.seedCd && e.attackCdLeft <= 0) {
          e.attackCdLeft = props.seedCd
          s.pools.push({
            id: s.nextEntityId++,
            x: e.x,
            y: e.y,
            radius: props.seedRadius ?? 1.3,
            dps: props.seedDps ?? 4,
            slowFactor: 1,
            ttl: props.seedTtl ?? 9,
            sourceId: def.id,
            armDelay: props.seedArm ?? 2.2,
          })
        }
        if (props.webCd && e.attackCdLeft <= 0) {
          e.attackCdLeft = props.webCd
          s.pools.push({
            id: s.nextEntityId++,
            x: e.x,
            y: e.y,
            radius: props.webRadius ?? 1.5,
            dps: 0,
            slowFactor: props.webSlow ?? 0.45,
            ttl: props.webTtl ?? 7,
            sourceId: def.id,
          })
        }
        // Sprayers paint a damaging trail as they walk.
        if (props.trailCd && e.attackCdLeft <= 0) {
          e.attackCdLeft = props.trailCd
          s.pools.push({
            id: s.nextEntityId++,
            x: e.x,
            y: e.y,
            radius: props.trailRadius ?? 0.9,
            dps: props.trailDps ?? 2,
            slowFactor: 1,
            ttl: props.trailTtl ?? 5,
            sourceId: def.id,
          })
        }
        // Fumers emit a cloud that grows the longer they live.
        if (props.fumeCd) {
          e.modeTime += TICK_DT * 2 // reuse as an age accumulator (default mode only)
          if (e.attackCdLeft <= 0) {
            e.attackCdLeft = props.fumeCd
            const radius = Math.min(
              props.fumeMax ?? 3.2,
              (props.fumeBase ?? 1) + e.modeTime * (props.fumeGrowth ?? 0.18),
            )
            s.pools.push({
              id: s.nextEntityId++,
              x: e.x,
              y: e.y,
              radius,
              dps: props.fumeDps ?? 2,
              slowFactor: 1,
              ttl: props.fumeTtl ?? 2.2,
              sourceId: def.id,
            })
          }
        }
      }
    }
  }

  private doSpawn(e: EnemyState, def: EnemyDef): void {
    const s = this.state
    const props = def.props ?? {}
    if (!def.spawnId || e.attackCdLeft > 0) return
    // Wounded broods spawn faster — pressure rises as the fight goes on.
    const frenzy = e.health < e.maxHealth / 2 ? 0.5 : 1
    e.attackCdLeft = (props.spawnCd ?? 2.5) * frenzy
    for (let i = 0; i < (props.spawnCount ?? 2); i++) {
      if (s.enemies.length >= DENSITY_CAP) break
      const child = this.spawnEnemy(def.spawnId)
      child.x = clamp(e.x + (this.rngCombat.next() - 0.5) * 2, -s.arenaW / 2, s.arenaW / 2)
      child.y = clamp(e.y + (this.rngCombat.next() - 0.5) * 2, -s.arenaH / 2, s.arenaH / 2)
    }
  }

  private chaseMove(e: EnemyState, def: EnemyDef, target: PlayerState, speed: number): void {
    const n = norm(target.x - e.x, target.y - e.y)
    let vx = n.x * speed
    let vy = n.y * speed

    // Flocking: one mass with a shape, not thirty independent agents.
    if (def.flock) {
      const s = this.state
      let sepX = 0, sepY = 0, alignX = 0, alignY = 0, cohX = 0, cohY = 0
      let neighbors = 0
      const radius = def.radius * 6
      const r2 = radius * radius
      for (const o of s.enemies) {
        if (o === e || o.defId !== e.defId) continue
        const d2 = distSq(e, o)
        if (d2 > r2) continue
        neighbors++
        const dd = Math.sqrt(d2) || 0.001
        const push = (radius - dd) / radius
        sepX += ((e.x - o.x) / dd) * push
        sepY += ((e.y - o.y) / dd) * push
        alignX += o.vx
        alignY += o.vy
        cohX += o.x
        cohY += o.y
      }
      if (neighbors > 0) {
        const f = def.flock
        vx += sepX * f.separation
        vy += sepY * f.separation
        const an = norm(alignX / neighbors, alignY / neighbors)
        vx += an.x * f.alignment
        vy += an.y * f.alignment
        const cn = norm(cohX / neighbors - e.x, cohY / neighbors - e.y)
        vx += cn.x * f.cohesion
        vy += cn.y * f.cohesion
        const vn = norm(vx, vy)
        vx = vn.x * speed
        vy = vn.y * speed
      }
    }

    e.vx = vx
    e.vy = vy
    this.moveBy(e, vx, vy)
  }

  private moveBy(e: EnemyState, vx: number, vy: number): void {
    const s = this.state
    e.x = clamp(e.x + vx * TICK_DT, -s.arenaW / 2, s.arenaW / 2)
    e.y = clamp(e.y + vy * TICK_DT, -s.arenaH / 2, s.arenaH / 2)
  }

  private pushTelegraph(
    x: number, y: number, radius: number, severity: TelegraphSeverity,
    damage: number, damageType: DamageType, sourceId: string,
  ): void {
    const s = this.state
    const window = TELEGRAPH_WINDOWS[severity]
    s.telegraphs.push({
      id: s.nextEntityId++,
      x, y, radius, severity, window,
      timeLeft: window,
      damage, damageType, sourceId,
    })
  }

  private tickPools(): void {
    const s = this.state
    for (const pool of s.pools) {
      if (pool.armDelay && pool.armDelay > 0) {
        pool.armDelay -= TICK_DT
        continue // dormant: no damage, no decay
      }
      pool.ttl -= TICK_DT
      if (pool.dps <= 0) continue
      // Damaging pools hit twice a second, not per tick, to keep events sane.
      const beat = Math.floor((pool.ttl * 2)) !== Math.floor((pool.ttl + TICK_DT) * 2)
      if (!beat) continue
      const r2 = pool.radius * pool.radius
      if (pool.ownerId !== undefined) {
        // A player-made pool burns enemies, with full attribution.
        for (const e of [...s.enemies]) {
          if (!this.isTargetable(e)) continue
          if (distSq(pool, e) <= r2) {
            this.damageEnemy(e, pool.dps * 0.5, pool.ownerId, pool.sourceId, 'Magic', true)
          }
        }
        continue
      }
      for (const p of s.players) {
        if (!p.alive || p.downed) continue
        if (distSq(pool, p) <= r2) {
          this.damagePlayer(p, pool.dps * 0.5, 'Magic', pool.sourceId, false)
        }
      }
    }
    s.pools = s.pools.filter((p) => p.ttl > 0)
  }

  /** The strongest slow among pools the player is standing in (1 = none). */
  slowFactorFor(p: PlayerState): number {
    let factor = 1
    for (const pool of this.state.pools) {
      if (pool.slowFactor >= 1) continue
      const r2 = pool.radius * pool.radius
      if (distSq(pool, p) <= r2) factor = Math.min(factor, pool.slowFactor)
    }
    return factor
  }

  private tickTelegraphs(): void {
    const s = this.state
    const done: number[] = []
    for (const t of s.telegraphs) {
      t.timeLeft -= TICK_DT
      if (t.timeLeft > 0) continue
      done.push(t.id)
      const r2 = t.radius * t.radius
      for (const p of s.players) {
        if (!p.alive || p.downed) continue
        if (distSq(t, p) <= r2) {
          // Zone damage is a hazard: avoidable by moving, not by dodge chance.
          this.damagePlayer(p, t.damage, t.damageType, t.sourceId, false)
        }
      }
    }
    if (done.length > 0) s.telegraphs = s.telegraphs.filter((t) => !done.includes(t.id))
  }

  private damagePlayer(
    p: PlayerState,
    amount: number,
    type: DamageType,
    sourceId: string,
    isAttack: boolean,
  ): void {
    // Crowd defense (the Bulwark): the middle of the horde is the safe place.
    let defenses = p.defenses
    const pack = this.registry.classes.get(p.classId)?.packDefense
    if (pack) {
      let nearby = 0
      const r2 = pack.radius * pack.radius
      for (const e of this.state.enemies) {
        if (distSq(e, p) <= r2) nearby++
      }
      const bonus = Math.min(pack.armorCap, nearby * pack.armorPerEnemy)
      if (bonus > 0) defenses = { ...defenses, armor: defenses.armor + bonus }
    }
    // Shared mitigation (the Paladin): allies standing close are armored too.
    for (const ally of this.activePlayers()) {
      if (ally.id === p.id) continue
      const share = this.registry.classes.get(ally.classId)?.shareArmor
      if (share && distSq(ally, p) <= share.radius * share.radius) {
        defenses = { ...defenses, armor: defenses.armor + share.armor }
        break
      }
    }
    const result = resolveDamage(amount, type, defenses, isAttack, this.rngCombat.next())
    this.tracker.recordTaken({
      tick: this.state.tick,
      wave: this.state.wave.number,
      playerId: p.id,
      sourceId,
      amount,
      taken: result.taken,
      mitigated: result.mitigated,
      dodged: result.dodged,
    })
    if (result.taken <= 0) return
    p.health -= result.taken
    if (p.health <= 0) {
      p.health = 0
      const others = this.activePlayers().filter((o) => o.id !== p.id)
      if (others.length > 0) {
        // Downed, not dead: teammates can still reach them.
        p.downed = true
        p.bleedOut = BLEED_OUT_SECONDS
        p.reviveProgress = 0
      } else {
        // Nobody left standing to attempt a rescue.
        p.alive = false
      }
    }
  }

  /**
   * Auras: carried aura items grant their bonus dynamically each tick. By
   * default an aura only reaches its carrier; the Bard's reach allies too,
   * with an enlarged radius — the aura is a place, not a stat line.
   */
  private tickAuras(): void {
    const s = this.state
    for (const p of s.players) { p.auraAllPct = 0; p.auraRegen = 0 }
    for (const carrier of s.players) {
      if (!carrier.alive || carrier.downed) continue
      const cls = this.registry.class(carrier.classId)
      for (const itemId of carrier.items) {
        const item = resolveItem(this.registry, itemId)
        for (const eff of item.effects) {
          if (eff.kind !== 'aura') continue
          const radius = eff.radius * (1 + (cls.auraRadiusPct ?? 0) / 100)
          for (const target of s.players) {
            if (!target.alive || target.downed) continue
            const inReach = target.id === carrier.id ||
              (cls.aurasAffectAllies === true && distSq(target, carrier) <= radius * radius)
            if (!inReach) continue
            if (eff.attribute === 'allPct') target.auraAllPct += eff.amount
            else target.auraRegen += eff.amount * 0.1 // same scale as the regen stat
          }
        }
      }
    }
  }

  private tickWeapons(): void {
    const s = this.state
    for (const p of s.players) {
      if (!p.alive || p.downed) continue
      for (const w of p.weapons) {
        w.cooldownLeft -= TICK_DT
        if (w.cooldownLeft > 0) continue
        const def = this.registry.weapon(w.defId)
        const target = this.selectTarget(p, def.range, def.targeting, w.staggerOffset)
        w.targetId = target?.id ?? null
        if (!target) continue // hold fire — no sensible target
        w.cooldownLeft = def.cooldown * (1 - p.cooldownPct / 100)
        w.firedTick = s.tick
        const damage = def.damage * WEAPON_TIER_MULT[w.tier] * damageMultiplier(p, def, this.registry)

        if (def.projectileSpeed) {
          const n = norm(target.x - p.x, target.y - p.y)
          // Multi-projectile weapons fan out at fixed 14° steps. The rotation
          // constants are literals, so this stays deterministic (no trig).
          const COS = 0.970
          const SIN = 0.242
          const count = def.projectileCount ?? 1
          for (let i = 0; i < count; i++) {
            const spread = i - (count - 1) / 2
            let dx = n.x
            let dy = n.y
            for (let k = 0; k < Math.abs(spread); k++) {
              const sign = spread > 0 ? 1 : -1
              const rx = dx * COS - dy * SIN * sign
              const ry = dx * SIN * sign + dy * COS
              dx = rx
              dy = ry
            }
            const pr: ProjectileState = {
              id: s.nextEntityId++,
              x: p.x,
              y: p.y,
              vx: dx * def.projectileSpeed,
              vy: dy * def.projectileSpeed,
              damage,
              damageType: def.damageType,
              ownerId: p.id,
              sourceId: def.id,
              ttl: def.range / def.projectileSpeed + 0.2,
              aoe: def.aoeRadius,
            }
            s.projectiles.push(pr)
          }
        } else {
          // Instant melee resolution; the renderer shows the lunge.
          this.damageEnemy(target, damage, p.id, def.id, def.damageType)
          if (target.health > 0) this.applyOnHit(target, def.id, p)
        }
      }
    }
  }

  private selectTarget(
    p: PlayerState,
    range: number,
    rule: string,
    stagger: number,
  ): EnemyState | null {
    const s = this.state
    const inRange: EnemyState[] = []
    const r2 = range * range
    for (const e of s.enemies) {
      if (!this.isTargetable(e)) continue
      if (distSq(e, p) <= r2) inRange.push(e)
    }
    if (inRange.length === 0) return null
    // Stagger applies to target selection: skip forward in the sorted list so
    // simultaneous weapons distribute across enemies rather than stacking.
    const skip = Math.floor(stagger * Math.min(inRange.length, 4))
    const sorted = inRange.slice()
    switch (rule) {
      case 'nearest':
        sorted.sort((a, b) => distSq(a, p) - distSq(b, p)); break
      case 'lowestHealth':
        sorted.sort((a, b) => a.health - b.health); break
      case 'highestHealth':
        sorted.sort((a, b) => b.health - a.health); break
      case 'farthest':
        sorted.sort((a, b) => distSq(b, p) - distSq(a, p)); break
      case 'lastDamaged':
        sorted.sort((a, b) => b.lastDamagedTick - a.lastDamagedTick); break
      case 'densest': {
        const density = (e: EnemyState): number => {
          let c = 0
          for (const o of inRange) if (distSq(e, o) < 9) c++
          return c
        }
        sorted.sort((a, b) => density(b) - density(a)); break
      }
    }
    return sorted[Math.min(skip, sorted.length - 1)]
  }

  /** Enemies alight at once, highest seen this run (drives an unlock). */
  maxSimultaneousBurns = 0

  private damageEnemy(
    e: EnemyState,
    amount: number,
    playerId: number,
    sourceId: string,
    damageType: DamageType = 'Melee',
    isArc = false,
  ): void {
    // Resistant elites absorb part of everything except Void.
    if (e.elite === 'resistant' && damageType !== 'Void') amount *= 0.7
    // A nearby Shielder soaks half of what its allies would take (kill it first).
    for (const sh of this.shielders) {
      if (sh === e) continue
      const props = this.registry.enemy(sh.defId).props
      const r = props?.shieldRadius ?? 4
      if (distSq(sh, e) <= r * r) {
        amount *= 1 - (props?.shieldReductionPct ?? 50) / 100
        break
      }
    }
    // Shocked targets take more from everything — amplification, not control.
    if (e.shockTtl > 0) amount *= 1.25

    // The Demon Hunter: quiet against the rabble, decisive against the big.
    const hunter = this.state.players.find((p) => p.id === playerId)
    if (hunter) {
      const elitePct = this.registry.classes.get(hunter.classId)?.eliteDamagePct
      if (elitePct && (e.elite || this.registry.enemy(e.defId).boss)) {
        amount *= 1 + elitePct / 100
      }
    }

    // Lightning striking a shocked target arcs to nearby enemies.
    if (!isArc && e.shockTtl > 0 && this.sourceTags(sourceId).includes('Lightning')) {
      const nearby = this.state.enemies
        .filter((o) => o !== e && this.isTargetable(o) && distSq(o, e) <= 9)
        .slice(0, 2)
      for (const o of nearby) {
        this.damageEnemy(o, amount * 0.5, playerId, sourceId, damageType, true)
      }
    }

    e.health -= amount
    e.lastDamagedTick = this.state.tick

    // The Grudge grows with every wound that fails to kill it.
    const defG = this.registry.enemy(e.defId)
    if (defG.props?.ragePerHit && e.health > 0) {
      e.rage = Math.min(defG.props.rageCap ?? 10, e.rage + defG.props.ragePerHit)
    }
    // Reflectors return a share of what they take to the attacker — at most
    // once a second. Autofire means you cannot choose to stop hitting them,
    // so an uncapped mirror would be unavoidable damage, not a mechanic.
    if (defG.props?.reflectPct && e.health > 0 && !isArc && e.reflectCdLeft <= 0) {
      const attacker = this.state.players.find((p) => p.id === playerId)
      if (attacker && attacker.alive && !attacker.downed) {
        e.reflectCdLeft = defG.props.reflectCd ?? 1
        this.damagePlayer(attacker, amount * (defG.props.reflectPct / 100), 'Magic', defG.id, false)
      }
    }

    // Retaliators answer close-range damage with an avoidable spike.
    const def = this.registry.enemy(e.defId)
    if (def.props?.spikeCd && e.attackCdLeft <= 0 && e.health > 0) {
      const attacker = this.state.players.find((p) => p.id === playerId)
      if (attacker && dist(e, attacker) <= (def.props.spikeRange ?? 2.4)) {
        e.attackCdLeft = def.props.spikeCd
        this.pushTelegraph(
          attacker.x, attacker.y, 0.9, 'light',
          def.props.spikeDamage ?? 3, 'Melee', def.id,
        )
      }
    }
    const killed = e.health <= 0
    this.tracker.recordDamage({
      tick: this.state.tick,
      wave: this.state.wave.number,
      playerId,
      sourceId,
      targetId: e.defId,
      amount,
      kill: killed,
    })
    // Lifesteal is universal: any damage the player causes, any type.
    const owner = this.state.players.find((p) => p.id === playerId)
    if (owner && owner.alive && owner.lifesteal > 0) {
      owner.health = Math.min(owner.maxHealth, owner.health + amount * owner.lifesteal)
    }
    if (killed) {
      this.killEnemy(e)
      if (owner) {
        this.triggerOnKill(owner, e)
        // The Necromancer: the fallen may rise to fight for their killer.
        const rise = this.registry.classes.get(owner.classId)?.riseOnKill
        if (rise && this.rngCombat.chance(rise.chance)) {
          this.spawnPet(owner, rise.petId, rise.duration)
          const risen = this.state.pets[this.state.pets.length - 1]
          risen.x = e.x
          risen.y = e.y
        }
      }
    }
  }

  /** Tags of any damage source id, whatever registry it lives in. */
  private sourceTags(sourceId: string): readonly string[] {
    return this.registry.weapons.get(sourceId)?.tags ??
      this.registry.items.get(sourceId)?.tags ??
      this.registry.actives.get(sourceId)?.tags ?? []
  }

  /**
   * Roll effect appliers after a weapon hit: the weapon's own appliers plus
   * any carried apply-on-hit items. Effects are authored, never automatic.
   */
  private applyOnHit(e: EnemyState, sourceId: string, owner: PlayerState | undefined): void {
    const rollAll = (appliers: readonly import('../data/types').Applier[] | undefined, applierSource: string): void => {
      if (!appliers) return
      for (const a of appliers) {
        if (!this.rngCombat.chance(a.chance)) continue
        if (a.effect === 'burn') {
          e.burnDps = Math.max(e.burnDps, a.dps)
          e.burnTtl = Math.max(e.burnTtl, a.duration)
          e.burnOwnerId = owner?.id ?? -1
          e.burnSourceId = applierSource
        } else if (a.effect === 'shocked') {
          e.shockTtl = Math.max(e.shockTtl, a.duration)
        } else if (a.effect === 'chilled') {
          // Diminishing: each reapplication slows less. Never a full stop.
          const factor = Math.pow(0.7, e.chillsApplied)
          e.chillSlow = Math.min(0.6, a.slow * factor)
          e.chillTtl = a.duration
          e.chillsApplied++
        } else if (a.effect === 'poison') {
          // Poison stacks without limit — every application adds, by design.
          e.poisonDps += a.dps
          e.poisonTtl = Math.max(e.poisonTtl, a.duration)
          e.poisonOwnerId = owner?.id ?? -1
          e.poisonSourceId = applierSource
        }
      }
    }
    const weaponDef = this.registry.weapons.get(sourceId)
    rollAll(weaponDef?.applies, sourceId)
    if (owner) {
      for (const itemId of owner.items) {
        for (const eff of resolveItem(this.registry, itemId).effects) {
          if (eff.kind === 'applyOnHit') rollAll([eff.applier], itemId)
        }
      }
      // Class-innate appliers on Melee-tagged weapons (the Dragon Knight).
      const cls = this.registry.classes.get(owner.classId)
      if (cls?.meleeAppliers && weaponDef?.tags.includes('Melee')) {
        rollAll(cls.meleeAppliers, sourceId)
      }
      // Class-innate appliers on every weapon hit (the Toxicologist).
      if (cls?.allAppliers) rollAll(cls.allAppliers, sourceId)
    }
  }

  /** Per-tick caches of aura enemies (usually empty — keeps hot paths cheap). */
  private shielders: EnemyState[] = []
  private bannermen: EnemyState[] = []

  private tickEffects(): void {
    this.shielders.length = 0
    this.bannermen.length = 0
    for (const e of this.state.enemies) {
      const props = this.registry.enemy(e.defId).props
      if (props?.shieldRadius) this.shielders.push(e)
      if (props?.auraRadius) this.bannermen.push(e)
    }
    let burning = 0
    for (const e of [...this.state.enemies]) {
      if (e.shockTtl > 0) e.shockTtl -= TICK_DT
      if (e.chillTtl > 0) e.chillTtl -= TICK_DT
      if (e.poisonTtl > 0) {
        const beat = Math.floor(e.poisonTtl * 2) !== Math.floor((e.poisonTtl + TICK_DT) * 2)
        e.poisonTtl -= TICK_DT
        if (beat) {
          this.damageEnemy(e, e.poisonDps * 0.5, e.poisonOwnerId, e.poisonSourceId || 'poison', 'Magic', true)
        }
        if (e.poisonTtl <= 0) e.poisonDps = 0
      }
      if (e.burnTtl > 0) {
        burning++
        // Burn ticks twice a second, attributed to whoever lit it.
        const beat = Math.floor(e.burnTtl * 2) !== Math.floor((e.burnTtl + TICK_DT) * 2)
        e.burnTtl -= TICK_DT
        if (beat) {
          this.damageEnemy(e, e.burnDps * 0.5, e.burnOwnerId, e.burnSourceId || 'burn', 'Magic', true)
        }
        if (e.burnTtl <= 0) e.burnDps = 0
      }
    }
    this.maxSimultaneousBurns = Math.max(this.maxSimultaneousBurns, burning)
    this.state.pets = this.state.pets.filter((pet) => pet.expireLeft >= 0)
  }

  /** Item on-kill effects — attributed to the item, so builds become visible. */
  private triggerOnKill(owner: PlayerState, at: { x: number; y: number }): void {
    for (const itemId of owner.items) {
      const item = resolveItem(this.registry, itemId)
      for (const eff of item.effects) {
        if (eff.kind === 'onKillExplode' && this.rngCombat.chance(eff.chance)) {
          const r2 = eff.radius * eff.radius
          for (const other of [...this.state.enemies]) {
            if (distSq(other, at) <= r2) {
              this.damageEnemy(other, eff.damage, owner.id, item.id, 'Magic')
            }
          }
        } else if (eff.kind === 'onKillHeal' && this.rngCombat.chance(eff.chance)) {
          owner.health = Math.min(owner.maxHealth, owner.health + eff.amount)
        }
      }
    }
  }

  /**
   * Item on-pickup effects. Universal trigger: every player's items react to
   * ANY pickup, not only their own kills — each build stays maximally active.
   */
  private triggerOnPickup(at: { x: number; y: number }, kind: 'gold' | 'xp'): void {
    for (const p of this.state.players) {
      if (!p.alive || p.downed) continue
      for (const itemId of p.items) {
        const item = resolveItem(this.registry, itemId)
        for (const eff of item.effects) {
          if ((eff.kind === 'onPickupDamage' || eff.kind === 'onPickupHeal') &&
              eff.pickup && eff.pickup !== 'any' && eff.pickup !== kind) continue
          if (eff.kind === 'onPickupDamage' && this.rngCombat.chance(eff.chance)) {
            const r2 = eff.radius * eff.radius
            for (const e of [...this.state.enemies]) {
              if (distSq(e, p) <= r2) {
                this.damageEnemy(e, eff.damage, p.id, item.id, 'Magic')
              }
            }
          } else if (eff.kind === 'onPickupHeal' && this.rngCombat.chance(eff.chance)) {
            p.health = Math.min(p.maxHealth, p.health + eff.amount)
          }
        }
      }
    }
    void at
  }

  private killEnemy(e: EnemyState): void {
    const s = this.state
    const def = this.registry.enemy(e.defId)
    s.enemies = s.enemies.filter((x) => x !== e)

    // Exploders burst where they die and leave a lingering pool.
    if (def.props?.burstRadius) {
      this.pushTelegraph(
        e.x, e.y, def.props.burstRadius, 'light',
        def.props.burstDamage ?? def.damage * 2, 'Magic', def.id,
      )
      s.pools.push({
        id: s.nextEntityId++,
        x: e.x,
        y: e.y,
        radius: def.props.burstRadius * 0.8,
        dps: def.props.poolDps ?? 2,
        slowFactor: 1,
        ttl: def.props.poolTtl ?? 4,
        sourceId: def.id,
      })
    }

    // Splitters divide instead of dying (bounded: children reference a fixed def).
    if (def.splitInto && def.splitTo) {
      const childDef = this.childSplitDef(def.splitTo)
      if (childDef) {
        for (let i = 0; i < def.splitInto; i++) {
          if (s.enemies.length >= DENSITY_CAP) {
            s.wave.deferred.push({ enemy: childDef.id, elite: null })
            continue
          }
          const child = this.spawnEnemy(childDef.id)
          child.x = e.x + (this.rngCombat.next() - 0.5)
          child.y = e.y + (this.rngCombat.next() - 0.5)
        }
      }
    }

    if (def.gold > 0) this.dropPickup('gold', def.gold, e.x, e.y)
    if (def.xp > 0) this.dropPickup('xp', def.xp, e.x, e.y)

    // Chest drops: capped per wave so reward pacing stays authored, not lucky.
    if (s.wave.chestsDropped < 2 && !e.defId.startsWith('kingslime')) {
      if (this.rngCombat.chance(0.018)) s.wave.chestsDropped++
    }
  }

  private childSplitDef(childId: string) {
    try {
      return this.registry.enemy(childId)
    } catch {
      return null
    }
  }

  private dropPickup(kind: 'gold' | 'xp', amount: number, x: number, y: number): void {
    const s = this.state
    s.pickups.push({
      id: s.nextEntityId++,
      kind,
      amount,
      x: x + (this.rngCombat.next() - 0.5) * 0.8,
      y: y + (this.rngCombat.next() - 0.5) * 0.8,
      magnetTo: null,
    })
  }

  private tickProjectiles(): void {
    const s = this.state
    const dead: ProjectileState[] = []
    for (const pr of s.projectiles) {
      pr.ttl -= TICK_DT
      pr.x += pr.vx * TICK_DT
      pr.y += pr.vy * TICK_DT
      if (pr.ttl <= 0 || Math.abs(pr.x) > s.arenaW / 2 + 1 || Math.abs(pr.y) > s.arenaH / 2 + 1) {
        dead.push(pr)
        continue
      }
      for (const e of s.enemies) {
        if (!this.isTargetable(e)) continue
        const r = this.radiusOf(e) + 0.15
        if (distSq(pr, e) < r * r) {
          const owner = s.players.find((p) => p.id === pr.ownerId)
          if (pr.aoe) {
            // Splash: the blast hits everything near the impact point.
            const r2 = pr.aoe * pr.aoe
            for (const other of [...s.enemies]) {
              if (!this.isTargetable(other)) continue
              if (distSq(pr, other) > r2) continue
              this.damageEnemy(other, pr.damage, pr.ownerId, pr.sourceId, pr.damageType)
              if (other.health > 0) this.applyOnHit(other, pr.sourceId, owner)
            }
            // The Bombardier's blasts scorch the ground they touch.
            const hazard = owner ? this.registry.class(owner.classId).areaHazard : undefined
            if (hazard && owner) {
              s.pools.push({
                id: s.nextEntityId++,
                x: pr.x, y: pr.y,
                radius: pr.aoe,
                dps: hazard.dps,
                slowFactor: 1,
                ttl: hazard.ttl,
                sourceId: pr.sourceId,
                ownerId: owner.id,
              })
            }
          } else {
            this.damageEnemy(e, pr.damage, pr.ownerId, pr.sourceId, pr.damageType)
            if (e.health > 0) this.applyOnHit(e, pr.sourceId, owner)
          }
          dead.push(pr)
          break
        }
      }
    }
    if (dead.length > 0) s.projectiles = s.projectiles.filter((p) => !dead.includes(p))
  }

  private tickPickups(): void {
    const s = this.state
    const collected: PickupState[] = []
    for (const pk of s.pickups) {
      // Magnet: drift toward a player inside pickup radius, or the auto-collect target.
      let magnetTarget: PlayerState | null = null
      if (pk.magnetTo !== null) {
        magnetTarget = s.players.find((p) => p.id === pk.magnetTo) ?? null
      } else {
        for (const p of s.players) {
          if (!p.alive || p.downed) continue
          if (distSq(pk, p) < p.pickupRadius * p.pickupRadius) { magnetTarget = p; break }
        }
      }
      if (magnetTarget) {
        const next = moveToward(pk, magnetTarget, 12 * TICK_DT)
        pk.x = next.x
        pk.y = next.y
        if (dist(pk, magnetTarget) < 0.3) {
          this.collect(pk, magnetTarget)
          collected.push(pk)
        }
      }
    }
    if (collected.length > 0) s.pickups = s.pickups.filter((p) => !collected.includes(p))
  }

  private collect(pk: PickupState, _byPlayer: PlayerState): void {
    this.triggerOnPickup(pk, pk.kind)
    // Gold and XP are shared and multiplied: every player receives the full amount.
    for (const p of this.state.players) {
      if (pk.kind === 'gold') {
        p.gold += Math.round(pk.amount * (1 + p.goldPct / 100))
      } else {
        p.xp += Math.round(pk.amount * (1 + p.xpPct / 100))
        // Level-ups bank a draft; the draft screen opens at intermission.
        while (p.xp >= xpForLevel(p.level)) {
          p.xp -= xpForLevel(p.level)
          p.level++
          p.pendingDrafts++
        }
      }
    }
  }

  private checkWaveClear(): void {
    const s = this.state
    const w = s.wave
    if (w.cleared || w.number === 0) return
    if (s.enemies.length > 0 || w.pendingSpawns.length > 0 || w.deferred.length > 0) return

    // Auto-collect: everything remaining flies to the nearest living player
    // before any intermission screen may open.
    const living = this.activePlayers()
    if (living.length > 0) {
      for (const pk of s.pickups) {
        if (pk.magnetTo !== null) continue
        let nearest = living[0]
        let best = distSq(pk, nearest)
        for (const p of living) {
          const d = distSq(pk, p)
          if (d < best) { best = d; nearest = p }
        }
        pk.magnetTo = nearest.id
      }
    }
    if (s.pickups.length === 0) {
      w.cleared = true
    }
  }

  /** True when the wave is fully settled (cleared and all pickups collected). */
  get waveSettled(): boolean {
    return this.state.wave.cleared && this.state.pickups.length === 0
  }

  get lastWaveNumber(): number {
    return this.waveTable.length > 0 ? Math.max(...this.waveTable.map((w) => w.wave)) : 0
  }
}
