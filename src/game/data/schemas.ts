// Zod schemas for game data. Strict everywhere: unknown fields and unknown stat/
// capability names are load-time errors, never silent skips.

import { z } from 'zod';
import { DAMAGE_TYPES, STAT_IDS } from './stats';

export const StatIdSchema = z.enum(STAT_IDS);
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);

export const GrantSchema = z
  .object({
    stat: StatIdSchema,
    flat: z.number().optional(),
    pct: z.number().optional(), // +0.10 = +10%
    mult: z.number().optional(), // rare true multipliers
  })
  .strict()
  .refine((g) => g.flat !== undefined || g.pct !== undefined || g.mult !== undefined, {
    message: 'grant needs flat, pct, or mult',
  });

// Engine delivery vocabulary — sim.ts implements exactly these.
export const DeliverySchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('projectile'),
      speed: z.number().positive(),
      radius: z.number().positive().default(0.25), // projectile body
      blastRadius: z.number().nonnegative().default(0), // >0 → explosion-tagged
      range: z.number().positive().default(14),
      cooldown: z.number().positive(),
      count: z.number().int().min(1).default(1), // multishot
      spreadDeg: z.number().nonnegative().default(0),
      pierce: z.number().int().nonnegative().default(0),
      // impact pools (flasks): >0 radius leaves a damaging puddle where the shot lands
      poolRadius: z.number().nonnegative().default(0),
      poolDps: z.number().nonnegative().default(0),
      poolDuration: z.number().nonnegative().default(0),
      poolType: z.enum(['fire', 'poison']).default('fire'),
    })
    .strict(),
  z
    .object({
      type: z.literal('meleeArc'),
      reach: z.number().positive(), // units
      arcDeg: z.number().positive(), // cone width
      cooldown: z.number().positive(),
    })
    .strict(),
]);

export const EffectSchema = z
  .object({
    kind: z.enum(['burn', 'stun', 'slow', 'freeze', 'poison']),
    amount: z.number().optional(), // DoT total
    duration: z.number().optional(), // seconds
    magnitude: z.number().optional(), // slow strength etc.
    chance: z.number().min(0).max(1).default(1),
  })
  .strict();

// Passive triggers: event hooks the sim implements. Effects self-attribute
// (predecessor lesson: procs must show up in the meters under their item).
export const TriggerSchema = z
  .object({
    on: z.enum(['kill', 'goldDrop', 'fatalDamage', 'meleeHit', 'goldCollect']),
    chance: z.number().min(0).max(1).default(1),
    action: z.enum([
      'firePool',
      'autoCollectGold',
      'surviveFatal',
      'chainLightning',
      'coinCharge',
      'raiseZombie',
    ]),
    params: z.record(z.string(), z.number()).default({}),
  })
  .strict();

// Non-event behavior switches the engine implements by name (shared by passives + feats)
const ModEnum = z.enum([
  'projectileSplit',
  'projectileBounce',
  'boonChoices5',
  // Evil items: opt-in difficulty, party-wide, stack per copy
  'evilCandle',
  'evilHeart',
  'evilEye',
  'evilBellows',
  'evilDrum',
  'evilFist',
  // Feat mechanics
  'pointBlank', // +40% ranged damage within 3m
  'cinder', // enemies dying while burning explode (fire AoE)
  'frostfire', // freezing a burning enemy detonates remaining burn ×2
  'homing', // projectiles curve gently toward enemies
  'overflow', // overkill damage splashes to the nearest enemy
  'conductor', // chains and bounces jump one extra time
  'graveDividend', // expiring zombies drop 1 gold
  'beeFriend', // a tiny bee companion (granted on acquire)
  'secondCourse', // hearts and snacks heal 25% more
  'staticCharge', // standing still 1s: next hit stuns
]);

export const PassiveSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    category: z.literal('passive'),
    desc: z.string(), // shown on cards + codex
    tags: z.array(z.string()).default([]),
    grants: z.array(GrantSchema).default([]),
    triggers: z.array(TriggerSchema).default([]),
    mods: z.array(ModEnum).default([]),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
    unlockDeed: z.string().optional(),
  })
  .strict();

// Feats ARE items (design 06): passive-shaped, but live in a dedicated inventory,
// picked 1-of-4 every 3rd level, never dropped or salvaged.
export const FeatSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    category: z.literal('feat'),
    name: z.string(),
    desc: z.string(),
    tags: z.array(z.string()).default([]),
    grants: z.array(GrantSchema).default([]),
    triggers: z.array(TriggerSchema).default([]),
    mods: z.array(ModEnum).default([]),
    unlockDeed: z.string().optional(),
  })
  .strict();

export const WeaponSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    category: z.literal('weapon'),
    tags: z.array(z.string()),
    hands: z.number().int().min(1).max(2),
    kind: z.enum(['attack', 'spell']),
    delivery: DeliverySchema,
    damage: z
      .object({
        types: z.array(DamageTypeSchema).min(1),
        multiplier: z.number().positive(),
        flat: z.tuple([z.number(), z.number()]),
      })
      .strict(),
    grants: z.array(GrantSchema).default([]),
    effects: z.array(EffectSchema).default([]),
    rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
    unlockDeed: z.string().optional(), // absent = day-one pool
  })
  .strict();

export const EnemySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    archetype: z.enum([
      'chaser',
      'skitterer',
      'shooter',
      'charger',
      'splitter',
      'lobber',
      'summoner',
      'buffer',
      'mimic',
      'boss',
    ]),
    name: z.string().optional(), // display name (bosses/minibosses)
    radius: z.number().positive(),
    maxHp: z.number().positive(),
    damage: z.number().positive(), // contact or projectile damage
    damageTypes: z.array(DamageTypeSchema).min(1),
    moveSpeed: z.number().positive(), // units/s
    xp: z.number().nonnegative(),
    gold: z.tuple([z.number(), z.number()]),
    attackCooldown: z.number().positive().default(0.6),
    range: z.number().positive().optional(), // shooters
    projectileSpeed: z.number().positive().optional(),
    armor: z.number().nonnegative().default(0),
    // charger fields
    chargeWindup: z.number().positive().optional(), // telegraph seconds
    chargeSpeedMult: z.number().positive().optional(),
    chargeDuration: z.number().positive().optional(),
    chargeCooldown: z.number().positive().optional(),
    chargeTriggerRange: z.number().positive().optional(),
    // splitter fields
    splitInto: z.string().optional(),
    splitCount: z.number().int().positive().optional(),
    // lobber fields: arcs a projectile that leaves a damaging pool
    poolRadius: z.number().positive().optional(),
    poolDps: z.number().positive().optional(),
    poolDuration: z.number().positive().optional(),
    // summoner fields
    summonId: z.string().optional(),
    summonCount: z.number().int().positive().optional(),
    summonCap: z.number().int().positive().optional(),
    summonCooldown: z.number().positive().optional(),
    // buffer fields: haste aura for nearby enemies
    auraRadius: z.number().positive().optional(),
    auraSpeedMult: z.number().positive().optional(),
    // boss fields: phases activate as hpFrac drops; active = first with until < hpFrac
    bossPhases: z
      .array(
        z
          .object({
            mode: z.enum(['hop', 'summon', 'frenzy', 'volley']),
            until: z.number().min(0).max(1), // phase active while hpFrac > until
            cooldown: z.number().positive(),
            summonId: z.string().optional(),
            summonCount: z.number().int().positive().optional(),
            summonCap: z.number().int().positive().optional(),
            volleyRing: z.number().int().nonnegative().optional(), // projectiles in the ring
            volleyAimed: z.number().int().nonnegative().optional(), // aimed spread shots
          })
          .strict(),
      )
      .optional(),
    // mimic fields: disguised as a chest until approached; drop telegraphed by look
    mimicDrop: z.enum(['chest', 'gold']).optional(),
    mimicTriggerRange: z.number().positive().optional(),
    // drops
    chestChance: z.number().min(0).max(1).default(0),
  })
  .strict()
  .refine((e) => e.archetype !== 'boss' || (e.bossPhases && e.bossPhases.length > 0), {
    message: 'boss needs bossPhases',
  })
  .refine((e) => e.archetype !== 'splitter' || (e.splitInto && e.splitCount), {
    message: 'splitter needs splitInto + splitCount',
  })
  .refine(
    (e) =>
      e.archetype !== 'charger' ||
      (e.chargeWindup && e.chargeSpeedMult && e.chargeDuration && e.chargeCooldown && e.chargeTriggerRange),
    { message: 'charger needs chargeWindup/SpeedMult/Duration/Cooldown/TriggerRange' },
  );

export const WaveEntrySchema = z
  .object({
    atSecond: z.number().nonnegative(),
    defId: z.string(),
    count: z.number().int().positive(),
    elite: z.boolean().default(false),
  })
  .strict();

export const WaveSchema = z
  .object({
    wave: z.number().int().positive(),
    entries: z.array(WaveEntrySchema).min(1),
  })
  .strict();

export const ActWavesSchema = z
  .object({
    act: z.number().int().positive(),
    waves: z.array(WaveSchema).min(1),
  })
  .strict();

export const DeedMatchSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('killWithType'), type: DamageTypeSchema }).strict(),
  z.object({ event: z.literal('burnKill') }).strict(),
  z.object({ event: z.literal('explosionMultikill') }).strict(),
  z.object({ event: z.literal('damageOfType'), type: DamageTypeSchema }).strict(),
  z.object({ event: z.literal('magicDamage') }).strict(), // any magic school
  z.object({ event: z.literal('goldHeld') }).strict(),
  z.object({ event: z.literal('dashThrough') }).strict(),
  z.object({ event: z.literal('lifestealHealed') }).strict(),
  z.object({ event: z.literal('lowHpWaveClear') }).strict(),
  z.object({ event: z.literal('mimicKill') }).strict(),
  z.object({ event: z.literal('statusApplied'), kind: z.enum(['stun', 'freeze']) }).strict(),
  z.object({ event: z.literal('snuffed') }).strict(),
]);

export const ClassSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    blurb: z.string(),
    handPoints: z.number().int().min(0).max(4),
    denyTags: z.array(z.string()).default([]), // weapons carrying any of these are unequippable
    statMods: z.array(GrantSchema).default([]),
    startingWeapons: z.array(z.string()).default([]),
    // Engine mechanic vocabulary — sim implements exactly these
    mechanic: z
      .enum([
        'none',
        'ironhide',
        'backspin',
        'redline',
        'redthirst',
        'riseAndShine',
        'kindling', // pyromancer: burns tick 25% faster (same total, sooner)
        'static', // stormcaller: every 8th hit chains to a nearby enemy
        'wintryAura', // frostwitch: enemies within 2 units are slowed 15%
        'goldStandard', // tycoon: +25% gold; every 15 gold collected flicks a coin
        'wheelOfWhee', // jester: a free random boon each wave; boon picks offer 5
        'pact', // warlock: 10% of damage echoes as void; the contract collects 1 HP per wave
        'foresight', // oracle: chests offer 5 choices instead of 3
        'miseEnPlace', // chef: hearts drop 50% more often and can overheal 25%
        'swarmAnger', // beekeeper: taking a hit angers the swarm (+25% damage 5s)
        'spillage', // alchemist: 15% of kills leave an acid pool
      ])
      .default('none'),
    startingPets: z.array(z.string()).default([]),
    startingPassives: z.array(z.string()).default([]),
    levelUpItems: z
      .array(z.object({ level: z.number().int().min(2), options: z.array(z.string()).min(1) }).strict())
      .default([]),
    unlock: z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('default') }).strict(),
        z.object({ type: z.literal('deed'), deedId: z.string() }).strict(),
        // sold for Glimmers only (discovery-rescue ceremony arrives with polish)
        z.object({ type: z.literal('shop') }).strict(),
      ])
      .default({ type: 'default' }),
  })
  .strict();

export const DeedSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    desc: z.string(),
    hint: z.string(),
    kind: z.enum(['counter', 'single-event', 'run-state', 'world-state', 'discovery']),
    scope: z.enum(['party', 'perPlayer']),
    target: z.number().positive(),
    match: DeedMatchSchema,
    unlocks: z
      .array(z.object({ type: z.enum(['weapon', 'passive', 'class', 'feat']), id: z.string() }).strict())
      .default([]),
    glimmerBonus: z.number().nonnegative().default(0),
  })
  .strict();

export const BoonSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(), // migrates to strings/en.json keys in M4
    desc: z.string(),
    grants: z.array(GrantSchema).min(1),
    weight: z.number().positive().default(1),
  })
  .strict();

export const PetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    radius: z.number().positive(),
    moveSpeed: z.number().positive(),
    attackCooldown: z.number().positive(),
    // Damage scales off the OWNER's stats: multiplier × petDamage + flat roll
    multiplier: z.number().nonnegative(),
    flat: z.tuple([z.number(), z.number()]),
    types: z.array(DamageTypeSchema).min(1), // e.g. ["pet","melee"]
    lifetime: z.number().nonnegative().default(0), // 0 = permanent
    maxPerOwner: z.number().int().positive().default(4),
    leash: z.number().positive().default(8), // stays within this range of the owner
  })
  .strict();

export const BalanceSchema = z
  .object({
    schemaVersion: z.number(),
    player: z
      .object({
        baseStats: z.record(StatIdSchema, z.number()),
        moveUnitsPerSec: z.number().positive(),
        dashSpeed: z.number().positive(),
        dashDuration: z.number().positive(),
        dashIframes: z.number().positive(),
        hitIframes: z.number().positive(),
        dashCooldown: z.number().positive(),
        radius: z.number().positive(),
        critBase: z.number(), // base critDamage (0.5 → ×1.5)
      })
      .strict(),
    defense: z
      .object({
        armorKneeBase: z.number(),
        armorKneePerWave: z.number(),
        armorCap: z.number(),
        dodgeCap: z.number(),
        resistCap: z.number(),
      })
      .strict(),
    combo: z
      .object({ decaySeconds: z.number(), xpPerStack: z.number(), maxMult: z.number() })
      .strict(),
    leveling: z
      .object({ base: z.number(), perLevel: z.number() })
      .strict(),
    evil: z
      .object({
        candleSpawn: z.number(),
        heartReward: z.number(),
        heartStats: z.number(),
        bellowsSpeed: z.number(),
        bellowsGold: z.number(),
        drumHp: z.number(),
        drumXp: z.number(),
        fistDmg: z.number(),
      })
      .strict(),
    coop: z
      .object({
        spawnMultPerExtraPlayer: z.number(),
        reviveHoldSeconds: z.number(),
        reviveHpFrac: z.number(),
        reviveRange: z.number(),
      })
      .strict(),
    waves: z
      .object({
        hpGrowthPerWave: z.number(),
        dmgGrowthPerWave: z.number(),
        elite: z
          .object({ hpMult: z.number(), dmgMult: z.number(), speedMult: z.number(), xpMult: z.number(), chestChance: z.number() })
          .strict(),
      })
      .strict(),
    drops: z
      .object({
        pickupBaseRadius: z.number(),
        goldValue: z.number(),
        xpValue: z.number(),
        heartChance: z.number(),
        heartHeal: z.number(),
        waveClearHearts: z.number(),
      })
      .strict(),
    peddler: z
      .object({
        visitWaves: z.array(z.number().int().min(1).max(10)), // wave-in-act schedule
        stockSize: z.number().int().min(1),
        itemPriceBase: z.number(),
        itemPricePerAct: z.number(),
        snackPrice: z.number(),
        rerollCostBase: z.number(),
        rerollCostGrowth: z.number(),
      })
      .strict(),
  })
  .strict();

export type WeaponDef = z.infer<typeof WeaponSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type BalanceDef = z.infer<typeof BalanceSchema>;
export type Grant = z.infer<typeof GrantSchema>;
export type EffectDef = z.infer<typeof EffectSchema>;
export type WaveDef = z.infer<typeof WaveSchema>;
export type BoonDef = z.infer<typeof BoonSchema>;
export type DeedDef = z.infer<typeof DeedSchema>;
export type ClassDef = z.infer<typeof ClassSchema>;
export type PassiveDef = z.infer<typeof PassiveSchema>;
export type FeatDef = z.infer<typeof FeatSchema>;
export type TriggerDef = z.infer<typeof TriggerSchema>;
export type PetDef = z.infer<typeof PetSchema>;
export type ActWavesDef = z.infer<typeof ActWavesSchema>;
