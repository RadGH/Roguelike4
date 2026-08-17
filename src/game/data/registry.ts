// Loads and validates all game data at startup. A validation failure throws with a
// readable path — content errors are LOUD, never skipped.

import { z } from 'zod';
import balanceJson from '@data/balance.json';
import weaponsJson from '@data/items/weapons.json';
import enemiesAct1Json from '@data/enemies/act1.json';
import {
  BalanceSchema,
  EnemySchema,
  WeaponSchema,
  type BalanceDef,
  type EnemyDef,
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
};

let cached: Registry | null = null;

export function loadRegistry(): Registry {
  if (cached) return cached;
  const reg: Registry = {
    balance: parse(BalanceSchema, balanceJson, 'balance'),
    weapons: parseList(WeaponSchema, weaponsJson as unknown[], 'weapons'),
    enemies: parseList(EnemySchema, enemiesAct1Json as unknown[], 'enemies.act1'),
  };
  cached = reg;
  return reg;
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
