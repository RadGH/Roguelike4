import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { resolveHit, rollAttack, type AttackProfile, type DefenseProfile } from './combat';
import { buildStats } from './stats';
import { loadRegistry } from '../data/registry';

const balance = loadRegistry().balance;

const noDefense: DefenseProfile = {
  armor: 0,
  dodge: 0,
  blockPhys: 0,
  blockSpell: 0,
  resistAll: 0,
  resists: {},
  flatReduction: 0,
};

const meleeAttack: AttackProfile = {
  kind: 'attack',
  types: ['melee'],
  multiplier: 1,
  flat: [3, 3],
};

describe('rollAttack', () => {
  it('scales off the matching stat: multiplier × stat + flat', () => {
    const rng = createRng(1).combat;
    const stats = buildStats({ meleeDamage: 10 }, []);
    const { raw } = rollAttack(meleeAttack, stats, rng, balance);
    expect(raw).toBeCloseTo(13, 5); // 1.0×10 + 3 (no crit at 0% chance)
  });

  it('crits multiply by 1 + critDamage', () => {
    const rng = createRng(1).combat;
    const stats = buildStats({ meleeDamage: 10, critChance: 1, critDamage: 0.5 }, []);
    const { raw, crit } = rollAttack(meleeAttack, stats, rng, balance);
    expect(crit).toBe(true);
    expect(raw).toBeCloseTo(19.5, 5); // 13 × 1.5
  });

  it('multi-type attacks scale off the highest matching stat', () => {
    const rng = createRng(1).combat;
    const stats = buildStats({ fireDamage: 4, arcaneDamage: 9 }, []);
    const { raw } = rollAttack(
      { kind: 'spell', types: ['fire', 'arcane'], multiplier: 1, flat: [0, 0] },
      stats,
      rng,
      balance,
    );
    expect(raw).toBeCloseTo(9, 5);
  });
});

describe('resolveHit pipeline', () => {
  it('undefended hit passes through (rounded)', () => {
    const r = resolveHit(10, meleeAttack, noDefense, 1, createRng(1).combat, balance);
    expect(r.amount).toBe(10);
  });

  it('block subtracts flat, chip damage floor of 1 holds', () => {
    const d = { ...noDefense, blockPhys: 100 };
    const r = resolveHit(10, meleeAttack, d, 1, createRng(1).combat, balance);
    expect(r.amount).toBe(1);
    expect(r.mitigation.blocked).toBeGreaterThan(0);
  });

  it('spells ignore armor and physical block, use spell block', () => {
    const d = { ...noDefense, armor: 1000, blockPhys: 100, blockSpell: 2 };
    const spell: AttackProfile = { kind: 'spell', types: ['fire'], multiplier: 1, flat: [0, 0] };
    const r = resolveHit(10, spell, d, 1, createRng(1).combat, balance);
    expect(r.amount).toBe(8); // only spell block 2 applied
    expect(r.mitigation.armor).toBe(0);
  });

  it('armor has diminishing returns and scales with wave', () => {
    const d = { ...noDefense, armor: 25 };
    const early = resolveHit(100, meleeAttack, d, 1, createRng(1).combat, balance);
    const late = resolveHit(100, meleeAttack, d, 30, createRng(1).combat, balance);
    expect(early.amount).toBeLessThan(late.amount); // same armor worth less later
  });

  it('void ignores % resists including typed absorbs', () => {
    const d = { ...noDefense, resistAll: 0.5, resists: { fire: 0.5 as number } };
    const voidAttack: AttackProfile = { kind: 'spell', types: ['void'], multiplier: 1, flat: [0, 0] };
    const fireAttack: AttackProfile = { kind: 'spell', types: ['fire'], multiplier: 1, flat: [0, 0] };
    const v = resolveHit(100, voidAttack, d, 1, createRng(1).combat, balance);
    const f = resolveHit(100, fireAttack, d, 1, createRng(1).combat, balance);
    expect(v.amount).toBe(100);
    expect(f.amount).toBe(25); // resistAll 0.5 + fire 0.5 capped at 0.75
  });

  it('dodge only applies to attacks, never spells', () => {
    const d = { ...noDefense, dodge: 1 }; // 100%, capped to 60% — force with many rolls
    let dodges = 0;
    const rng = createRng(7).combat;
    for (let i = 0; i < 200; i++) {
      if (resolveHit(10, meleeAttack, d, 1, rng, balance).dodged) dodges++;
    }
    expect(dodges).toBeGreaterThan(80); // ≈60% of 200
    expect(dodges).toBeLessThan(160); // cap enforced, not 100%
    const spell: AttackProfile = { kind: 'spell', types: ['fire'], multiplier: 1, flat: [0, 0] };
    expect(resolveHit(10, spell, d, 1, rng, balance).dodged).toBe(false);
  });
});

describe('stat stacking', () => {
  it('(base + flat) × (1 + pct) × mult', () => {
    const s = buildStats({ maxHp: 10 }, [
      [{ stat: 'maxHp', flat: 5 }],
      [{ stat: 'maxHp', pct: 0.2 }],
      [{ stat: 'maxHp', mult: 2 }],
    ]);
    expect(s.maxHp).toBeCloseTo((10 + 5) * 1.2 * 2, 5);
  });
});
