// Loads and validates all game data at startup. A validation failure throws with a
// readable path — content errors are LOUD, never skipped.

import { z } from 'zod';
import balanceJson from '@data/balance.json';
import weaponsJson from '@data/items/weapons.json';
import enemiesAct1Json from '@data/enemies/act1.json';
import enemiesAct2Json from '@data/enemies/act2.json';
import enemiesAct3Json from '@data/enemies/act3.json';
import enemiesAct4Json from '@data/enemies/act4.json';
import wavesAct1Json from '@data/waves/act1.json';
import wavesAct2Json from '@data/waves/act2.json';
import wavesAct3Json from '@data/waves/act3.json';
import wavesAct4Json from '@data/waves/act4.json';
import boonsJson from '@data/boons.json';
import deedsJson from '@data/deeds.json';
import classesJson from '@data/classes.json';
import passivesJson from '@data/items/passives.json';
import {
  ActWavesSchema,
  BalanceSchema,
  BoonSchema,
  ClassSchema,
  DeedSchema,
  EnemySchema,
  PassiveSchema,
  WeaponSchema,
  type ActWavesDef,
  type BalanceDef,
  type BoonDef,
  type ClassDef,
  type DeedDef,
  type EnemyDef,
  type PassiveDef,
  type WaveDef,
  type WeaponDef,
} from './schemas';

function parse<S extends z.ZodTypeAny>(schema: S, raw: unknown, label: string): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${label}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`)
      .join('\n');
    throw new Error(`Game data validation failed:\n${issues}`);
  }
  return result.data as z.output<S>;
}

function parseList<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown[],
  label: string,
): Map<string, z.output<S>> {
  const map = new Map<string, z.output<S>>();
  raw.forEach((entry, i) => {
    const parsed = parse(schema, entry, `${label}[${i}]`) as z.output<S> & { id: string };
    if (map.has(parsed.id)) throw new Error(`Duplicate id "${parsed.id}" in ${label}`);
    map.set(parsed.id, parsed);
  });
  return map;
}

export type Registry = {
  balance: BalanceDef;
  weapons: Map<string, WeaponDef>;
  enemies: Map<string, EnemyDef>;
  waves: Map<number, ActWavesDef>; // act → waves
  boons: Map<string, BoonDef>;
  deeds: Map<string, DeedDef>;
  classes: Map<string, ClassDef>;
  passives: Map<string, PassiveDef>;
};

let cached: Registry | null = null;

export function loadRegistry(): Registry {
  if (cached) return cached;
  const allEnemies = [
    ...(enemiesAct1Json as unknown[]),
    ...(enemiesAct2Json as unknown[]),
    ...(enemiesAct3Json as unknown[]),
    ...(enemiesAct4Json as unknown[]),
  ];
  const actWaves = [wavesAct1Json, wavesAct2Json, wavesAct3Json, wavesAct4Json].map((w, i) =>
    parse(ActWavesSchema, w, `waves.act${i + 1}`),
  );
  const reg: Registry = {
    balance: parse(BalanceSchema, balanceJson, 'balance'),
    weapons: parseList(WeaponSchema, weaponsJson as unknown[], 'weapons'),
    enemies: parseList(EnemySchema, allEnemies, 'enemies'),
    waves: new Map(actWaves.map((aw) => [aw.act, aw])),
    boons: parseList(BoonSchema, boonsJson as unknown[], 'boons'),
    deeds: parseList(DeedSchema, deedsJson as unknown[], 'deeds'),
    classes: parseList(ClassSchema, classesJson as unknown[], 'classes'),
    passives: parseList(PassiveSchema, passivesJson as unknown[], 'passives'),
  };
  for (const [id, p] of reg.passives) {
    if (p.unlockDeed && !reg.deeds.has(p.unlockDeed))
      throw new Error(`passive "${id}": unknown unlockDeed "${p.unlockDeed}"`);
    if (reg.weapons.has(id)) throw new Error(`item id collision: "${id}" is both weapon and passive`);
  }
  // Class cross-checks: starting weapons, level-up options, unlock deeds, and the
  // reverse direction (deed class unlocks reference real classes).
  for (const [id, c] of reg.classes) {
    for (const w of c.startingWeapons) {
      if (!reg.weapons.has(w)) throw new Error(`class "${id}": unknown starting weapon "${w}"`);
    }
    for (const lu of c.levelUpItems) {
      for (const w of lu.options) {
        if (!reg.weapons.has(w)) throw new Error(`class "${id}": unknown level-up item "${w}"`);
      }
    }
    if (c.unlock.type === 'deed' && !reg.deeds.has(c.unlock.deedId))
      throw new Error(`class "${id}": unknown unlock deed "${c.unlock.deedId}"`);
  }
  for (const [id, d] of reg.deeds) {
    for (const u of d.unlocks) {
      if (u.type === 'class' && !reg.classes.has(u.id))
        throw new Error(`deed "${id}": unlocks unknown class "${u.id}"`);
    }
  }
  for (const [id, e] of reg.enemies) {
    if (e.summonId && !reg.enemies.has(e.summonId))
      throw new Error(`enemy "${id}": summonId references unknown enemy "${e.summonId}"`);
    for (const ph of e.bossPhases ?? []) {
      if (ph.summonId && !reg.enemies.has(ph.summonId))
        throw new Error(`enemy "${id}": boss phase summons unknown enemy "${ph.summonId}"`);
    }
  }
  // Day-one audit (build-time slice): every weapon unlockDeed exists; every deed's
  // weapon unlock exists; and at least one day-one path feeds each deed's need.
  for (const [id, w] of reg.weapons) {
    if (w.unlockDeed && !reg.deeds.has(w.unlockDeed))
      throw new Error(`weapon "${id}": unknown unlockDeed "${w.unlockDeed}"`);
  }
  for (const [id, d] of reg.deeds) {
    for (const u of d.unlocks) {
      if (u.type === 'weapon' && !reg.weapons.has(u.id))
        throw new Error(`deed "${id}": unlocks unknown weapon "${u.id}"`);
      if (u.type === 'passive' && !reg.passives.has(u.id))
        throw new Error(`deed "${id}": unlocks unknown passive "${u.id}"`);
    }
  }
  // Cross-reference checks: every wave entry and splitter child must exist.
  for (const [act, aw] of reg.waves) {
    for (const w of aw.waves) {
      for (const e of w.entries) {
        if (!reg.enemies.has(e.defId))
          throw new Error(`waves.act${act} wave ${w.wave}: unknown enemy "${e.defId}"`);
      }
    }
  }
  for (const [id, e] of reg.enemies) {
    if (e.splitInto && !reg.enemies.has(e.splitInto))
      throw new Error(`enemy "${id}": splitInto references unknown enemy "${e.splitInto}"`);
  }
  cached = reg;
  return reg;
}

export function getWave(reg: Registry, act: number, wave: number): WaveDef {
  const aw = reg.waves.get(act);
  const w = aw?.waves.find((x) => x.wave === wave);
  if (!w) throw new Error(`No wave data for act ${act} wave ${wave}`);
  return w;
}

export function maxWave(reg: Registry, act: number): number {
  const aw = reg.waves.get(act);
  if (!aw) return 0;
  return Math.max(...aw.waves.map((w) => w.wave));
}

export function minWave(reg: Registry, act: number): number {
  const aw = reg.waves.get(act);
  if (!aw) return 0;
  return Math.min(...aw.waves.map((w) => w.wave));
}

export function getWeapon(reg: Registry, id: string): WeaponDef {
  const w = reg.weapons.get(id);
  if (!w) throw new Error(`Unknown weapon id "${id}"`);
  return w;
}

export function getEnemy(reg: Registry, id: string): EnemyDef {
  const e = reg.enemies.get(id);
  if (!e) throw new Error(`Unknown enemy id "${id}"`);
  return e;
}
