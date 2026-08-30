import { Rng } from './rng'
import { hashState } from './hash'
import { clamp, dist, distSq, moveToward, norm } from './math'
import type {
  EnemyState, PickupState, PlayerState, ProjectileState, SimState,
  TelegraphSeverity, WeaponInstance,
} from './state'
import type { Registry } from '../data/registry'
import type { WaveDef } from '../data/types'
import type { DamageType } from '../data/tags'
import { Tracker } from '../systems/tracker'
import { emptyDefenses, resolveDamage, xpForLevel } from '../systems/damage'
import { damageMultiplier } from '../systems/stats'

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

export interface SimOptions {
  seed: number
  playerCount: number
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

  constructor(private readonly registry: Registry, opts: SimOptions) {
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
      wave: { number: 0, elapsed: 0, pendingSpawns: [], deferred: [], cleared: true },
      arenaW: 28,
      arenaH: 20,
    }
    for (let i = 0; i < opts.playerCount; i++) this.addPlayer(i)
  }

  private addPlayer(id: number): void {
    const p: PlayerState = {
      id,
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
      gold: 0,
      pickupRadius: 1.5,
      perks: [],
      meleePct: 0,
      rangedPct: 0,
      magicPct: 0,
      allPct: 0,
      cooldownPct: 0,
      goldPct: 0,
      xpPct: 0,
      weapons: [],
      alive: true,
    }
    this.state.players.push(p)
  }

  equipWeapon(playerId: number, weaponDefId: string): void {
    const def = this.registry.weapon(weaponDefId)
    const p = this.player(playerId)
    const inst: WeaponInstance = {
      defId: def.id,
      cooldownLeft: 0,
      // Stagger spreads target selection so multiple weapons fan out.
      staggerOffset: (p.weapons.length * 0.37) % 1,
      targetId: null,
      firedTick: -1000,
    }
    p.weapons.push(inst)
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
      pendingSpawns: def.groups.map((g) => ({
        at: g.at,
        enemy: g.enemy,
        remaining: g.count,
        spacing: g.spacing ?? 0,
        nextAt: g.at,
      })),
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
    this.tickTelegraphs()
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
      this.spawnEnemy(w.deferred.shift() as string)
    }

    for (const g of w.pendingSpawns) {
      while (g.remaining > 0 && w.elapsed >= g.nextAt) {
        if (s.enemies.length >= DENSITY_CAP) {
          w.deferred.push(g.enemy)
        } else {
          this.spawnEnemy(g.enemy)
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

  private spawnEnemy(defId: string): EnemyState {
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
    const e: EnemyState = {
      id: s.nextEntityId++,
      defId,
      x,
      y,
      health: def.health,
      maxHealth: def.health,
      vx: 0,
      vy: 0,
      lastDamagedTick: -1,
      touchCdLeft: 0,
      attackCdLeft: def.props?.attackCd ? def.props.attackCd * 0.5 : 0,
    }
    s.enemies.push(e)
    return e
  }

  private tickPlayers(): void {
    const s = this.state
    for (const p of s.players) {
      if (!p.alive) continue
      p.x = clamp(p.x + p.moveX * p.moveSpeed * TICK_DT, -s.arenaW / 2, s.arenaW / 2)
      p.y = clamp(p.y + p.moveY * p.moveSpeed * TICK_DT, -s.arenaH / 2, s.arenaH / 2)
      if (p.regen > 0 && p.health < p.maxHealth) {
        p.health = Math.min(p.maxHealth, p.health + p.regen * TICK_DT)
      }
    }
  }

  private tickEnemies(): void {
    const s = this.state
    const alivePlayers = s.players.filter((p) => p.alive)
    if (alivePlayers.length === 0) return

    for (const e of s.enemies) {
      const def = this.registry.enemy(e.defId)
      // Nearest living player is the pursuit target for all basic archetypes.
      let target = alivePlayers[0]
      let best = distSq(e, target)
      for (const p of alivePlayers) {
        const d = distSq(e, p)
        if (d < best) { best = d; target = p }
      }

      let dirX = target.x - e.x
      let dirY = target.y - e.y

      // Ranged enemies keep their distance instead of closing.
      if (def.archetype === 'ranged') {
        const d = Math.sqrt(best)
        const standoff = (def.props?.standoff ?? 6)
        if (d < standoff) { dirX = -dirX; dirY = -dirY }
        else if (d < standoff * 1.3) { dirX = 0; dirY = 0 }
      }

      const n = norm(dirX, dirY)
      let vx = n.x * def.speed
      let vy = n.y * def.speed

      // Flocking: one mass with a shape, not thirty independent agents.
      if (def.flock) {
        let sepX = 0, sepY = 0, alignX = 0, alignY = 0, cohX = 0, cohY = 0
        let neighbors = 0
        const radius = def.radius * 6
        const r2 = radius * radius
        for (const o of s.enemies) {
          if (o === e || o.defId !== e.defId) continue
          const d2 = distSq(e, o)
          if (d2 > r2) continue
          neighbors++
          const d = Math.sqrt(d2) || 0.001
          const push = (radius - d) / radius
          sepX += ((e.x - o.x) / d) * push
          sepY += ((e.y - o.y) / d) * push
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
          vx = vn.x * def.speed
          vy = vn.y * def.speed
        }
      }

      e.vx = vx
      e.vy = vy
      e.x = clamp(e.x + vx * TICK_DT, -s.arenaW / 2, s.arenaW / 2)
      e.y = clamp(e.y + vy * TICK_DT, -s.arenaH / 2, s.arenaH / 2)

      // Contact damage: a discrete, dodgeable hit with a per-enemy cooldown.
      e.touchCdLeft -= TICK_DT
      if (e.touchCdLeft <= 0) {
        for (const p of alivePlayers) {
          const touch = def.radius + 0.4
          if (distSq(e, p) < touch * touch) {
            this.damagePlayer(p, def.damage, 'Melee', def.id, true)
            e.touchCdLeft = def.props?.touchCd ?? 0.8
            break
          }
        }
      }

      // Ranged/special attacks: telegraphed floor zones at the predicted position.
      if (def.props?.attackCd) {
        e.attackCdLeft -= TICK_DT
        const range = def.props.attackRange ?? 8
        if (e.attackCdLeft <= 0 && distSq(e, target) <= range * range) {
          e.attackCdLeft = def.props.attackCd
          const severity = 'light' as const
          const window = TELEGRAPH_WINDOWS[severity]
          // Lead the target by their current velocity over the window.
          const px = target.x + target.moveX * target.moveSpeed * window * 0.7
          const py = target.y + target.moveY * target.moveSpeed * window * 0.7
          s.telegraphs.push({
            id: s.nextEntityId++,
            x: clamp(px, -s.arenaW / 2, s.arenaW / 2),
            y: clamp(py, -s.arenaH / 2, s.arenaH / 2),
            radius: def.props.attackRadius ?? 1.2,
            severity,
            window,
            timeLeft: window,
            damage: def.damage,
            damageType: 'Ranged',
            sourceId: def.id,
          })
        }
      }
    }
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
        if (!p.alive) continue
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
    const result = resolveDamage(amount, type, p.defenses, isAttack, this.rngCombat.next())
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
      p.alive = false
    }
  }

  private tickWeapons(): void {
    const s = this.state
    for (const p of s.players) {
      if (!p.alive) continue
      for (const w of p.weapons) {
        w.cooldownLeft -= TICK_DT
        if (w.cooldownLeft > 0) continue
        const def = this.registry.weapon(w.defId)
        const target = this.selectTarget(p, def.range, def.targeting, w.staggerOffset)
        w.targetId = target?.id ?? null
        if (!target) continue // hold fire — no sensible target
        w.cooldownLeft = def.cooldown * (1 - p.cooldownPct / 100)
        w.firedTick = s.tick
        const damage = def.damage * damageMultiplier(p, def.damageType)

        if (def.projectileSpeed) {
          const n = norm(target.x - p.x, target.y - p.y)
          const pr: ProjectileState = {
            id: s.nextEntityId++,
            x: p.x,
            y: p.y,
            vx: n.x * def.projectileSpeed,
            vy: n.y * def.projectileSpeed,
            damage,
            damageType: def.damageType,
            ownerId: p.id,
            sourceId: def.id,
            ttl: def.range / def.projectileSpeed + 0.2,
          }
          s.projectiles.push(pr)
        } else {
          // Instant melee resolution; the renderer shows the lunge.
          this.damageEnemy(target, damage, p.id, def.id)
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

  private damageEnemy(e: EnemyState, amount: number, playerId: number, sourceId: string): void {
    e.health -= amount
    e.lastDamagedTick = this.state.tick
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
    if (killed) this.killEnemy(e)
  }

  private killEnemy(e: EnemyState): void {
    const s = this.state
    const def = this.registry.enemy(e.defId)
    s.enemies = s.enemies.filter((x) => x !== e)

    // Splitters divide instead of dying (bounded: children reference a fixed def).
    if (def.splitInto && def.splitTo) {
      const childDef = this.childSplitDef(def.splitTo)
      if (childDef) {
        for (let i = 0; i < def.splitInto; i++) {
          if (s.enemies.length >= DENSITY_CAP) { s.wave.deferred.push(childDef.id); continue }
          const child = this.spawnEnemy(childDef.id)
          child.x = e.x + (this.rngCombat.next() - 0.5)
          child.y = e.y + (this.rngCombat.next() - 0.5)
        }
      }
    }

    if (def.gold > 0) this.dropPickup('gold', def.gold, e.x, e.y)
    if (def.xp > 0) this.dropPickup('xp', def.xp, e.x, e.y)
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
        const def = this.registry.enemy(e.defId)
        const r = def.radius + 0.15
        if (distSq(pr, e) < r * r) {
          this.damageEnemy(e, pr.damage, pr.ownerId, pr.sourceId)
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
          if (!p.alive) continue
          if (distSq(pk, p) < 2.25) { magnetTarget = p; break }
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
    const living = s.players.filter((p) => p.alive)
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
