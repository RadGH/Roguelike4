// The simulation core: pure TypeScript, no browser APIs, no rendering.
// The live game, the headless simulator, and the tests all drive THIS.
// M1-A scope: players (move/dash), equipped weapons auto-firing (melee arcs +
// projectiles), enemies (chaser/skitterer/shooter), damage pipeline, tracker,
// gold/XP drops with pickup radii, combo streaks, continuous spawning.

import { TICK_SECONDS } from './constants';
import { type InputFrame, neutralInput } from './input';
import { createRng, type Rng } from './rng';
import { buildStats, stat, type StatSheet } from './stats';
import {
  defenseFromStats,
  resolveHit,
  rollAttack,
  type AttackProfile,
  type DefenseProfile,
} from './combat';
import { Tracker, type ActorRef, type SourceChain } from './tracker';
import { SpatialHash, type SpatialEntry } from './spatial';
import { loadRegistry, getEnemy, getWeapon, type Registry } from '../data/registry';
import type { EnemyDef, WeaponDef } from '../data/schemas';

export type WeaponSlot = {
  itemId: string;
  cooldownLeft: number;
};

export type PlayerState = {
  index: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  alive: boolean;
  stats: StatSheet;
  defense: DefenseProfile;
  weapons: WeaponSlot[];
  gold: number;
  xp: number;
  level: number;
  dashTimer: number;
  dashCooldown: number;
  iframeTimer: number;
  dashDirX: number;
  dashDirY: number;
  squishPhase: number;
  moving: boolean;
  contactHitCooldown: number;
};

export type EnemyState = {
  instance: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  attackCooldown: number;
  targetPlayer: number;
  wanderAngle: number;
  wanderTimer: number;
  hitFlash: number; // cosmetic, deterministic
};

export type ProjectileState = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  traveled: number;
  range: number;
  fromPlayer: number; // -1 = enemy projectile
  itemId: string | null;
  enemyDefId: string | null;
  pierceLeft: number;
  hitIds: Set<number>;
};

export type PickupState = {
  active: boolean;
  x: number;
  y: number;
  kind: 'gold' | 'xp';
  amount: number;
};

export type Arena = { width: number; height: number };

export type SimState = {
  tick: number;
  wave: number;
  arena: Arena;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  combo: { count: number; decay: number; best: number };
  spawning: { queue: { defId: string; count: number; atSecond: number }[]; elapsed: number; done: boolean };
};

export type SimEvent =
  | { type: 'dash'; player: number }
  | { type: 'enemyKilled'; defId: string; instance: number; byPlayer: number }
  | { type: 'playerHit'; player: number; amount: number }
  | { type: 'playerDown'; player: number }
  | { type: 'comboTier'; count: number };

const MAX_PROJECTILES = 512;
const MAX_PICKUPS = 1024;

export class Sim {
  readonly state: SimState;
  readonly rng: Rng;
  readonly tracker = new Tracker();
  readonly registry: Registry;
  private eventsThisTick: SimEvent[] = [];
  private nextEnemyInstance = 1;
  private spatial = new SpatialHash(3);
  private spatialScratch: SpatialEntry[] = [];

  constructor(seed: number, playerCount = 1, arena: Arena = { width: 40, height: 30 }) {
    this.registry = loadRegistry();
    this.rng = createRng(seed);
    const players: PlayerState[] = [];
    for (let i = 0; i < playerCount; i++) players.push(this.createPlayer(i, playerCount, arena));
    const projectiles: ProjectileState[] = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      projectiles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 0,
        traveled: 0,
        range: 0,
        fromPlayer: -1,
        itemId: null,
        enemyDefId: null,
        pierceLeft: 0,
        hitIds: new Set(),
      });
    }
    const pickups: PickupState[] = [];
    for (let i = 0; i < MAX_PICKUPS; i++) {
      pickups.push({ active: false, x: 0, y: 0, kind: 'gold', amount: 0 });
    }
    this.state = {
      tick: 0,
      wave: 1,
      arena,
      players,
      enemies: [],
      projectiles,
      pickups,
      combo: { count: 0, decay: 0, best: 0 },
      spawning: { queue: [], elapsed: 0, done: true },
    };
  }

  private createPlayer(i: number, playerCount: number, arena: Arena): PlayerState {
    const bal = this.registry.balance;
    const weapons: WeaponSlot[] = [
      { itemId: 'shortsword', cooldownLeft: 0 },
      { itemId: 'sling', cooldownLeft: 0 },
    ];
    const grantSets = weapons.map((w) => getWeapon(this.registry, w.itemId).grants);
    const stats = buildStats(bal.player.baseStats as StatSheet, grantSets);
    return {
      index: i,
      x: arena.width / 2 + (i - (playerCount - 1) / 2) * 2,
      y: arena.height / 2,
      facing: 0,
      hp: stat(stats, 'maxHp'),
      alive: true,
      stats,
      defense: defenseFromStats(stats),
      weapons,
      gold: 0,
      xp: 0,
      level: 1,
      dashTimer: 0,
      dashCooldown: 0,
      iframeTimer: 0,
      dashDirX: 1,
      dashDirY: 0,
      squishPhase: 0,
      moving: false,
      contactHitCooldown: 0,
    };
  }

  /** Queue a simple spawn script: entries appear over time at arena edges. */
  startWave(entries: { defId: string; count: number; atSecond: number }[]): void {
    this.state.spawning = { queue: [...entries], elapsed: 0, done: false };
  }

  spawnEnemy(defId: string, x: number, y: number): EnemyState {
    const def = getEnemy(this.registry, defId);
    const e: EnemyState = {
      instance: this.nextEnemyInstance++,
      defId,
      x,
      y,
      hp: def.maxHp,
      alive: true,
      attackCooldown: 0,
      targetPlayer: 0,
      wanderAngle: 0,
      wanderTimer: 0,
      hitFlash: 0,
    };
    this.state.enemies.push(e);
    return e;
  }

  tick(inputs: readonly InputFrame[]): SimEvent[] {
    this.eventsThisTick = [];
    const dt = TICK_SECONDS;
    const s = this.state;

    this.tickSpawning(dt);

    for (const p of s.players) {
      if (!p.alive) continue;
      this.tickPlayerMovement(p, inputs[p.index] ?? neutralInput(), dt);
    }

    // Rebuild spatial hash with live enemies (used by weapons + projectiles)
    this.spatial.clear();
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const def = getEnemy(this.registry, e.defId);
      this.spatial.insert({ id: e.instance, x: e.x, y: e.y, r: def.radius });
    }

    for (const p of s.players) {
      if (!p.alive) continue;
      this.tickWeapons(p, inputs[p.index] ?? neutralInput(), dt);
    }

    this.tickEnemies(dt);
    this.tickProjectiles(dt);
    this.tickPickups(dt);
    this.tickCombo(dt);

    // Swap-remove dead enemies (arrays never accumulate corpses)
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      if (!s.enemies[i]!.alive) {
        s.enemies[i] = s.enemies[s.enemies.length - 1]!;
        s.enemies.pop();
      }
    }

    s.tick++;
    return this.eventsThisTick;
  }

  // ---- players ----

  private tickPlayerMovement(p: PlayerState, input: InputFrame, dt: number): void {
    const bal = this.registry.balance.player;
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.iframeTimer > 0) p.iframeTimer = Math.max(0, p.iframeTimer - dt);
    if (p.contactHitCooldown > 0) p.contactHitCooldown = Math.max(0, p.contactHitCooldown - dt);

    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    p.moving = mag > 0.01;

    const aimMag = Math.hypot(input.aimX, input.aimY);
    if (aimMag > 0.25) p.facing = Math.atan2(input.aimY, input.aimX);
    else if (p.moving) p.facing = Math.atan2(my, mx);

    if (input.dash && p.dashTimer <= 0 && p.dashCooldown <= 0) {
      p.dashTimer = bal.dashDuration;
      p.dashCooldown = bal.dashCooldown;
      p.iframeTimer = bal.dashIframes;
      if (p.moving) {
        p.dashDirX = mx / (mag || 1);
        p.dashDirY = my / (mag || 1);
      } else {
        p.dashDirX = Math.cos(p.facing);
        p.dashDirY = Math.sin(p.facing);
      }
      this.eventsThisTick.push({ type: 'dash', player: p.index });
    }

    let vx: number;
    let vy: number;
    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      vx = p.dashDirX * bal.dashSpeed;
      vy = p.dashDirY * bal.dashSpeed;
    } else {
      const speed = bal.moveUnitsPerSec * (1 + stat(p.stats, 'moveSpeed'));
      vx = mx * speed;
      vy = my * speed;
    }
    p.x += vx * dt;
    p.y += vy * dt;
    const r = bal.radius;
    p.x = Math.min(this.state.arena.width - r, Math.max(r, p.x));
    p.y = Math.min(this.state.arena.height - r, Math.max(r, p.y));
    if (p.moving || p.dashTimer > 0) p.squishPhase = (p.squishPhase + dt * 9) % (Math.PI * 2);
  }

  private tickWeapons(p: PlayerState, input: InputFrame, dt: number): void {
    const aiming = Math.hypot(input.aimX, input.aimY) > 0.25;
    for (const slot of p.weapons) {
      if (slot.cooldownLeft > 0) slot.cooldownLeft = Math.max(0, slot.cooldownLeft - dt);
      if (slot.cooldownLeft > 0) continue;
      const weapon = getWeapon(this.registry, slot.itemId);
      // Fire direction: aim, else nearest enemy, else hold fire
      let dir: number | null = null;
      if (aiming) dir = Math.atan2(input.aimY, input.aimX);
      else {
        const nearest = this.nearestEnemy(p.x, p.y, 12);
        if (nearest) dir = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      }
      if (dir === null) continue;
      const rate = 1 + stat(p.stats, 'cooldownRate');
      slot.cooldownLeft = weapon.delivery.cooldown / Math.max(0.1, rate);
      this.fireWeapon(p, weapon, dir);
    }
  }

  private fireWeapon(p: PlayerState, weapon: WeaponDef, dir: number): void {
    if (weapon.delivery.type === 'meleeArc') {
      const reach = weapon.delivery.reach * (1 + stat(p.stats, 'area'));
      const halfArc = ((weapon.delivery.arcDeg / 2) * Math.PI) / 180;
      const hitId = this.tracker.newHitId();
      const candidates = this.spatial.query(p.x, p.y, reach + 1, this.spatialScratch);
      for (const c of candidates) {
        const enemy = this.findEnemy(c.id);
        if (!enemy || !enemy.alive) continue;
        const def = getEnemy(this.registry, enemy.defId);
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach + def.radius) continue;
        let angleDiff = Math.abs(Math.atan2(dy, dx) - dir);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > halfArc) continue;
        this.damageEnemy(enemy, p, weapon, 'melee', hitId);
      }
    } else {
      const d = weapon.delivery;
      const count = d.count;
      const spread = (d.spreadDeg * Math.PI) / 180;
      for (let i = 0; i < count; i++) {
        const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
        const a = dir + offset;
        const proj = this.allocProjectile();
        if (!proj) return;
        const speed = d.speed * (1 + stat(p.stats, 'projectileSpeed'));
        proj.active = true;
        proj.x = p.x;
        proj.y = p.y;
        proj.vx = Math.cos(a) * speed;
        proj.vy = Math.sin(a) * speed;
        proj.radius = d.radius;
        proj.traveled = 0;
        proj.range = d.range;
        proj.fromPlayer = p.index;
        proj.itemId = weapon.id;
        proj.enemyDefId = null;
        proj.pierceLeft = d.pierce;
        proj.hitIds.clear();
      }
    }
  }

  private damageEnemy(
    enemy: EnemyState,
    p: PlayerState,
    weapon: WeaponDef,
    deliveryTag: SourceChain['deliveryTag'],
    hitId: number,
  ): void {
    const def = getEnemy(this.registry, enemy.defId);
    const attack: AttackProfile = {
      kind: weapon.kind,
      types: weapon.damage.types,
      multiplier: weapon.damage.multiplier,
      flat: weapon.damage.flat,
    };
    const rolled = rollAttack(attack, p.stats, this.rng.combat, this.registry.balance);
    const enemyDefense: DefenseProfile = {
      armor: def.armor,
      dodge: 0,
      blockPhys: 0,
      blockSpell: 0,
      resistAll: 0,
      resists: {},
      flatReduction: 0,
    };
    const hit = resolveHit(
      rolled.raw,
      attack,
      enemyDefense,
      this.state.wave,
      this.rng.combat,
      this.registry.balance,
    );
    const source: SourceChain = {
      actor: { kind: 'player', index: p.index },
      itemId: weapon.id,
      grantedBy: null,
      deliveryTag,
      hitId,
    };
    const target: ActorRef = { kind: 'enemy', id: enemy.defId, instance: enemy.instance };
    const overkill = Math.max(0, hit.amount - enemy.hp);
    enemy.hp -= hit.amount;
    enemy.hitFlash = 0.12;
    this.tracker.push({
      type: 'damage',
      tick: this.state.tick,
      wave: this.state.wave,
      source,
      target,
      amount: hit.amount,
      raw: Math.round(rolled.raw),
      types: attack.types,
      crit: rolled.crit,
      mitigated: hit.mitigation,
      overkill,
    });
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      this.tracker.push({ type: 'kill', tick: this.state.tick, wave: this.state.wave, source, target });
      this.onEnemyKilled(enemy, def, p.index);
    }
  }

  private onEnemyKilled(enemy: EnemyState, def: EnemyDef, byPlayer: number): void {
    this.eventsThisTick.push({
      type: 'enemyKilled',
      defId: enemy.defId,
      instance: enemy.instance,
      byPlayer,
    });
    // Combo streak
    const combo = this.state.combo;
    combo.count++;
    combo.decay = this.registry.balance.combo.decaySeconds;
    if (combo.count > combo.best) combo.best = combo.count;
    if (combo.count % 5 === 0) this.eventsThisTick.push({ type: 'comboTier', count: combo.count });

    // Drops: gold + xp pickups scatter near the corpse
    const goldAmount = this.rng.drops.int(def.gold[0], def.gold[1]);
    for (let i = 0; i < goldAmount; i++) this.dropPickup(enemy.x, enemy.y, 'gold', 1);
    const comboMult = Math.min(
      this.registry.balance.combo.maxMult,
      1 + combo.count * this.registry.balance.combo.xpPerStack,
    );
    this.dropPickup(enemy.x, enemy.y, 'xp', Math.round(def.xp * comboMult));
  }

  private dropPickup(x: number, y: number, kind: 'gold' | 'xp', amount: number): void {
    if (amount <= 0) return;
    for (const pk of this.state.pickups) {
      if (pk.active) continue;
      pk.active = true;
      pk.x = x + (this.rng.drops.next() - 0.5) * 0.9;
      pk.y = y + (this.rng.drops.next() - 0.5) * 0.9;
      pk.kind = kind;
      pk.amount = amount;
      return;
    }
    // Pool exhausted: merge into the oldest active pickup of the same kind.
    const fallback = this.state.pickups.find((p) => p.active && p.kind === kind);
    if (fallback) fallback.amount += amount;
  }

  // ---- enemies ----

  private tickSpawning(dt: number): void {
    const sp = this.state.spawning;
    if (sp.done) return;
    sp.elapsed += dt;
    let allSpawned = true;
    for (const entry of sp.queue) {
      if (entry.count <= 0) continue;
      if (sp.elapsed >= entry.atSecond) {
        for (let i = 0; i < entry.count; i++) {
          const edge = this.rng.waves.int(0, 3);
          const a = this.state.arena;
          const t = this.rng.waves.next();
          const pos =
            edge === 0
              ? { x: t * a.width, y: 1 }
              : edge === 1
                ? { x: t * a.width, y: a.height - 1 }
                : edge === 2
                  ? { x: 1, y: t * a.height }
                  : { x: a.width - 1, y: t * a.height };
          this.spawnEnemy(entry.defId, pos.x, pos.y);
        }
        entry.count = 0;
      } else allSpawned = false;
    }
    if (allSpawned) sp.done = true;
  }

  private tickEnemies(dt: number): void {
    const bal = this.registry.balance;
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const def = getEnemy(this.registry, e.defId);
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      // Target nearest living player
      let target: PlayerState | null = null;
      let bestDist = Infinity;
      for (const p of this.state.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < bestDist) {
          bestDist = d;
          target = p;
        }
      }
      if (!target) continue;
      e.targetPlayer = target.index;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;

      let moveX = dx / dist;
      let moveY = dy / dist;
      if (def.archetype === 'skitterer') {
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.wanderTimer = 0.6 + this.rng.combat.next() * 0.6;
          e.wanderAngle = (this.rng.combat.next() - 0.5) * (Math.PI / 2);
        }
        const cos = Math.cos(e.wanderAngle);
        const sin = Math.sin(e.wanderAngle);
        const wx = moveX * cos - moveY * sin;
        const wy = moveX * sin + moveY * cos;
        moveX = wx;
        moveY = wy;
      } else if (def.archetype === 'shooter') {
        const range = def.range ?? 7;
        if (dist < range * 0.6) {
          moveX = -moveX;
          moveY = -moveY;
        } else if (dist < range) {
          // strafe perpendicular
          const px = -moveY;
          const py = moveX;
          moveX = px;
          moveY = py;
        }
        if (dist <= range && e.attackCooldown <= 0) {
          e.attackCooldown = def.attackCooldown;
          const proj = this.allocProjectile();
          if (proj) {
            const speed = def.projectileSpeed ?? 7;
            proj.active = true;
            proj.x = e.x;
            proj.y = e.y;
            proj.vx = (dx / dist) * speed;
            proj.vy = (dy / dist) * speed;
            proj.radius = 0.25;
            proj.traveled = 0;
            proj.range = range + 4;
            proj.fromPlayer = -1;
            proj.itemId = null;
            proj.enemyDefId = e.defId;
            proj.pierceLeft = 0;
            proj.hitIds.clear();
          }
        }
      }

      e.x += moveX * def.moveSpeed * dt;
      e.y += moveY * def.moveSpeed * dt;
      const a = this.state.arena;
      e.x = Math.min(a.width - def.radius, Math.max(def.radius, e.x));
      e.y = Math.min(a.height - def.radius, Math.max(def.radius, e.y));

      // Contact damage (chasers/skitterers, and shooters that get close)
      const touchDist = def.radius + bal.player.radius;
      if (dist <= touchDist + 0.1 && e.attackCooldown <= 0 && def.archetype !== 'shooter') {
        e.attackCooldown = def.attackCooldown;
        this.damagePlayer(target, def.damage, def, 'contact');
      }
    }
  }

  private damagePlayer(
    p: PlayerState,
    baseAmount: number,
    def: EnemyDef,
    deliveryTag: SourceChain['deliveryTag'],
  ): void {
    if (!p.alive || p.iframeTimer > 0) return;
    const attack: AttackProfile = {
      kind: 'attack',
      types: def.damageTypes,
      multiplier: 0,
      flat: [baseAmount, baseAmount],
    };
    const hit = resolveHit(
      baseAmount,
      attack,
      p.defense,
      this.state.wave,
      this.rng.combat,
      this.registry.balance,
    );
    const source: SourceChain = {
      actor: { kind: 'enemy', id: def.id, instance: 0 },
      itemId: null,
      grantedBy: null,
      deliveryTag,
      hitId: this.tracker.newHitId(),
    };
    const target: ActorRef = { kind: 'player', index: p.index };
    if (hit.dodged) {
      this.tracker.push({ type: 'dodgeSave', tick: this.state.tick, wave: this.state.wave, target, source });
      return;
    }
    p.hp -= hit.amount;
    this.tracker.push({
      type: 'damage',
      tick: this.state.tick,
      wave: this.state.wave,
      source,
      target,
      amount: hit.amount,
      raw: baseAmount,
      types: def.damageTypes,
      crit: false,
      mitigated: hit.mitigation,
      overkill: Math.max(0, -p.hp),
    });
    this.eventsThisTick.push({ type: 'playerHit', player: p.index, amount: hit.amount });
    if (p.hp <= 0) {
      p.alive = false;
      p.hp = 0;
      this.eventsThisTick.push({ type: 'playerDown', player: p.index });
    }
  }

  // ---- projectiles & pickups ----

  private allocProjectile(): ProjectileState | null {
    for (const pr of this.state.projectiles) if (!pr.active) return pr;
    return null;
  }

  private tickProjectiles(dt: number): void {
    const bal = this.registry.balance;
    for (const pr of this.state.projectiles) {
      if (!pr.active) continue;
      const step = Math.hypot(pr.vx, pr.vy) * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.traveled += step;
      const a = this.state.arena;
      if (pr.traveled >= pr.range || pr.x < 0 || pr.y < 0 || pr.x > a.width || pr.y > a.height) {
        pr.active = false;
        continue;
      }
      if (pr.fromPlayer >= 0) {
        // Player projectile vs enemies
        const candidates = this.spatial.query(pr.x, pr.y, pr.radius + 1, this.spatialScratch);
        for (const c of candidates) {
          if (pr.hitIds.has(c.id)) continue;
          const enemy = this.findEnemy(c.id);
          if (!enemy || !enemy.alive) continue;
          const def = getEnemy(this.registry, enemy.defId);
          if (Math.hypot(enemy.x - pr.x, enemy.y - pr.y) > def.radius + pr.radius) continue;
          const p = this.state.players[pr.fromPlayer]!;
          const weapon = pr.itemId ? getWeapon(this.registry, pr.itemId) : null;
          if (weapon) {
            this.damageEnemy(enemy, p, weapon, 'projectile', this.tracker.newHitId());
          }
          pr.hitIds.add(c.id);
          if (pr.pierceLeft > 0) pr.pierceLeft--;
          else {
            pr.active = false;
            break;
          }
        }
      } else {
        // Enemy projectile vs players
        for (const p of this.state.players) {
          if (!p.alive) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) > bal.player.radius + pr.radius) continue;
          const def = pr.enemyDefId ? getEnemy(this.registry, pr.enemyDefId) : null;
          if (def) this.damagePlayer(p, def.damage, def, 'projectile');
          pr.active = false;
          break;
        }
      }
    }
  }

  private tickPickups(dt: number): void {
    const MAGNET_SPEED = 9; // units/s once inside a player's pickup radius
    const COLLECT_DIST = 0.5;
    for (const pk of this.state.pickups) {
      if (!pk.active) continue;
      // Find the nearest living player whose pickup radius covers this drop
      let puller: PlayerState | null = null;
      let pullerDist = Infinity;
      for (const p of this.state.players) {
        if (!p.alive) continue;
        const radius = stat(p.stats, 'pickupRadius') || this.registry.balance.drops.pickupBaseRadius;
        const d = Math.hypot(p.x - pk.x, p.y - pk.y);
        if (d <= radius && d < pullerDist) {
          puller = p;
          pullerDist = d;
        }
      }
      if (!puller) continue;
      if (pullerDist > COLLECT_DIST) {
        // Magnetize toward the collector
        const dx = puller.x - pk.x;
        const dy = puller.y - pk.y;
        const d = pullerDist || 1;
        pk.x += (dx / d) * MAGNET_SPEED * dt;
        pk.y += (dy / d) * MAGNET_SPEED * dt;
        continue;
      }
      {
        const p = puller;
        pk.active = false;
        if (pk.kind === 'gold') {
          // Mirrored gold: every living-or-snuffed (non-retired) player receives it
          for (const other of this.state.players) other.gold += pk.amount;
        } else {
          for (const other of this.state.players) other.xp += pk.amount;
        }
        this.tracker.push({
          type: 'pickup',
          tick: this.state.tick,
          wave: this.state.wave,
          player: p.index,
          what: pk.kind,
          amount: pk.amount,
        });
      }
    }
  }

  private tickCombo(dt: number): void {
    const combo = this.state.combo;
    if (combo.count > 0) {
      combo.decay -= dt;
      if (combo.decay <= 0) combo.count = 0;
    }
  }

  // ---- helpers ----

  private findEnemy(instance: number): EnemyState | undefined {
    return this.state.enemies.find((e) => e.instance === instance);
  }

  nearestEnemy(x: number, y: number, maxDist: number): EnemyState | null {
    let best: EnemyState | null = null;
    let bestDist = maxDist;
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  aliveEnemyCount(): number {
    let n = 0;
    for (const e of this.state.enemies) if (e.alive) n++;
    return n;
  }

  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (n: number) => {
      h ^= Math.round(n * 1024) >>> 0;
      h = Math.imul(h, 16777619);
    };
    mix(this.state.tick);
    for (const p of this.state.players) {
      mix(p.x);
      mix(p.y);
      mix(p.hp);
      mix(p.gold);
      mix(p.xp);
    }
    for (const e of this.state.enemies) {
      mix(e.x);
      mix(e.y);
      mix(e.hp);
    }
    return h >>> 0;
  }
}
