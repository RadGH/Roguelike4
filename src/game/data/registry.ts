// Loads and validates all game data at startup. A validation failure throws with a
// readable path — content errors are LOUD, never skipped.

import { z } from 'zod';
import balanceJson from '@data/balance.json';
import weaponsJson from '@data/items/weapons.json';
import enemiesAct1Json from '@data/enemies/act1.json';
import wavesAct1Json from '@data/waves/act1.json';
import boonsJson from '@data/boons.json';
import {
  ActWavesSchema,
  BalanceSchema,
  BoonSchema,
  EnemySchema,
  WeaponSchema,
  type ActWavesDef,
  type BalanceDef,
  type BoonDef,
  type EnemyDef,
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
};

let cached: Registry | null = null;

export function loadRegistry(): Registry {
  if (cached) return cached;
  const act1Waves = parse(ActWavesSchema, wavesAct1Json, 'waves.act1');
  const reg: Registry = {
    balance: parse(BalanceSchema, balanceJson, 'balance'),
    weapons: parseList(WeaponSchema, weaponsJson as unknown[], 'weapons'),
    enemies: parseList(EnemySchema, enemiesAct1Json as unknown[], 'enemies.act1'),
    waves: new Map([[act1Waves.act, act1Waves]]),
    boons: parseList(BoonSchema, boonsJson as unknown[], 'boons'),
  };
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
