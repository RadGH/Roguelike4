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
    archetype: z.enum(['chaser', 'skitterer', 'shooter', 'charger', 'splitter', 'boss']),
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
    // boss fields: phases activate as hpFrac drops; active = first with until < hpFrac
    bossPhases: z
      .array(
        z
          .object({
            mode: z.enum(['hop', 'summon', 'frenzy']),
            until: z.number().min(0).max(1), // phase active while hpFrac > until
            cooldown: z.number().positive(),
            summonId: z.string().optional(),
            summonCount: z.number().int().positive().optional(),
            summonCap: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .optional(),
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

export const BoonSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(), // migrates to strings/en.json keys in M4
    desc: z.string(),
    grants: z.array(GrantSchema).min(1),
    weight: z.number().positive().default(1),
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
export type ActWavesDef = z.infer<typeof ActWavesSchema>;
