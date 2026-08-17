// The damage pipeline — the ONLY place hit math happens (design doc 03-combat.md).
// Order: dodge (attacks) → block → armor (attacks) → % resist (void skips) → flat.

import type { RngStream } from './rng';
import { stat, type StatSheet } from './stats';
import { DAMAGE_STAT, RESIST_STAT, type DamageType } from '../data/stats';
import type { BalanceDef } from '../data/schemas';
import type { Mitigation } from './tracker';

export type AttackProfile = {
  kind: 'attack' | 'spell';
  types: DamageType[];
  multiplier: number;
  flat: [number, number];
  noCrit?: boolean;
};

export type DefenseProfile = {
  armor: number;
  dodge: number; // 0..1
  blockPhys: number;
  blockSpell: number;
  resistAll: number; // 0..1
  resists: Partial<Record<DamageType, number>>; // typed absorbs incl. enemy 50% absorbs
  flatReduction: number;
};

export function defenseFromStats(sheet: StatSheet): DefenseProfile {
  const resists: Partial<Record<DamageType, number>> = {};
  for (const [t, s] of Object.entries(RESIST_STAT)) {
    const v = stat(sheet, s);
    if (v) resists[t as DamageType] = v;
  }
  return {
    armor: stat(sheet, 'armor'),
    dodge: stat(sheet, 'dodge'),
    blockPhys: stat(sheet, 'blockPhys'),
    blockSpell: stat(sheet, 'blockSpell'),
    resistAll: stat(sheet, 'resistAll'),
    resists,
    flatReduction: stat(sheet, 'flatReduction'),
  };
}

/** Roll the attacker's outgoing damage before defenses. */
export function rollAttack(
  attack: AttackProfile,
  attacker: StatSheet,
  rng: RngStream,
  balance: BalanceDef,
): { raw: number; crit: boolean } {
  // Scaling stat: highest among the attack's types (multi-type weapons use the best).
  let scale = 0;
  for (const t of attack.types) scale = Math.max(scale, stat(attacker, DAMAGE_STAT[t]));
  const flat = attack.flat[0] + rng.next() * (attack.flat[1] - attack.flat[0]);
  let raw = attack.multiplier * scale + flat;
  let crit = false;
  if (!attack.noCrit && rng.chance(Math.min(1, stat(attacker, 'critChance')))) {
    crit = true;
    raw *= 1 + Math.max(0, stat(attacker, 'critDamage') || balance.player.critBase);
  }
  return { raw, crit };
}

export type HitResult = {
  amount: number;
  dodged: boolean;
  mitigation: Mitigation;
};

/** Apply the defense pipeline to a rolled hit. */
export function resolveHit(
  raw: number,
  attack: AttackProfile,
  defense: DefenseProfile,
  wave: number,
  rng: RngStream,
  balance: BalanceDef,
): HitResult {
  const isVoid = attack.types.includes('void');
  const isAttack = attack.kind === 'attack';
  const mit: Mitigation = { dodged: false, blocked: 0, armor: 0, resist: 0, flat: 0 };

  // 1. Dodge — attacks only
  if (isAttack && defense.dodge > 0) {
    const dodge = Math.min(balance.defense.dodgeCap, defense.dodge);
    if (rng.chance(dodge)) {
      mit.dodged = true;
      return { amount: 0, dodged: true, mitigation: mit };
    }
  }

  let dmg = raw;

  // 2. Block
  const block = isAttack ? defense.blockPhys : defense.blockSpell;
  if (block > 0) {
    const blocked = Math.min(dmg - 0, block);
    mit.blocked = blocked;
    dmg -= blocked;
  }

  // 3. Armor — attacks only, diminishing, wave-scaled knee
  if (isAttack && defense.armor > 0) {
    const knee = balance.defense.armorKneeBase + balance.defense.armorKneePerWave * wave;
    const reduction = Math.min(balance.defense.armorCap, defense.armor / (defense.armor + knee));
    const absorbed = dmg * reduction;
    mit.armor = absorbed;
    dmg -= absorbed;
  }

  // 4. % resistance — void skips entirely (incl. typed absorbs)
  if (!isVoid) {
    let resist = defense.resistAll;
    for (const t of attack.types) resist += defense.resists[t] ?? 0;
    resist = Math.min(balance.defense.resistCap, resist);
    if (resist > 0) {
      const absorbed = dmg * resist;
      mit.resist = absorbed;
      dmg -= absorbed;
    }
  }

  // 5. Flat reduction — chip damage always lands
  if (defense.flatReduction > 0 && dmg > 0) {
    const reduced = Math.min(dmg - 1, defense.flatReduction);
    if (reduced > 0) {
      mit.flat = reduced;
      dmg -= reduced;
    }
  }

  // A hit that connects always deals at least 1 (chip damage).
  return { amount: Math.max(1, Math.round(dmg)), dodged: false, mitigation: mit };
}
