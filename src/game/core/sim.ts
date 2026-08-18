// The simulation core: pure TypeScript, no browser APIs, no rendering.
// The live game, the headless simulator, and the tests all drive THIS.
// M1-B scope adds: status effects (burn/poison/stun/slow/freeze), leveling,
// data-driven waves, charger/splitter archetypes, elites, chest drops.

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
import {
  applyEffect,
  freshStatus,
  isControlled,
  moveMult,
  tickStatus,
  type StatusState,
} from './status';
import {
  loadRegistry,
  getEnemy,
  getWave,
  getWeapon,
  maxWave,
  minWave,
  type Registry,
} from '../data/registry';
import type { ClassDef, EnemyDef, TriggerDef } from '../data/schemas';
import {
  nextQuality,
  resolveWeapon,
  rustyInstance,
  standardInstance,
  TINKER_COST,
  type Quality,
  type ResolvedWeapon,
  type VariantKind,
  type WeaponInstance,
} from './items';

export type WeaponSlot = WeaponInstance & { cooldownLeft: number };

export type ChestOffer =
  | { kind: 'weapon'; inst: WeaponInstance }
  | { kind: 'passive'; id: string };

export type PeddlerOffer =
  | { kind: 'weapon'; inst: WeaponInstance; price: number }
  | { kind: 'passive'; id: string; price: number }
  | { kind: 'snack'; price: number }; // Wax Snack: melts on purchase, heals to full

export type PlayerState = {
  index: number;
  classId: string;
  x: number;
  y: number;
  facing: number;
  hp: number;
  alive: boolean;
  stats: StatSheet;
  defense: DefenseProfile;
  weapons: WeaponSlot[];
  guaranteedCrit: boolean; // backspin: next hit crits
  pendingClassItems: string[][]; // queued class level-up choices (option lists)
  passives: string[];
  feats: string[]; // feat inventory — item-like, never dropped (design 06)
  pendingFeats: number; // 1-of-4 feat picks owed (every 3rd level)
  stillTimer: number; // staticCharge: seconds spent motionless
  staticReady: boolean; // staticCharge: next hit stuns
  usedSecondWick: boolean; // once-per-run fatal save spent
  coinCharge: number; // coin-operated-blade: bonus damage fraction on next hit
  bits: number; // salvage material — spent on Tinkering quality upgrades
  gold: number;
  xp: number;
  xpIntoLevel: number;
  level: number;
  pendingBoons: number;
  pendingChests: number;
  boonIds: string[];
  dashTimer: number;
  dashCooldown: number;
  iframeTimer: number;
  dashDirX: number;
  dashDirY: number;
  squishPhase: number;
  moving: boolean;
  contactHitCooldown: number;
  reviveProgress: number; // seconds of Interact held near this player's wisp
  revivedThisWave: boolean;
  dashTouched: Set<number>; // enemies passed through during the current dash
};

export type ChargeState = {
  phase: 'none' | 'windup' | 'charging' | 'recover';
  timer: number;
  dirX: number;
  dirY: number;
};

export type BossState = {
  phaseIdx: number;
  cooldown: number;
  stage: 'idle' | 'windup' | 'air' | 'recover';
  stageTimer: number;
  targetX: number;
  targetY: number;
  fromX: number;
  fromY: number;
};

export type EnemyState = {
  instance: number;
  defId: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  // scaled-at-spawn values (wave growth + elite multipliers applied once)
  maxHp: number;
  damage: number;
  moveSpeed: number;
  xp: number;
  chestChance: number;
  elite: boolean;
  status: StatusState;
  charge: ChargeState;
  boss: BossState | null;
  attackCooldown: number;
  summonTimer: number;
  mimicAwake: boolean;
  targetPlayer: number;
  wanderAngle: number;
  wanderTimer: number;
  hitFlash: number;
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
  enemyDamage: number; // scaled damage for enemy projectiles
  pierceLeft: number;
  blastRadius: number; // >0: explodes on impact (explosion-tagged AoE)
  // lobber payload: leaves a pool where the projectile lands
  poolRadius: number;
  poolDps: number;
  poolDuration: number;
  // passive mods
  splitOnHit: boolean; // splitter-prism: fork on first impact
  isChild: boolean; // split children can't split again
  bouncesLeft: number; // bouncy-castle-writ: wall reflections
  damageScale: number; // child projectiles hit softer
  resolved: import('./items').ResolvedWeapon | null; // quality/variant-resolved profile
  hitIds: Set<number>;
};

export type PoolState = {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  dps: number;
  duration: number;
  tickIn: number;
  ownerDefId: string; // enemy def for attribution + damage typing (hostile pools)
  friendly: boolean; // player-owned pools damage enemies instead
  ownerPlayer: number;
  itemId: string | null; // attribution for friendly pools
};

export type PetState = {
  instance: number;
  defId: string;
  owner: number; // player index
  grantedBy: string; // item/class that created it (meter attribution)
  x: number;
  y: number;
  attackCooldown: number;
  lifetime: number; // seconds left; Infinity = permanent
  squishPhase: number;
};

export type PickupKind = 'gold' | 'xp' | 'chest' | 'heart';
export type PickupState = { active: boolean; x: number; y: number; kind: PickupKind; amount: number };

export type Arena = { width: number; height: number };
export type Phase = 'fighting' | 'cleared';

export type SimState = {
  tick: number;
  act: number;
  wave: number;
  endless: boolean;
  phase: Phase;
  arena: Arena;
  players: PlayerState[];
  enemies: EnemyState[];
  pets: PetState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  pools: PoolState[];
  combo: { count: number; decay: number; best: number };
  lootRotation: number; // next player index to receive a chest (round-robin)
  spawning: {
    queue: { defId: string; count: number; atSecond: number; elite: boolean }[];
    elapsed: number;
    done: boolean;
  };
};

export type SimEvent =
  | { type: 'dash'; player: number }
  | { type: 'dashThroughEnemy'; player: number; enemy: number }
  | { type: 'enemyKilled'; defId: string; instance: number; byPlayer: number }
  | { type: 'playerHit'; player: number; amount: number }
  | { type: 'playerDown'; player: number }
  | { type: 'comboTier'; count: number }
  | { type: 'levelUp'; player: number; level: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'chargeTelegraph'; instance: number }
  | { type: 'damageNumber'; x: number; y: number; amount: number; crit: boolean; onPlayer: boolean }
  | { type: 'bossSpawned'; instance: number; defId: string }
  | { type: 'bossPhase'; instance: number; phase: number }
  | { type: 'playerRevived'; player: number; by: number }
  | { type: 'lowHpWaveClear' }
  | { type: 'secondWick'; player: number }
  | { type: 'runOver' };

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
  private enemyByInstance = new Map<number, EnemyState>();

  constructor(
    seed: number,
    playerCount = 1,
    arena: Arena = { width: 40, height: 30 },
    classIds: string[] = [],
  ) {
    this.registry = loadRegistry();
    this.rng = createRng(seed);
    const players: PlayerState[] = [];
    for (let i = 0; i < playerCount; i++) {
      players.push(this.createPlayer(i, playerCount, arena, classIds[i] ?? 'hero'));
    }
    const projectiles: ProjectileState[] = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      projectiles.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, radius: 0, traveled: 0, range: 0,
        fromPlayer: -1, itemId: null, enemyDefId: null, enemyDamage: 0, pierceLeft: 0,
        blastRadius: 0,
        poolRadius: 0, poolDps: 0, poolDuration: 0,
        splitOnHit: false, isChild: false, bouncesLeft: 0, damageScale: 1,
        resolved: null,
        hitIds: new Set(),
      });
    }
    const pickups: PickupState[] = [];
    for (let i = 0; i < MAX_PICKUPS; i++) pickups.push({ active: false, x: 0, y: 0, kind: 'gold', amount: 0 });
    const pools: PoolState[] = [];
    for (let i = 0; i < 96; i++) {
      pools.push({
        active: false, x: 0, y: 0, radius: 0, dps: 0, duration: 0, tickIn: 0,
        ownerDefId: '', friendly: false, ownerPlayer: -1, itemId: null,
      });
    }
    this.state = {
      tick: 0,
      act: 1,
      wave: 0,
      endless: false,
      phase: 'cleared',
      arena,
      players,
      enemies: [],
      pets: [],
      projectiles,
      pickups,
      pools,
      combo: { count: 0, decay: 0, best: 0 },
      lootRotation: 0,
      spawning: { queue: [], elapsed: 0, done: true },
    };
    // Class starting pets (Hunter's dog, ...)
    for (const p of this.state.players) {
      for (const petId of this.classDef(p.classId).startingPets) {
        this.spawnPet(petId, p.index, p.classId, p.x + 1, p.y + 1);
      }
    }
  }

  classDef(classId: string): ClassDef {
    const c = this.registry.classes.get(classId);
    if (!c) throw new Error(`Unknown class "${classId}"`);
    return c;
  }

  private createPlayer(i: number, playerCount: number, arena: Arena, classId = 'hero'): PlayerState {
    const bal = this.registry.balance;
    const cls = this.classDef(classId);
    // Starting kit is Rusty quality — the town's "starting weapon" upgrade shines later
    const weapons: WeaponSlot[] = cls.startingWeapons.map((id) => ({
      ...rustyInstance(id),
      cooldownLeft: 0,
    }));
    const grantSets = [cls.statMods, ...weapons.map((w) => resolveWeapon(this.registry, w).grants)];
    const stats = buildStats(bal.player.baseStats as StatSheet, grantSets);
    return {
      index: i,
      classId,
      guaranteedCrit: false,
      pendingClassItems: [],
      passives: [],
      feats: [],
      pendingFeats: 0,
      stillTimer: 0,
      staticReady: false,
      usedSecondWick: false,
      coinCharge: 0,
      bits: 0,
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
      xpIntoLevel: 0,
      level: 1,
      pendingBoons: 0,
      pendingChests: 0,
      boonIds: [],
      dashTimer: 0,
      dashCooldown: 0,
      iframeTimer: 0,
      dashDirX: 1,
      dashDirY: 0,
      squishPhase: 0,
      moving: false,
      contactHitCooldown: 0,
      reviveProgress: 0,
      revivedThisWave: false,
      dashTouched: new Set(),
    };
  }

  /** Hot-join: add a player mid-run with a level catch-up to the party average. */
  addPlayer(): PlayerState {
    if (this.state.players.length >= 4) throw new Error('Party is full');
    const avgLevel = Math.max(
      1,
      Math.floor(
        this.state.players.reduce((a, p) => a + p.level, 0) / this.state.players.length,
      ),
    );
    const p = this.createPlayer(this.state.players.length, this.state.players.length + 1, this.state.arena);
    p.level = avgLevel;
    p.pendingBoons = Math.min(6, avgLevel - 1); // catch-up picks, capped so the panel stays sane
    p.gold = this.state.players[0]?.gold ?? 0; // gold is mirrored — joiners share the pool
    this.state.players.push(p);
    this.recomputeStats(p);
    p.hp = stat(p.stats, 'maxHp');
    return p;
  }

  // ---- boons ----

  // ---- pets ----

  private nextPetInstance = 1;

  /** Spawn a pet for a player, respecting the per-owner cap for that pet type. */
  spawnPet(defId: string, owner: number, grantedBy: string, x: number, y: number): PetState | null {
    const def = this.registry.pets.get(defId);
    if (!def) throw new Error(`Unknown pet "${defId}"`);
    const owned = this.state.pets.filter((pt) => pt.owner === owner && pt.defId === defId).length;
    if (owned >= def.maxPerOwner) return null;
    const pet: PetState = {
      instance: this.nextPetInstance++,
      defId,
      owner,
      grantedBy,
      x,
      y,
      attackCooldown: 0,
      lifetime: def.lifetime > 0 ? def.lifetime : Infinity,
      squishPhase: 0,
    };
    this.state.pets.push(pet);
    return pet;
  }

  private tickPets(dt: number): void {
    const s = this.state;
    for (let i = s.pets.length - 1; i >= 0; i--) {
      const pet = s.pets[i]!;
      const def = this.registry.pets.get(pet.defId)!;
      pet.lifetime -= dt;
      const owner = s.players[pet.owner];
      if (pet.lifetime <= 0 || !owner) {
        // Grave Dividend: zombies leave a coin behind. Politely.
        if (owner && pet.defId === 'zombie' && this.hasMod(owner, 'graveDividend')) {
          this.dropPickup(pet.x, pet.y, 'gold', 1);
        }
        s.pets[i] = s.pets[s.pets.length - 1]!;
        s.pets.pop();
        continue;
      }
      if (pet.attackCooldown > 0) pet.attackCooldown = Math.max(0, pet.attackCooldown - dt);

      // Target: nearest enemy within leash of the owner; else trot back to the owner
      let target: EnemyState | null = null;
      let bestDist = Infinity;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - owner.x, e.y - owner.y) > def.leash) continue;
        const d = Math.hypot(e.x - pet.x, e.y - pet.y);
        if (d < bestDist) {
          bestDist = d;
          target = e;
        }
      }
      let moveX = 0;
      let moveY = 0;
      if (target) {
        const edef = getEnemy(this.registry, target.defId);
        const dx = target.x - pet.x;
        const dy = target.y - pet.y;
        const dist = Math.hypot(dx, dy) || 1;
        const touch = def.radius + edef.radius + 0.1;
        if (dist > touch) {
          moveX = dx / dist;
          moveY = dy / dist;
        } else if (pet.attackCooldown <= 0) {
          pet.attackCooldown = def.attackCooldown;
          this.petBite(pet, def.multiplier, def.flat, def.types, target);
        }
      } else {
        const dx = owner.x - pet.x;
        const dy = owner.y - pet.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1.5) {
          moveX = dx / dist;
          moveY = dy / dist;
        }
      }
      if (moveX || moveY) {
        pet.x += moveX * def.moveSpeed * dt;
        pet.y += moveY * def.moveSpeed * dt;
        pet.squishPhase = (pet.squishPhase + dt * 9) % (Math.PI * 2);
      }
    }
  }

  private petBite(
    pet: PetState,
    multiplier: number,
    flat: [number, number],
    types: import('../data/stats').DamageType[],
    target: EnemyState,
  ): void {
    const owner = this.state.players[pet.owner]!;
    this.applyDamageToEnemy(
      target,
      { kind: 'attack', types, multiplier, flat },
      owner.stats, // pet damage scales from the OWNER's stats (petDamage et al.)
      {
        actor: { kind: 'pet', owner: pet.owner, id: pet.defId, instance: pet.instance },
        itemId: pet.grantedBy,
        grantedBy: pet.defId,
        deliveryTag: 'pet',
        hitId: this.tracker.newHitId(),
      },
    );
  }

  // ---- passives ----

  hasPassive(p: PlayerState, id: string): boolean {
    return p.passives.includes(id);
  }

  hasMod(p: PlayerState, mod: string): boolean {
    return (
      p.passives.some((id) => this.registry.passives.get(id)?.mods.includes(mod as never)) ||
      p.feats.some((id) => this.registry.feats.get(id)?.mods.includes(mod as never))
    );
  }

  /** All triggers of a kind across a player's passives, with owning item ids. */
  triggersFor(p: PlayerState, on: TriggerDef['on']): { trigger: TriggerDef; itemId: string }[] {
    const out: { trigger: TriggerDef; itemId: string }[] = [];
    for (const id of p.passives) {
      const def = this.registry.passives.get(id);
      if (!def) continue;
      for (const t of def.triggers) if (t.on === on) out.push({ trigger: t, itemId: id });
    }
    for (const id of p.feats) {
      const def = this.registry.feats.get(id);
      if (!def) continue;
      for (const t of def.triggers) if (t.on === on) out.push({ trigger: t, itemId: id });
    }
    return out;
  }

  addPassive(playerIndex: number, passiveId: string): void {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    if (!this.registry.passives.has(passiveId)) throw new Error(`Unknown passive "${passiveId}"`);
    if (p.passives.includes(passiveId)) return;
    p.passives.push(passiveId);
    this.recomputeStats(p);
  }

  /** Rebuild a player's stat sheet from base + class + weapons + passives + boons. */
  recomputeStats(p: PlayerState): void {
    const bal = this.registry.balance;
    const cls = this.classDef(p.classId);
    const prevMax = stat(p.stats, 'maxHp');
    const grantSets = [
      cls.statMods,
      this.townGrants,
      ...p.weapons.map((w) => resolveWeapon(this.registry, w).grants),
      ...p.passives.map((id) => this.registry.passives.get(id)?.grants ?? []),
      ...p.feats.map((id) => this.registry.feats.get(id)?.grants ?? []),
      ...p.boonIds.map((id) => {
        const b = this.registry.boons.get(id);
        if (!b) throw new Error(`Unknown boon "${id}"`);
        return b.grants;
      }),
    ];
    p.stats = buildStats(bal.player.baseStats as StatSheet, grantSets);
    p.defense = defenseFromStats(p.stats);
    if (cls.mechanic === 'ironhide') p.defense.armorVsSpellsFrac = 0.25;
    const newMax = stat(p.stats, 'maxHp');
    if (newMax > prevMax) p.hp += newMax - prevMax; // max HP gains heal the delta
    p.hp = Math.min(p.hp, newMax);
  }

  /** Heal with mechanic caps (redline: never above 80% max HP). */
  healPlayer(p: PlayerState, amount: number, grantedBy: string | null): number {
    if (!p.alive || amount <= 0) return 0;
    const cls = this.classDef(p.classId);
    const cap = stat(p.stats, 'maxHp') * (cls.mechanic === 'redline' ? 0.8 : 1);
    const healed = Math.min(amount, Math.max(0, cap - p.hp));
    if (healed <= 0) return 0;
    p.hp += healed;
    this.tracker.push({
      type: 'heal',
      tick: this.state.tick,
      wave: this.state.wave,
      source: {
        actor: { kind: 'player', index: p.index },
        itemId: null,
        grantedBy,
        deliveryTag: 'pickup',
        hitId: this.tracker.newHitId(),
      },
      target: { kind: 'player', index: p.index },
      amount: healed,
    });
    return healed;
  }

  /** Weighted 1-of-N boon choices (no duplicates within one offer). */
  rollBoonChoices(count = 4): string[] {
    const pool = [...this.registry.boons.values()];
    const out: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const totalWeight = pool.reduce((a, b) => a + b.weight, 0);
      let roll = this.rng.drops.next() * totalWeight;
      let picked = pool.length - 1;
      for (let j = 0; j < pool.length; j++) {
        roll -= pool[j]!.weight;
        if (roll <= 0) {
          picked = j;
          break;
        }
      }
      out.push(pool[picked]!.id);
      pool.splice(picked, 1);
    }
    return out;
  }

  applyBoon(playerIndex: number, boonId: string): void {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    if (!this.registry.boons.has(boonId)) throw new Error(`Unknown boon "${boonId}"`);
    p.boonIds.push(boonId);
    if (p.pendingBoons > 0) p.pendingBoons--;
    this.recomputeStats(p);
  }

  // ---- wave control ----

  /** Start the given wave of the current act from wave data. Spawn counts scale
   *  with party size; per-player XP is divided so leveling stays flat vs solo. */
  startWaveNumber(wave: number): void {
    const w = getWave(this.registry, this.state.act, wave);
    const bal = this.registry.balance;
    const coopMult = 1 + bal.coop.spawnMultPerExtraPlayer * (this.state.players.length - 1);
    // Evil Candle: the flame draws more of the dark
    const evilMult = 1 + bal.evil.candleSpawn * this.evilCount('evilCandle');
    this.state.wave = wave;
    this.state.phase = 'fighting';
    const queue = w.entries.map((e) => ({
      defId: e.defId,
      count: Math.round(e.count * coopMult * evilMult),
      atSecond: e.atSecond,
      elite: e.elite,
    }));
    // Evil Eye: a champion answers the invitation, every wave
    const eyes = this.evilCount('evilEye');
    const mini = Sim.ACT_MINIBOSS[this.state.act];
    if (mini) {
      for (let i = 0; i < eyes; i++) queue.push({ defId: mini, count: 1, atSecond: 8 + i * 4, elite: false });
    }
    this.state.spawning = { queue, elapsed: 0, done: false };
    // Evil Fist: the deal includes an extra chest, somewhere out there
    for (let i = 0; i < this.evilCount('evilFist'); i++) {
      this.dropPickup(
        2 + this.rng.drops.next() * (this.state.arena.width - 4),
        2 + this.rng.drops.next() * (this.state.arena.height - 4),
        'chest',
        1,
      );
    }
  }

  /** True while the current act has a next wave (endless always does). */
  hasNextWave(): boolean {
    if (this.state.endless) return true;
    return this.state.wave < maxWave(this.registry, this.state.act);
  }

  /** Move to the next act's first wave (same run — act was already unlocked). */
  advanceAct(): void {
    const next = this.state.act + 1;
    if (!this.registry.waves.has(next)) throw new Error(`No act ${next}`);
    this.state.act = next;
    this.startWaveNumber(minWave(this.registry, next));
  }

  /** Bellhop drop-off: start a run at a later act with a catch-up package. */
  setStartingAct(act: number): void {
    if (!this.registry.waves.has(act)) throw new Error(`No act ${act}`);
    this.state.act = act;
    if (act > 1) {
      // Catch-up mirrors what a continuing run would have banked: a player who
      // cleared act N arrives around level 8N with a full boon spread and loot
      const level = 1 + (act - 1) * 8;
      // Quality odds and boon math key off the wave counter — point it at the
      // act door so catch-up chests roll act-appropriate gear, not rusty scraps
      this.state.wave = minWave(this.registry, act) - 1;
      for (const p of this.state.players) {
        p.level = level;
        p.pendingBoons = level - 1;
        p.gold += 75 * (act - 1);
        p.pendingChests += 2 * (act - 1); // chests per skipped act keep loadouts on-curve
      }
    }
  }

  firstWaveOfCurrentAct(): number {
    return minWave(this.registry, this.state.act);
  }

  /** Endless mode: remix waves synthesized from the full enemy pool, compounding. */
  startEndlessWave(wave: number): void {
    this.state.endless = true;
    this.state.wave = wave;
    this.state.phase = 'fighting';
    const pool = [...this.registry.enemies.values()].filter((e) => e.archetype !== 'boss');
    const groups = 3 + Math.min(3, Math.floor((wave - 40) / 5));
    const coopMult =
      1 + this.registry.balance.coop.spawnMultPerExtraPlayer * (this.state.players.length - 1);
    const queue: SimState['spawning']['queue'] = [];
    for (let g = 0; g < groups; g++) {
      const def = this.rng.waves.pick(pool);
      queue.push({
        defId: def.id,
        count: Math.round((4 + (wave - 40) * 0.6 + g) * coopMult),
        atSecond: g * 6,
        elite: this.rng.waves.chance(Math.min(0.5, 0.1 + (wave - 40) * 0.02)),
      });
    }
    // Every 10th endless wave: a stirred (elite) boss returns
    if (wave % 10 === 0) {
      const bosses = [...this.registry.enemies.values()].filter((e) => e.archetype === 'boss');
      queue.push({ defId: this.rng.waves.pick(bosses).id, count: 1, atSecond: 4, elite: true });
    }
    this.state.spawning = { queue, elapsed: 0, done: false };
  }

  /** Custom scripts (tests/sandbox). */
  startWave(entries: { defId: string; count: number; atSecond: number; elite?: boolean }[]): void {
    this.state.phase = 'fighting';
    this.state.spawning = {
      queue: entries.map((e) => ({ ...e, elite: e.elite ?? false })),
      elapsed: 0,
      done: false,
    };
  }

  spawnEnemy(defId: string, x: number, y: number, elite = false): EnemyState {
    const def = getEnemy(this.registry, defId);
    const bal = this.registry.balance;
    // Past wave 40 (endless) growth compounds — the dark eventually wins
    const endlessMult = this.state.wave > 40 ? Math.pow(1.08, this.state.wave - 40) : 1;
    // Evil items sharpen the dark
    const drums = this.evilCount('evilDrum');
    const fists = this.evilCount('evilFist');
    const bellows = this.evilCount('evilBellows');
    const hearts = this.evilCount('evilHeart');
    const evilHp = 1 + bal.evil.drumHp * drums + bal.evil.heartStats * hearts;
    const evilDmg = 1 + bal.evil.fistDmg * fists + bal.evil.heartStats * hearts;
    const evilSpeed = 1 + bal.evil.bellowsSpeed * bellows;
    const evilXp = 1 + bal.evil.drumXp * drums + bal.evil.heartReward * hearts;
    const waveGrowthHp =
      (1 + bal.waves.hpGrowthPerWave * Math.max(0, this.state.wave - 1)) * endlessMult * evilHp;
    const waveGrowthDmg =
      (1 + bal.waves.dmgGrowthPerWave * Math.max(0, this.state.wave - 1)) * endlessMult * evilDmg;
    const em = bal.waves.elite;
    const e: EnemyState = {
      instance: this.nextEnemyInstance++,
      defId,
      x,
      y,
      hp: def.maxHp * waveGrowthHp * (elite ? em.hpMult : 1),
      alive: true,
      maxHp: def.maxHp * waveGrowthHp * (elite ? em.hpMult : 1),
      damage: def.damage * waveGrowthDmg * (elite ? em.dmgMult : 1),
      moveSpeed: def.moveSpeed * (elite ? em.speedMult : 1) * evilSpeed,
      xp: def.xp * (elite ? em.xpMult : 1) * evilXp,
      chestChance: Math.max(def.chestChance, elite ? em.chestChance : 0),
      elite,
      status: freshStatus(),
      charge: { phase: 'none', timer: 0, dirX: 0, dirY: 0 },
      summonTimer: 0,
      mimicAwake: false,
      boss:
        def.archetype === 'boss'
          ? { phaseIdx: 0, cooldown: 1.5, stage: 'idle', stageTimer: 0, targetX: x, targetY: y, fromX: x, fromY: y }
          : null,
      attackCooldown: 0,
      targetPlayer: 0,
      wanderAngle: 0,
      wanderTimer: 0,
      hitFlash: 0,
    };
    this.state.enemies.push(e);
    this.enemyByInstance.set(e.instance, e);
    if (e.boss) this.eventsThisTick.push({ type: 'bossSpawned', instance: e.instance, defId });
    return e;
  }

  // ---- weapons (equipment management) ----

  /** Item ids unlocked on this save slot; weapons with an unlockDeed need to be here. */
  unlockedItems = new Set<string>();
  unlockedFeats = new Set<string>();

  /** Evil item copies across the whole party (they stack). */
  evilCount(mod: string): number {
    let n = 0;
    for (const p of this.state.players) {
      for (const id of p.passives) {
        if (this.registry.passives.get(id)?.mods.includes(mod as never)) n++;
      }
    }
    return n;
  }

  private static ACT_MINIBOSS: Record<number, string> = {
    1: 'sir-fluffington',
    2: 'the-damp',
    3: 'avalanche-jr',
    4: 'the-understudy',
  };
  /** Permanent town-upgrade bonuses, included in every stat rebuild. */
  private townGrants: import('../data/schemas').Grant[] = [];

  setTownBonuses(grants: import('../data/schemas').Grant[], startBits: number): void {
    this.townGrants = grants;
    for (const p of this.state.players) {
      p.bits += startBits;
      this.recomputeStats(p);
      p.hp = stat(p.stats, 'maxHp');
    }
  }

  private isItemAvailable(id: string): boolean {
    const w = this.registry.weapons.get(id);
    if (!w) return false;
    return !w.unlockDeed || this.unlockedItems.has(id);
  }

  /** Class equip legality (deny tags). Capacity is checked separately. */
  classCanUse(classId: string, weaponId: string): boolean {
    const cls = this.classDef(classId);
    const w = getWeapon(this.registry, weaponId);
    return !cls.denyTags.some((t) => w.tags.includes(t));
  }

  handPointsUsed(p: PlayerState): number {
    return p.weapons.reduce((a, w) => a + getWeapon(this.registry, w.itemId).hands, 0);
  }

  handPointsMax(p: PlayerState): number {
    return this.classDef(p.classId).handPoints;
  }

  /** Equip an instance (or bare id → standard quality) if hand points allow. */
  equipWeapon(playerIndex: number, weapon: string | WeaponInstance): boolean {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const inst = typeof weapon === 'string' ? standardInstance(weapon) : weapon;
    if (!this.classCanUse(p.classId, inst.itemId)) return false;
    const cost = getWeapon(this.registry, inst.itemId).hands;
    if (this.handPointsUsed(p) + cost > this.handPointsMax(p)) return false;
    p.weapons.push({ ...inst, cooldownLeft: 0 });
    this.recomputeStats(p);
    return true;
  }

  /** Spend Bits to raise one equipped weapon's quality a tier. Returns success. */
  tinker(playerIndex: number, slotIndex: number): boolean {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const slot = p.weapons[slotIndex];
    if (!slot) return false;
    const next = nextQuality(slot.quality);
    const cost = TINKER_COST[slot.quality];
    if (!next || !Number.isFinite(cost) || p.bits < cost) return false;
    p.bits -= cost;
    slot.quality = next;
    this.recomputeStats(p);
    return true;
  }

  /** Drop-time rolls: quality odds improve with the wave; variants are rare spice. */
  rollWeaponInstance(itemId: string): WeaponInstance {
    const wave = this.state.wave;
    const weights: [Quality, number][] = [
      ['rusty', Math.max(0, 12 - wave)],
      ['standard', 50],
      ['fine', 12 + wave * 0.8],
      ['superb', 4 + wave * 0.5],
      ['masterwork', 1 + wave * 0.25],
    ];
    const total = weights.reduce((a, [, w]) => a + w, 0);
    let roll = this.rng.variants.next() * total;
    let quality: Quality = 'standard';
    for (const [q, w] of weights) {
      roll -= w;
      if (roll <= 0) {
        quality = q;
        break;
      }
    }
    const v = this.rng.variants.next();
    const variant: VariantKind = v < 0.03 ? 'corrupted' : v < 0.07 ? 'cursed' : v < 0.09 ? 'relic' : null;
    const holo = this.rng.variants.chance(0.015);
    return { itemId, quality, variant, holo, seedTag: this.rng.variants.int(0, 1_000_000) };
  }

  private isPassiveAvailable(id: string): boolean {
    const def = this.registry.passives.get(id);
    if (!def) return false;
    return !def.unlockDeed || this.unlockedItems.has(id);
  }

  /** Chest pool: weapon instances AND passives, filtered per owner. */
  rollChestChoices(playerIndex: number, count = 3): ChestOffer[] {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const held = new Set(p.weapons.map((w) => w.itemId));
    const pool = [
      ...[...this.registry.weapons.keys()].filter(
        (id) => !held.has(id) && this.isItemAvailable(id) && this.classCanUse(p.classId, id),
      ),
      ...[...this.registry.passives.keys()].filter(
        (id) => !p.passives.includes(id) && this.isPassiveAvailable(id),
      ),
    ];
    const out: ChestOffer[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = this.rng.drops.int(0, pool.length - 1);
      const id = pool[idx]!;
      pool.splice(idx, 1);
      out.push(
        this.registry.passives.has(id)
          ? { kind: 'passive', id }
          : { kind: 'weapon', inst: this.rollWeaponInstance(id) },
      );
    }
    return out;
  }

  /** True when the Wandering Peddler visits this intermission (waves 3/6/9 of each act). */
  peddlerVisiting(): boolean {
    const waveInAct = ((this.state.wave - 1) % 10) + 1;
    return this.registry.balance.peddler.visitWaves.includes(waveInAct);
  }

  /** Roll the Peddler's stock for one player: filtered items + the Wax Snack. */
  rollPeddlerStock(playerIndex: number): PeddlerOffer[] {
    const bal = this.registry.balance.peddler;
    const price = bal.itemPriceBase + bal.itemPricePerAct * (this.state.act - 1);
    const items = this.rollChestChoices(playerIndex, bal.stockSize);
    const out: PeddlerOffer[] = items.map((o) =>
      o.kind === 'passive' ? { kind: 'passive', id: o.id, price } : { kind: 'weapon', inst: o.inst, price },
    );
    out.push({ kind: 'snack', price: bal.snackPrice });
    return out;
  }

  /** Deduct gold from ONE player (gold mirrors on earn; spending is personal). */
  spendGold(playerIndex: number, amount: number): boolean {
    const p = this.state.players[playerIndex];
    if (!p || p.gold < amount) return false;
    p.gold -= amount;
    return true;
  }

  /** Wax Snack: heal to full on the spot. */
  eatSnack(playerIndex: number): void {
    const p = this.state.players[playerIndex];
    if (!p) return;
    this.healPlayer(p, Math.max(0, stat(p.stats, 'maxHp') - p.hp), 'snack');
  }

  /** A feat is pickable when it has no unlock deed or the account has earned it. */
  featAvailable(id: string): boolean {
    const f = this.registry.feats.get(id);
    if (!f) return false;
    return !f.unlockDeed || this.unlockedFeats.has(id);
  }

  /** 1-of-4 feat offer from the unlocked pool (design 06). */
  rollFeatChoices(playerIndex: number, count = 4): string[] {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const pool = [...this.registry.feats.keys()].filter(
      (id) => !p.feats.includes(id) && this.featAvailable(id),
    );
    const out: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = this.rng.drops.int(0, pool.length - 1);
      out.push(pool[idx]!);
      pool.splice(idx, 1);
    }
    return out;
  }

  applyFeat(playerIndex: number, featId: string): void {
    const p = this.state.players[playerIndex];
    const def = this.registry.feats.get(featId);
    if (!p || !def || p.feats.includes(featId) || p.pendingFeats <= 0) return;
    p.feats.push(featId);
    p.pendingFeats--;
    this.recomputeStats(p);
    // Bee Yourself: the companion arrives immediately, full of belief
    if (def.mods.includes('beeFriend')) this.spawnPet('bee', p.index, featId, p.x, p.y);
  }

  /** Roll distinct weapon choices: unlocked, class-legal, not already held. */
  rollWeaponChoices(playerIndex: number, count = 3): string[] {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const held = new Set(p.weapons.map((w) => w.itemId));
    const pool = [...this.registry.weapons.keys()].filter(
      (id) => !held.has(id) && this.isItemAvailable(id) && this.classCanUse(p.classId, id),
    );
    const out: string[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = this.rng.drops.int(0, pool.length - 1);
      out.push(pool[idx]!);
      pool.splice(idx, 1);
    }
    return out;
  }

  replaceWeapon(playerIndex: number, slotIndex: number, weapon: string | WeaponInstance): void {
    const p = this.state.players[playerIndex];
    if (!p) throw new Error(`No player ${playerIndex}`);
    const inst = typeof weapon === 'string' ? standardInstance(weapon) : weapon;
    if (!this.registry.weapons.has(inst.itemId)) throw new Error(`Unknown weapon "${inst.itemId}"`);
    if (slotIndex < 0 || slotIndex >= p.weapons.length) throw new Error(`Bad slot ${slotIndex}`);
    // Capacity must still fit after the swap (e.g. 1H → 2H on a full loadout)
    const newCost = getWeapon(this.registry, inst.itemId).hands;
    const oldCost = getWeapon(this.registry, p.weapons[slotIndex]!.itemId).hands;
    if (this.handPointsUsed(p) - oldCost + newCost > this.handPointsMax(p)) return;
    p.weapons[slotIndex] = { ...inst, cooldownLeft: 0 };
    this.recomputeStats(p);
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

    this.tickRevives(inputs, dt);

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
    this.tickPets(dt);
    this.tickProjectiles(dt);
    this.tickPools(dt);
    this.tickPickups(dt);
    this.tickCombo(dt);

    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i]!;
      if (!e.alive) {
        this.enemyByInstance.delete(e.instance);
        s.enemies[i] = s.enemies[s.enemies.length - 1]!;
        s.enemies.pop();
      }
    }

    // Wave clear detection (only reachable while someone is alive)
    if (s.phase === 'fighting' && s.spawning.done && s.enemies.length === 0) {
      s.phase = 'cleared';
      this.eventsThisTick.push({ type: 'waveCleared', wave: s.wave });
      // Deed hook: someone finished the wave dangerously low (checked pre-revive)
      if (s.players.some((p) => p.alive && p.hp / (stat(p.stats, 'maxHp') || 1) < 0.25)) {
        this.eventsThisTick.push({ type: 'lowHpWaveClear' });
      }
      // A breather heart per player at every wave end
      for (const p of s.players) {
        for (let i = 0; i < this.registry.balance.drops.waveClearHearts; i++) {
          this.dropPickup(p.x + 1, p.y + 1, 'heart', this.registry.balance.drops.heartHeal);
        }
      }
      // Co-op rule: snuffed players auto-revive at wave end
      for (const p of s.players) {
        if (!p.alive) {
          p.alive = true;
          p.hp = Math.max(1, Math.round(stat(p.stats, 'maxHp') * 0.4));
        }
        p.revivedThisWave = false;
        p.reviveProgress = 0;
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
    const regen = stat(p.stats, 'hpRegen');
    if (regen > 0) {
      const cls = this.classDef(p.classId);
      const cap = stat(p.stats, 'maxHp') * (cls.mechanic === 'redline' ? 0.8 : 1);
      p.hp = Math.min(cap, p.hp + regen * dt);
    }

    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.hypot(mx, my);
    // Static Charge: patience banks a stun
    if (mag < 0.1 && p.dashTimer <= 0) {
      p.stillTimer += dt;
      if (p.stillTimer >= 1 && this.hasMod(p, 'staticCharge')) p.staticReady = true;
    } else {
      p.stillTimer = 0;
    }
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
      p.dashTouched.clear();
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

    // Dash-through detection (Rogue-style deeds + future class mechanics)
    if (p.dashTimer > 0) {
      for (const e of this.state.enemies) {
        if (!e.alive || p.dashTouched.has(e.instance)) continue;
        const def = getEnemy(this.registry, e.defId);
        if (Math.hypot(e.x - p.x, e.y - p.y) <= def.radius + r) {
          p.dashTouched.add(e.instance);
          p.guaranteedCrit = true; // backspin fuel (only the mechanic consumes it)
          this.eventsThisTick.push({ type: 'dashThroughEnemy', player: p.index, enemy: e.instance });
        }
      }
    }
  }

  /** Hold Interact near a snuffed teammate's wisp to relight them (once per wave). */
  private tickRevives(inputs: readonly InputFrame[], dt: number): void {
    const coop = this.registry.balance.coop;
    for (const down of this.state.players) {
      if (down.alive || down.revivedThisWave) continue;
      let helper: PlayerState | null = null;
      for (const p of this.state.players) {
        if (!p.alive || p.index === down.index) continue;
        const input = inputs[p.index];
        if (!input?.interact) continue;
        if (Math.hypot(p.x - down.x, p.y - down.y) <= coop.reviveRange) {
          helper = p;
          break;
        }
      }
      if (helper) {
        down.reviveProgress += dt;
        if (down.reviveProgress >= coop.reviveHoldSeconds) {
          down.alive = true;
          down.hp = Math.max(1, Math.round(stat(down.stats, 'maxHp') * coop.reviveHpFrac));
          down.revivedThisWave = true;
          down.reviveProgress = 0;
          this.eventsThisTick.push({ type: 'playerRevived', player: down.index, by: helper.index });
        }
      } else {
        down.reviveProgress = Math.max(0, down.reviveProgress - dt * 2);
      }
    }
  }

  private tickWeapons(p: PlayerState, input: InputFrame, dt: number): void {
    const aiming = Math.hypot(input.aimX, input.aimY) > 0.25;
    for (const slot of p.weapons) {
      if (slot.cooldownLeft > 0) slot.cooldownLeft = Math.max(0, slot.cooldownLeft - dt);
      if (slot.cooldownLeft > 0) continue;
      const weapon = resolveWeapon(this.registry, slot);
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

  private fireWeapon(p: PlayerState, weapon: ResolvedWeapon, dir: number): void {
    if (weapon.delivery.type === 'meleeArc') {
      const reach = weapon.delivery.reach * (1 + stat(p.stats, 'area'));
      const halfArc = ((weapon.delivery.arcDeg / 2) * Math.PI) / 180;
      const hitId = this.tracker.newHitId();
      const candidates = this.spatial.query(p.x, p.y, reach + 1, this.spatialScratch);
      for (const c of candidates) {
        const enemy = this.enemyByInstance.get(c.id);
        if (!enemy || !enemy.alive) continue;
        const def = getEnemy(this.registry, enemy.defId);
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach + def.radius) continue;
        let angleDiff = Math.abs(Math.atan2(dy, dx) - dir);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > halfArc) continue;
        this.weaponHitEnemy(enemy, p, weapon, 'melee', hitId);
      }
    } else {
      const d = weapon.delivery;
      const spread = (d.spreadDeg * Math.PI) / 180;
      for (let i = 0; i < d.count; i++) {
        const offset = d.count > 1 ? (i / (d.count - 1) - 0.5) * spread : 0;
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
        proj.enemyDamage = 0;
        proj.pierceLeft = d.pierce;
        proj.blastRadius = d.blastRadius * (1 + stat(p.stats, 'area'));
        proj.poolRadius = 0;
        proj.poolDps = 0;
        proj.poolDuration = 0;
        proj.splitOnHit = this.hasMod(p, 'projectileSplit');
        proj.isChild = false;
        proj.bouncesLeft = this.hasMod(p, 'projectileBounce')
          ? 2 + (this.hasMod(p, 'conductor') ? 1 : 0)
          : 0;
        proj.damageScale = 1;
        proj.resolved = weapon;
        proj.hitIds.clear();
      }
    }
  }

  /** Weapon → enemy damage, including mechanics, lifesteal, and listed effects. */
  private weaponHitEnemy(
    enemy: EnemyState,
    p: PlayerState,
    weapon: ResolvedWeapon,
    deliveryTag: SourceChain['deliveryTag'],
    hitId: number,
    damageScale = 1,
  ): void {
    const cls = this.classDef(p.classId);
    const attack: AttackProfile = {
      kind: weapon.kind,
      types: weapon.types,
      multiplier: weapon.multiplier,
      flat: weapon.flat,
    };
    const source: SourceChain = {
      actor: { kind: 'player', index: p.index },
      itemId: weapon.id,
      grantedBy: null,
      deliveryTag,
      hitId,
    };
    // Backspin: dashing through an enemy guarantees the next hit crits
    let forceCrit = false;
    if (cls.mechanic === 'backspin' && p.guaranteedCrit) {
      forceCrit = true;
      p.guaranteedCrit = false;
    }
    // Redline: +1% damage per 1% missing HP
    let damageMult = damageScale;
    if (cls.mechanic === 'redline') {
      const maxHp = stat(p.stats, 'maxHp') || 1;
      damageMult *= 1 + Math.max(0, 1 - p.hp / maxHp);
    }
    // Coin-Operated Blade: spend the charge on this hit
    if (p.coinCharge > 0) {
      damageMult *= 1 + p.coinCharge;
      p.coinCharge = 0;
    }
    // Point Blank: ranged deliveries hit 40% harder inside 3 units
    if (
      deliveryTag !== 'melee' &&
      this.hasMod(p, 'pointBlank') &&
      Math.hypot(enemy.x - p.x, enemy.y - p.y) < 3
    ) {
      damageMult *= 1.4;
    }
    const dealt = this.applyDamageToEnemy(enemy, attack, p.stats, source, { forceCrit, damageMult });
    // Static Charge: a patiently banked stun discharges on this hit
    if (p.staticReady && enemy.alive && dealt > 0) {
      p.staticReady = false;
      p.stillTimer = 0;
      applyEffect(
        enemy.status,
        { kind: 'stun', duration: 0.8, chance: 1 },
        source,
        enemy.elite ? 'elite' : 'normal',
      );
    }
    // Storm Anklet: melee hits may arc lightning outward (self-attributing)
    if (weapon.kind === 'attack' && weapon.types.includes('melee') && dealt > 0) {
      for (const { trigger, itemId } of this.triggersFor(p, 'meleeHit')) {
        if (trigger.action === 'chainLightning' && this.rng.combat.chance(trigger.chance)) {
          this.chainLightning(
            enemy,
            p,
            itemId,
            (trigger.params.jumps ?? 2) + (this.hasMod(p, 'conductor') ? 1 : 0),
            dealt * (trigger.params.damageFrac ?? 0.5),
            trigger.params.radius ?? 4,
          );
        }
      }
    }
    // Lifesteal (physical for attacks, magical for spells)
    const frac = stat(p.stats, weapon.kind === 'attack' ? 'lifestealPhys' : 'lifestealMagic');
    if (frac > 0 && dealt > 0) this.healPlayer(p, dealt * frac, 'lifesteal');
    if (enemy.alive) {
      for (const eff of weapon.effects) {
        if (this.rng.combat.chance(eff.chance)) {
          // Frostfire: freezing a burning enemy detonates the remaining burn ×2
          if (
            eff.kind === 'freeze' &&
            enemy.status.burnPool > 0 &&
            this.hasMod(p, 'frostfire')
          ) {
            const boom = enemy.status.burnPool * 2;
            enemy.status.burnPool = 0;
            enemy.status.burnRate = 0;
            this.applyDamageToEnemy(
              enemy,
              { kind: 'spell', types: ['fire'], multiplier: 0, flat: [0, 0] },
              p.stats,
              { ...source, deliveryTag: 'explosion', grantedBy: 'frostfire' },
              { rawOverride: boom, noCrit: true },
            );
            if (!enemy.alive) continue;
          }
          applyEffect(enemy.status, eff, source, enemy.elite ? 'elite' : 'normal');
        }
      }
    }
  }

  /** Arc lightning between nearby enemies with full item attribution. */
  private chainLightning(
    from: EnemyState,
    p: PlayerState,
    itemId: string,
    jumps: number,
    damage: number,
    radius: number,
  ): void {
    const hit = new Set<number>([from.instance]);
    let current = from;
    for (let j = 0; j < jumps; j++) {
      let next: EnemyState | null = null;
      let bestDist = radius;
      for (const e of this.state.enemies) {
        if (!e.alive || hit.has(e.instance)) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < bestDist) {
          bestDist = d;
          next = e;
        }
      }
      if (!next) break;
      hit.add(next.instance);
      this.applyDamageToEnemy(
        next,
        { kind: 'spell', types: ['lightning'], multiplier: 0, flat: [0, 0], noCrit: true },
        null,
        {
          actor: { kind: 'player', index: p.index },
          itemId,
          grantedBy: 'chain',
          deliveryTag: 'chain',
          hitId: this.tracker.newHitId(),
        },
        { rawOverride: Math.max(1, Math.round(damage)), noCrit: true },
      );
      current = next;
    }
  }

  /** THE enemy damage entry point — weapons, DoTs, and later triggers all land here. */
  applyDamageToEnemy(
    enemy: EnemyState,
    attack: AttackProfile,
    attackerStats: StatSheet | null,
    source: SourceChain,
    opts: { rawOverride?: number; noCrit?: boolean; forceCrit?: boolean; damageMult?: number } = {},
  ): number {
    if (!enemy.alive) return 0;
    const def = getEnemy(this.registry, enemy.defId);
    let raw: number;
    let crit = false;
    if (opts.rawOverride !== undefined) raw = opts.rawOverride;
    else {
      const rolled = rollAttack(
        { ...attack, noCrit: opts.noCrit || attack.noCrit },
        attackerStats ?? {},
        this.rng.combat,
        this.registry.balance,
      );
      raw = rolled.raw;
      crit = rolled.crit;
      if (opts.forceCrit && !crit) {
        const critDmg = stat(attackerStats ?? {}, 'critDamage') || this.registry.balance.player.critBase;
        raw *= 1 + Math.max(0, critDmg);
        crit = true;
      }
    }
    if (opts.damageMult) raw *= opts.damageMult;
    const enemyDefense: DefenseProfile = {
      armor: def.armor,
      dodge: 0,
      blockPhys: 0,
      blockSpell: 0,
      resistAll: 0,
      resists: {},
      flatReduction: 0,
    };
    const hit = resolveHit(raw, attack, enemyDefense, this.state.wave, this.rng.combat, this.registry.balance);
    const target: ActorRef = { kind: 'enemy', id: enemy.defId, instance: enemy.instance };
    const overkill = Math.max(0, hit.amount - enemy.hp);
    enemy.hp -= hit.amount;
    enemy.hitFlash = 0.12;
    this.eventsThisTick.push({
      type: 'damageNumber',
      x: enemy.x,
      y: enemy.y,
      amount: hit.amount,
      crit,
      onPlayer: false,
    });
    this.tracker.push({
      type: 'damage',
      tick: this.state.tick,
      wave: this.state.wave,
      source,
      target,
      amount: hit.amount,
      raw: Math.round(raw),
      types: attack.types,
      crit,
      mitigated: hit.mitigation,
      overkill,
    });
    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      this.tracker.push({
        type: 'kill',
        tick: this.state.tick,
        wave: this.state.wave,
        source,
        target,
        types: attack.types,
      });
      const byPlayer =
        source.actor.kind === 'player' ? source.actor.index : source.actor.kind === 'pet' ? source.actor.owner : -1;
      const killer = this.state.players[byPlayer];
      // Overflow: the wasted part of the killing blow finds a new home
      if (overkill > 0 && killer && this.hasMod(killer, 'overflow') && source.itemId !== 'overflow') {
        const next = this.nearestEnemy(enemy.x, enemy.y, 4);
        if (next) {
          this.applyDamageToEnemy(
            next,
            { kind: attack.kind, types: attack.types, multiplier: 0, flat: [0, 0] },
            killer.stats,
            { ...source, itemId: 'overflow', grantedBy: source.itemId, deliveryTag: 'explosion' },
            { rawOverride: overkill, noCrit: true },
          );
        }
      }
      // Cinder: dying while burning shares the warmth with the neighborhood
      if (enemy.status.burnPool > 0 && killer && this.hasMod(killer, 'cinder')) {
        const boom = enemy.status.burnPool * 0.6;
        enemy.status.burnPool = 0;
        const hitId = this.tracker.newHitId();
        for (const other of this.state.enemies) {
          if (!other.alive || other === enemy) continue;
          if (Math.hypot(other.x - enemy.x, other.y - enemy.y) > 2.5) continue;
          this.applyDamageToEnemy(
            other,
            { kind: 'spell', types: ['fire'], multiplier: 0, flat: [0, 0] },
            killer.stats,
            { actor: { kind: 'player', index: killer.index }, itemId: 'cinder', grantedBy: source.itemId, deliveryTag: 'explosion', hitId },
            { rawOverride: boom, noCrit: true },
          );
        }
      }
      this.onEnemyKilled(enemy, def, byPlayer);
    }
    return hit.amount;
  }

  private onEnemyKilled(enemy: EnemyState, def: EnemyDef, byPlayer: number): void {
    this.eventsThisTick.push({ type: 'enemyKilled', defId: enemy.defId, instance: enemy.instance, byPlayer });

    // Kill triggers (Powder Keg Belt, Zombie Flute, ...)
    const killer = this.state.players[byPlayer];
    if (killer) {
      // Necromancer's Rise and Shine: kills may rejoin the fight, politely
      if (this.classDef(killer.classId).mechanic === 'riseAndShine' && this.rng.combat.chance(0.2)) {
        this.spawnPet('zombie', killer.index, killer.classId, enemy.x, enemy.y);
      }
      for (const { trigger, itemId } of this.triggersFor(killer, 'kill')) {
        if (!this.rng.combat.chance(trigger.chance)) continue;
        if (trigger.action === 'raiseZombie') {
          this.spawnPet('zombie', killer.index, itemId, enemy.x, enemy.y);
        } else if (trigger.action === 'firePool') {
          const pool = this.state.pools.find((pl) => !pl.active);
          if (pool) {
            pool.active = true;
            pool.x = enemy.x;
            pool.y = enemy.y;
            pool.radius = trigger.params.radius ?? 1.4;
            pool.dps = trigger.params.dps ?? 4;
            pool.duration = trigger.params.duration ?? 3;
            pool.tickIn = 0.25;
            pool.ownerDefId = '';
            pool.friendly = true;
            pool.ownerPlayer = killer.index;
            pool.itemId = itemId;
          }
        }
      }
    }
    const combo = this.state.combo;
    combo.count++;
    combo.decay = this.registry.balance.combo.decaySeconds;
    if (combo.count > combo.best) combo.best = combo.count;
    if (combo.count % 5 === 0) this.eventsThisTick.push({ type: 'comboTier', count: combo.count });

    // Splitter: children rise where the parent popped
    if (def.archetype === 'splitter' && def.splitInto && def.splitCount) {
      for (let i = 0; i < def.splitCount; i++) {
        const a = (i / def.splitCount) * Math.PI * 2 + this.rng.waves.next();
        this.spawnEnemy(def.splitInto, enemy.x + Math.cos(a) * 0.5, enemy.y + Math.sin(a) * 0.5, false);
      }
    }

    const bal = this.registry.balance;
    const goldEvil =
      1 +
      bal.evil.heartReward * this.evilCount('evilHeart') +
      bal.evil.bellowsGold * this.evilCount('evilBellows');
    const goldAmount = Math.round(this.rng.drops.int(def.gold[0], def.gold[1]) * goldEvil);
    for (let i = 0; i < goldAmount; i++) this.dropPickup(enemy.x, enemy.y, 'gold', 1);
    // Hearts: the meadow provides (personal heal for whoever grabs it)
    if (this.rng.drops.chance(bal.drops.heartChance)) {
      this.dropPickup(enemy.x, enemy.y, 'heart', bal.drops.heartHeal);
    }
    // Mimics telegraph their prize — and pay up honestly when defeated
    if (def.mimicDrop === 'chest') this.dropPickup(enemy.x, enemy.y, 'chest', 1);
    const comboMult = Math.min(
      this.registry.balance.combo.maxMult,
      1 + combo.count * this.registry.balance.combo.xpPerStack,
    );
    this.dropPickup(enemy.x, enemy.y, 'xp', Math.round(enemy.xp * comboMult));
    if (enemy.chestChance > 0 && this.rng.drops.chance(enemy.chestChance)) {
      this.dropPickup(enemy.x, enemy.y, 'chest', 1);
    }
  }

  private dropPickup(x: number, y: number, kind: PickupKind, amount: number): void {
    if (amount <= 0) return;
    // Magpie's Eye: any player may pocket ANY gold drop instantly (reacts to all
    // drops, per the brief — maximizing each player's items in co-op)
    if (kind === 'gold') {
      for (const p of this.state.players) {
        if (!p.alive) continue;
        for (const { trigger, itemId } of this.triggersFor(p, 'goldDrop')) {
          if (trigger.action === 'autoCollectGold' && this.rng.drops.chance(trigger.chance)) {
            this.collectGold(p, amount, itemId);
            return; // pocketed before it hit the ground
          }
        }
      }
    }
    for (const pk of this.state.pickups) {
      if (pk.active) continue;
      pk.active = true;
      pk.x = x + (this.rng.drops.next() - 0.5) * 0.9;
      pk.y = y + (this.rng.drops.next() - 0.5) * 0.9;
      pk.kind = kind;
      pk.amount = amount;
      return;
    }
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
          this.spawnEnemy(entry.defId, pos.x, pos.y, entry.elite);
        }
        entry.count = 0;
      } else allSpawned = false;
    }
    if (allSpawned) sp.done = true;
  }

  private tickEnemies(dt: number): void {
    const bal = this.registry.balance;
    // Buffer auras: collected once, applied as a speed multiplier to nearby enemies
    const auras: { x: number; y: number; r: number; mult: number }[] = [];
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const def = getEnemy(this.registry, e.defId);
      if (def.archetype === 'buffer' && def.auraRadius && def.auraSpeedMult) {
        auras.push({ x: e.x, y: e.y, r: def.auraRadius, mult: def.auraSpeedMult });
      }
    }
    const auraMult = (e: EnemyState): number => {
      let m = 1;
      for (const a of auras) {
        if (Math.hypot(e.x - a.x, e.y - a.y) <= a.r) m = Math.max(m, a.mult);
      }
      return m;
    };
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const def = getEnemy(this.registry, e.defId);
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      // Status DoT ticks + control
      for (const dot of tickStatus(e.status, dt)) {
        this.applyDamageToEnemy(
          e,
          {
            kind: 'spell',
            types: [dot.kind === 'burn' ? 'fire' : 'poison'],
            multiplier: 0,
            flat: [0, 0],
            noCrit: true,
          },
          null,
          { ...dot.source, grantedBy: dot.kind, deliveryTag: 'pool' },
          { rawOverride: dot.amount, noCrit: true },
        );
      }
      if (!e.alive) continue;
      if (isControlled(e.status)) continue; // stunned/frozen: no act, no move

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
      const statusMove = moveMult(e.status) * auraMult(e);

      // Boss state machine (phases by hp fraction)
      if (e.boss && def.bossPhases) {
        this.tickBoss(e, def, target, dx, dy, dist, statusMove, dt, bal);
        continue;
      }

      // Mimics play dead-chest until someone reaches for the latch — but their
      // patience runs out after ~25s so a cautious party can't stall the wave.
      if (def.archetype === 'mimic') {
        if (!e.mimicAwake) {
          e.wanderTimer += dt; // repurposed as a patience clock while asleep
          if (dist <= (def.mimicTriggerRange ?? 2.5) || e.wanderTimer > 25) {
            e.mimicAwake = true;
            this.eventsThisTick.push({ type: 'chargeTelegraph', instance: e.instance });
          }
          continue; // perfectly still. definitely just a chest.
        }
        // awake: falls through to default chase behavior below
      }

      // Charger state machine
      if (def.archetype === 'charger') {
        const ch = e.charge;
        if (ch.phase === 'windup') {
          ch.timer -= dt;
          if (ch.timer <= 0) {
            ch.phase = 'charging';
            ch.timer = def.chargeDuration!;
          }
          continue; // rooted while winding up (telegraph)
        }
        if (ch.phase === 'charging') {
          ch.timer -= dt;
          const speed = e.moveSpeed * def.chargeSpeedMult! * statusMove;
          e.x += ch.dirX * speed * dt;
          e.y += ch.dirY * speed * dt;
          this.clampEnemy(e, def);
          // Contact during charge hits harder
          if (dist <= def.radius + bal.player.radius + 0.2 && e.attackCooldown <= 0) {
            e.attackCooldown = def.attackCooldown;
            this.damagePlayer(target, e.damage * 1.5, def, 'contact');
          }
          if (ch.timer <= 0) {
            ch.phase = 'recover';
            ch.timer = def.chargeCooldown!;
          }
          continue;
        }
        if (ch.phase === 'recover') {
          ch.timer -= dt;
          if (ch.timer <= 0) ch.phase = 'none';
        } else if (ch.phase === 'none' && dist <= def.chargeTriggerRange! && dist > 1.2) {
          ch.phase = 'windup';
          ch.timer = def.chargeWindup!;
          ch.dirX = dx / dist;
          ch.dirY = dy / dist;
          this.eventsThisTick.push({ type: 'chargeTelegraph', instance: e.instance });
          continue;
        }
      }

      let moveX = dx / dist;
      let moveY = dy / dist;
      if (def.archetype === 'lobber') {
        const range = def.range ?? 8;
        if (dist < range * 0.55) {
          moveX = -moveX;
          moveY = -moveY;
        } else if (dist < range) {
          const px = -moveY;
          moveY = moveX * 0.6;
          moveX = px * 0.6;
        }
        if (dist <= range && e.attackCooldown <= 0) {
          e.attackCooldown = def.attackCooldown;
          const proj = this.allocProjectile();
          if (proj) {
            const speed = def.projectileSpeed ?? 6;
            proj.active = true;
            proj.x = e.x;
            proj.y = e.y;
            proj.vx = (dx / dist) * speed;
            proj.vy = (dy / dist) * speed;
            proj.radius = 0.3;
            proj.traveled = 0;
            proj.range = dist; // arcs to the target's feet, then splashes into a pool
            proj.fromPlayer = -1;
            proj.itemId = null;
            proj.enemyDefId = e.defId;
            proj.enemyDamage = e.damage;
            proj.pierceLeft = 0;
            proj.blastRadius = 0;
            proj.poolRadius = def.poolRadius ?? 1.2;
            proj.poolDps = (def.poolDps ?? 2) * (e.damage / def.damage);
            proj.poolDuration = def.poolDuration ?? 3;
            proj.splitOnHit = false;
            proj.isChild = false;
            proj.bouncesLeft = 0;
            proj.damageScale = 1;
            proj.resolved = null;
            proj.hitIds.clear();
          }
        }
      } else if (def.archetype === 'summoner') {
        // Kite at mid range, periodically call reinforcements
        const range = 7;
        if (dist < range * 0.6) {
          moveX = -moveX;
          moveY = -moveY;
        }
        e.summonTimer -= dt;
        if (e.summonTimer <= 0 && def.summonId && def.summonCount) {
          const cap = def.summonCap ?? 6;
          const minions = this.state.enemies.filter((x) => x.alive && x.defId === def.summonId).length;
          if (minions < cap) {
            for (let i = 0; i < def.summonCount; i++) {
              const a = this.rng.waves.next() * Math.PI * 2;
              this.spawnEnemy(def.summonId, e.x + Math.cos(a) * 1.5, e.y + Math.sin(a) * 1.5, false);
            }
          }
          e.summonTimer = def.summonCooldown ?? 4;
        }
      } else if (def.archetype === 'buffer') {
        // Hangs back near the fight, hasting friends (aura applied above)
        const range = 6;
        if (dist < range * 0.7) {
          moveX = -moveX;
          moveY = -moveY;
        }
      } else if (def.archetype === 'skitterer') {
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
            proj.enemyDamage = e.damage;
            proj.pierceLeft = 0;
            proj.blastRadius = 0;
            proj.poolRadius = 0;
            proj.poolDps = 0;
            proj.poolDuration = 0;
            proj.splitOnHit = false;
            proj.isChild = false;
            proj.bouncesLeft = 0;
            proj.damageScale = 1;
            proj.resolved = null;
            proj.hitIds.clear();
          }
        }
      }

      e.x += moveX * e.moveSpeed * statusMove * dt;
      e.y += moveY * e.moveSpeed * statusMove * dt;
      this.clampEnemy(e, def);

      const touchDist = def.radius + bal.player.radius;
      const noContact = def.archetype === 'shooter' || def.archetype === 'lobber';
      if (dist <= touchDist + 0.1 && e.attackCooldown <= 0 && !noContact) {
        e.attackCooldown = def.attackCooldown;
        this.damagePlayer(target, e.damage, def, 'contact');
      }
    }
  }

  private tickBoss(
    e: EnemyState,
    def: EnemyDef,
    target: PlayerState,
    dx: number,
    dy: number,
    dist: number,
    statusMove: number,
    dt: number,
    bal: Registry['balance'],
  ): void {
    const b = e.boss!;
    const phases = def.bossPhases!;
    const hpFrac = e.hp / e.maxHp;
    const idx = Math.max(0, phases.findIndex((ph) => hpFrac > ph.until));
    const phaseIdx = idx === -1 ? phases.length - 1 : idx;
    if (phaseIdx !== b.phaseIdx) {
      b.phaseIdx = phaseIdx;
      b.stage = 'idle';
      b.cooldown = 1.2; // breather on phase change
      this.eventsThisTick.push({ type: 'bossPhase', instance: e.instance, phase: phaseIdx });
    }
    const phase = phases[b.phaseIdx]!;

    const contact = () => {
      const touch = def.radius + bal.player.radius + 0.15;
      if (dist <= touch && e.attackCooldown <= 0) {
        e.attackCooldown = def.attackCooldown;
        this.damagePlayer(target, e.damage, def, 'contact');
      }
    };

    if (b.stage === 'windup') {
      b.stageTimer -= dt;
      if (b.stageTimer <= 0) {
        if (phase.mode === 'hop') {
          b.stage = 'air';
          b.stageTimer = 0.45;
          b.fromX = e.x;
          b.fromY = e.y;
        } else if (phase.mode === 'volley') {
          // Ring burst + aimed spread
          const fire = (angle: number) => {
            const proj = this.allocProjectile();
            if (!proj) return;
            proj.active = true;
            proj.x = e.x;
            proj.y = e.y;
            proj.vx = Math.cos(angle) * 7;
            proj.vy = Math.sin(angle) * 7;
            proj.radius = 0.3;
            proj.traveled = 0;
            proj.range = 14;
            proj.fromPlayer = -1;
            proj.itemId = null;
            proj.enemyDefId = e.defId;
            proj.enemyDamage = e.damage * 0.6;
            proj.pierceLeft = 0;
            proj.blastRadius = 0;
            proj.poolRadius = 0;
            proj.poolDps = 0;
            proj.poolDuration = 0;
            proj.splitOnHit = false;
            proj.isChild = false;
            proj.bouncesLeft = 0;
            proj.damageScale = 1;
            proj.resolved = null;
            proj.hitIds.clear();
          };
          const ring = phase.volleyRing ?? 8;
          for (let i = 0; i < ring; i++) fire((i / ring) * Math.PI * 2);
          const aimed = phase.volleyAimed ?? 0;
          const at = Math.atan2(b.targetY - e.y, b.targetX - e.x);
          for (let i = 0; i < aimed; i++) fire(at + (i - (aimed - 1) / 2) * 0.18);
          b.stage = 'recover';
          b.stageTimer = 0.4;
        } else {
          // frenzy charge
          b.stage = 'air';
          b.stageTimer = 0.8;
          const d = Math.hypot(b.targetX - e.x, b.targetY - e.y) || 1;
          b.fromX = (b.targetX - e.x) / d; // reuse from* as direction for frenzy
          b.fromY = (b.targetY - e.y) / d;
        }
      }
      return; // rooted while telegraphing
    }

    if (b.stage === 'air') {
      b.stageTimer -= dt;
      if (phase.mode === 'hop') {
        // Interpolate leap; land at timer end
        const t = 1 - Math.max(0, b.stageTimer) / 0.45;
        e.x = b.fromX + (b.targetX - b.fromX) * t;
        e.y = b.fromY + (b.targetY - b.fromY) * t;
        if (b.stageTimer <= 0) {
          // Land: shockwave + radial spores
          for (const p of this.state.players) {
            if (!p.alive) continue;
            if (Math.hypot(p.x - e.x, p.y - e.y) <= 3.0) {
              this.damagePlayer(p, e.damage * 1.3, def, 'explosion');
            }
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const proj = this.allocProjectile();
            if (!proj) break;
            proj.active = true;
            proj.x = e.x;
            proj.y = e.y;
            proj.vx = Math.cos(a) * 6;
            proj.vy = Math.sin(a) * 6;
            proj.radius = 0.28;
            proj.traveled = 0;
            proj.range = 6;
            proj.fromPlayer = -1;
            proj.itemId = null;
            proj.enemyDefId = e.defId;
            proj.enemyDamage = e.damage * 0.6;
            proj.pierceLeft = 0;
            proj.blastRadius = 0;
            proj.poolRadius = 0;
            proj.poolDps = 0;
            proj.poolDuration = 0;
            proj.splitOnHit = false;
            proj.isChild = false;
            proj.bouncesLeft = 0;
            proj.damageScale = 1;
            proj.resolved = null;
            proj.hitIds.clear();
          }
          b.stage = 'recover';
          b.stageTimer = 0.5;
        }
      } else {
        // frenzy: fast charge along stored direction
        const speed = e.moveSpeed * 3.2 * statusMove;
        e.x += b.fromX * speed * dt;
        e.y += b.fromY * speed * dt;
        this.clampEnemy(e, def);
        contact();
        if (b.stageTimer <= 0) {
          b.stage = 'recover';
          b.stageTimer = 0.35;
        }
      }
      return;
    }

    if (b.stage === 'recover') {
      b.stageTimer -= dt;
      if (b.stageTimer <= 0) {
        b.stage = 'idle';
        b.cooldown = phase.cooldown;
      }
      return;
    }

    // idle: shuffle toward the player, use the phase move when ready
    b.cooldown -= dt;
    const speed = e.moveSpeed * statusMove * (phase.mode === 'summon' ? 0.7 : 1);
    e.x += (dx / dist) * speed * dt;
    e.y += (dy / dist) * speed * dt;
    this.clampEnemy(e, def);
    contact();

    if (b.cooldown <= 0) {
      if (phase.mode === 'hop' || phase.mode === 'frenzy' || phase.mode === 'volley') {
        b.stage = 'windup';
        b.stageTimer = phase.mode === 'hop' ? 0.9 : phase.mode === 'volley' ? 0.5 : 0.4;
        b.targetX = target.x;
        b.targetY = target.y;
        this.eventsThisTick.push({ type: 'chargeTelegraph', instance: e.instance });
      } else if (phase.mode === 'summon' && phase.summonId && phase.summonCount) {
        const cap = phase.summonCap ?? 10;
        const minions = this.state.enemies.filter((x) => x.alive && x.defId === phase.summonId).length;
        if (minions < cap) {
          for (let i = 0; i < phase.summonCount; i++) {
            const a = this.rng.waves.next() * Math.PI * 2;
            this.spawnEnemy(phase.summonId, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2, false);
          }
        }
        b.cooldown = phase.cooldown;
      }
    }
  }

  private clampEnemy(e: EnemyState, def: EnemyDef): void {
    const a = this.state.arena;
    e.x = Math.min(a.width - def.radius, Math.max(def.radius, e.x));
    e.y = Math.min(a.height - def.radius, Math.max(def.radius, e.y));
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
    const hit = resolveHit(baseAmount, attack, p.defense, this.state.wave, this.rng.combat, this.registry.balance);
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
    // Second Wick: once per run, a fatal blow leaves a spark instead
    if (p.hp <= 0 && !p.usedSecondWick) {
      for (const { trigger } of this.triggersFor(p, 'fatalDamage')) {
        if (trigger.action === 'surviveFatal') {
          p.usedSecondWick = true;
          p.hp = Math.max(1, Math.round(stat(p.stats, 'maxHp') * (trigger.params.hpFrac ?? 0.1)));
          p.iframeTimer = Math.max(p.iframeTimer, 1);
          this.eventsThisTick.push({ type: 'secondWick', player: p.index });
          break;
        }
      }
    }
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
    // Post-hit invulnerability: damage arrives in beats, never as an instant melt
    p.iframeTimer = Math.max(p.iframeTimer, this.registry.balance.player.hitIframes);
    this.eventsThisTick.push({ type: 'playerHit', player: p.index, amount: hit.amount });
    this.eventsThisTick.push({
      type: 'damageNumber',
      x: p.x,
      y: p.y,
      amount: hit.amount,
      crit: false,
      onPlayer: true,
    });
    if (p.hp <= 0) {
      p.alive = false;
      p.hp = 0;
      this.eventsThisTick.push({ type: 'playerDown', player: p.index });
      if (this.state.players.every((pl) => !pl.alive)) {
        this.eventsThisTick.push({ type: 'runOver' });
      }
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
      // Homing Instinct: player shots curve gently toward the nearest enemy
      if (pr.fromPlayer >= 0) {
        const owner = this.state.players[pr.fromPlayer];
        if (owner && this.hasMod(owner, 'homing')) {
          const targetE = this.nearestEnemy(pr.x, pr.y, 6);
          if (targetE) {
            const speed = Math.hypot(pr.vx, pr.vy) || 1;
            const want = Math.atan2(targetE.y - pr.y, targetE.x - pr.x);
            const cur = Math.atan2(pr.vy, pr.vx);
            let diff = want - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turn = Math.max(-3 * dt, Math.min(3 * dt, diff)); // rad/s cap
            pr.vx = Math.cos(cur + turn) * speed;
            pr.vy = Math.sin(cur + turn) * speed;
          }
        }
      }
      const step = Math.hypot(pr.vx, pr.vy) * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.traveled += step;
      const a = this.state.arena;
      // Bouncy Castle Writ: reflect off arena walls instead of fizzling
      if (pr.bouncesLeft > 0 && (pr.x < 0 || pr.x > a.width || pr.y < 0 || pr.y > a.height)) {
        if (pr.x < 0 || pr.x > a.width) pr.vx = -pr.vx;
        if (pr.y < 0 || pr.y > a.height) pr.vy = -pr.vy;
        pr.x = Math.min(a.width, Math.max(0, pr.x));
        pr.y = Math.min(a.height, Math.max(0, pr.y));
        pr.bouncesLeft--;
        pr.traveled = Math.max(0, pr.traveled - pr.range * 0.4); // bounces extend reach a bit
      }
      if (pr.traveled >= pr.range || pr.x < 0 || pr.y < 0 || pr.x > a.width || pr.y > a.height) {
        if (pr.poolRadius > 0) this.spawnPool(pr);
        pr.active = false;
        continue;
      }
      if (pr.fromPlayer >= 0) {
        const candidates = this.spatial.query(pr.x, pr.y, pr.radius + 1, this.spatialScratch);
        for (const c of candidates) {
          if (pr.hitIds.has(c.id)) continue;
          const enemy = this.enemyByInstance.get(c.id);
          if (!enemy || !enemy.alive) continue;
          const def = getEnemy(this.registry, enemy.defId);
          if (Math.hypot(enemy.x - pr.x, enemy.y - pr.y) > def.radius + pr.radius) continue;
          const p = this.state.players[pr.fromPlayer]!;
          const weapon = pr.resolved;
          if (weapon) {
            if (pr.blastRadius > 0) {
              // Explode: one hitId shared by every enemy in the blast (multikill deeds)
              const hitId = this.tracker.newHitId();
              const inBlast = this.spatial.query(pr.x, pr.y, pr.blastRadius + 1, this.spatialScratch);
              for (const bc of inBlast) {
                const be = this.enemyByInstance.get(bc.id);
                if (!be || !be.alive) continue;
                const bdef = getEnemy(this.registry, be.defId);
                if (Math.hypot(be.x - pr.x, be.y - pr.y) > pr.blastRadius + bdef.radius) continue;
                this.weaponHitEnemy(be, p, weapon, 'explosion', hitId, pr.damageScale);
                pr.hitIds.add(bc.id);
              }
            } else {
              this.weaponHitEnemy(enemy, p, weapon, 'projectile', this.tracker.newHitId(), pr.damageScale);
              pr.hitIds.add(c.id);
              // Splitter Prism: fork into two softer children on first impact
              if (pr.splitOnHit && !pr.isChild) {
                const baseAngle = Math.atan2(pr.vy, pr.vx);
                const speed = Math.hypot(pr.vx, pr.vy);
                for (const off of [-0.6, 0.6]) {
                  const child = this.allocProjectile();
                  if (!child) break;
                  child.active = true;
                  child.x = pr.x;
                  child.y = pr.y;
                  child.vx = Math.cos(baseAngle + off) * speed;
                  child.vy = Math.sin(baseAngle + off) * speed;
                  child.radius = pr.radius;
                  child.traveled = 0;
                  child.range = pr.range * 0.5;
                  child.fromPlayer = pr.fromPlayer;
                  child.itemId = pr.itemId;
                  child.enemyDefId = null;
                  child.enemyDamage = 0;
                  child.pierceLeft = 0;
                  child.blastRadius = 0;
                  child.poolRadius = 0;
                  child.poolDps = 0;
                  child.poolDuration = 0;
                  child.splitOnHit = false;
                  child.isChild = true;
                  child.bouncesLeft = 0;
                  child.damageScale = pr.damageScale * 0.75;
                  child.resolved = pr.resolved;
                  child.hitIds.clear();
                  child.hitIds.add(c.id); // don't instantly re-hit the same enemy
                }
              }
            }
          }
          if (pr.pierceLeft > 0 && pr.blastRadius === 0) pr.pierceLeft--;
          else {
            pr.active = false;
            break;
          }
        }
      } else {
        for (const p of this.state.players) {
          if (!p.alive) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) > bal.player.radius + pr.radius) continue;
          const def = pr.enemyDefId ? getEnemy(this.registry, pr.enemyDefId) : null;
          if (def) this.damagePlayer(p, pr.enemyDamage || def.damage, def, 'projectile');
          if (pr.poolRadius > 0) this.spawnPool(pr);
          pr.active = false;
          break;
        }
      }
    }
  }

  private spawnPool(pr: ProjectileState): void {
    const pool = this.state.pools.find((p) => !p.active);
    if (!pool) return;
    pool.active = true;
    pool.x = pr.x;
    pool.y = pr.y;
    pool.radius = pr.poolRadius;
    pool.dps = pr.poolDps;
    pool.duration = pr.poolDuration;
    pool.tickIn = 0.25;
    pool.ownerDefId = pr.enemyDefId ?? '';
    pool.friendly = false;
    pool.ownerPlayer = -1;
    pool.itemId = null;
  }

  private tickPools(dt: number): void {
    for (const pool of this.state.pools) {
      if (!pool.active) continue;
      pool.duration -= dt;
      if (pool.duration <= 0) {
        pool.active = false;
        continue;
      }
      pool.tickIn -= dt;
      if (pool.tickIn <= 0) {
        pool.tickIn += 0.5;
        if (pool.friendly) {
          // Player-owned fire pools burn enemies standing in them
          const amount = Math.max(1, Math.round(pool.dps * 0.5));
          for (const e of [...this.state.enemies]) {
            if (!e.alive) continue;
            const def = getEnemy(this.registry, e.defId);
            if (Math.hypot(e.x - pool.x, e.y - pool.y) <= pool.radius + def.radius) {
              this.applyDamageToEnemy(
                e,
                { kind: 'spell', types: ['fire'], multiplier: 0, flat: [0, 0], noCrit: true },
                null,
                {
                  actor: { kind: 'player', index: pool.ownerPlayer },
                  itemId: pool.itemId,
                  grantedBy: null,
                  deliveryTag: 'pool',
                  hitId: this.tracker.newHitId(),
                },
                { rawOverride: amount, noCrit: true },
              );
            }
          }
        } else {
          const def = pool.ownerDefId ? this.registry.enemies.get(pool.ownerDefId) : null;
          if (!def) continue;
          for (const p of this.state.players) {
            if (!p.alive) continue;
            if (Math.hypot(p.x - pool.x, p.y - pool.y) <= pool.radius) {
              this.damagePlayer(p, Math.max(1, Math.round(pool.dps * 0.5)), def, 'pool');
            }
          }
        }
      }
    }
  }

  /** Gold enters the party: mirrored to everyone (with personal goldGain), and the
   *  collector's goldCollect triggers fire (Coin-Operated Blade). */
  private collectGold(collector: PlayerState, amount: number, viaItemId: string | null): void {
    for (const other of this.state.players) {
      other.gold += Math.max(1, Math.round(amount * (1 + stat(other.stats, 'goldGain'))));
    }
    for (const { trigger } of this.triggersFor(collector, 'goldCollect')) {
      if (trigger.action === 'coinCharge') {
        const cap = trigger.params.cap ?? 0.5;
        collector.coinCharge = Math.min(cap, collector.coinCharge + (trigger.params.perCoin ?? 0.01) * amount);
      }
    }
    this.tracker.push({
      type: 'pickup',
      tick: this.state.tick,
      wave: this.state.wave,
      player: collector.index,
      what: 'gold',
      amount,
    });
    void viaItemId; // attribution surfaces in the meter drill-down later
  }

  private tickPickups(dt: number): void {
    const MAGNET_SPEED = 9;
    const COLLECT_DIST = 0.5;
    for (const pk of this.state.pickups) {
      if (!pk.active) continue;
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
          // Mirrored gold: every non-retired player receives it (snuffed included)
          this.collectGold(p, pk.amount, null);
        } else if (pk.kind === 'heart') {
          // Hearts keep pace with deep-run health pools: flat early, % later
          let scaled = Math.max(pk.amount, stat(p.stats, 'maxHp') * 0.15);
          if (this.hasMod(p, 'secondCourse')) scaled *= 1.25;
          this.healPlayer(p, scaled, 'heart');
        } else if (pk.kind === 'xp') {
          // Equal-share XP, normalized by party size (co-op levels stay ~flat vs solo)
          const share = Math.max(1, Math.round(pk.amount / this.state.players.length));
          for (const other of this.state.players) {
            this.grantXp(other, Math.max(1, Math.round(share * (1 + stat(other.stats, 'xpGain')))));
          }
          this.tracker.push({
            type: 'pickup',
            tick: this.state.tick,
            wave: this.state.wave,
            player: p.index,
            what: 'xp',
            amount: pk.amount,
          });
        } else {
          // Chests are dealt round-robin regardless of who touched them
          const owner = this.state.players[this.state.lootRotation % this.state.players.length]!;
          owner.pendingChests += pk.amount;
          this.state.lootRotation = (this.state.lootRotation + 1) % this.state.players.length;
        }
      }
    }
  }

  /** Public XP grant (used by sim policies and debug cheats). */
  grantXpTo(playerIndex: number, amount: number): void {
    const p = this.state.players[playerIndex];
    if (p) this.grantXp(p, amount);
  }

  private grantXp(p: PlayerState, amount: number): void {
    p.xp += amount;
    p.xpIntoLevel += amount;
    const bal = this.registry.balance.leveling;
    let threshold = bal.base + bal.perLevel * (p.level - 1);
    while (p.xpIntoLevel >= threshold) {
      p.xpIntoLevel -= threshold;
      p.level++;
      p.pendingBoons++;
      if (p.level % 3 === 0) p.pendingFeats++; // feats arrive every 3rd level
      // Class-granted item choices at scripted levels (bypass account locks)
      const cls = this.classDef(p.classId);
      for (const lu of cls.levelUpItems) {
        if (lu.level === p.level) p.pendingClassItems.push([...lu.options]);
      }
      this.eventsThisTick.push({ type: 'levelUp', player: p.index, level: p.level });
      threshold = bal.base + bal.perLevel * (p.level - 1);
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

  getEnemyByInstance(instance: number): EnemyState | undefined {
    return this.enemyByInstance.get(instance);
  }

  aliveEnemyCount(): number {
    return this.state.enemies.length;
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
      mix(p.level);
    }
    for (const e of this.state.enemies) {
      mix(e.x);
      mix(e.y);
      mix(e.hp);
    }
    return h >>> 0;
  }
}
