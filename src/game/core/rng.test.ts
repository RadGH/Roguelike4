import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('rng', () => {
  it('same seed produces identical streams', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.combat.next()).toBe(b.combat.next());
  });

  it('streams are independent — draining one does not affect another', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) a.drops.next(); // drain drops on a only
    for (let i = 0; i < 20; i++) expect(a.combat.next()).toBe(b.combat.next());
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 8 }, () => a.combat.next());
    const seqB = Array.from({ length: 8 }, () => b.combat.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('int is inclusive on both ends', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.drops.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
