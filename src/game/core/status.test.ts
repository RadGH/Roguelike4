import { describe, expect, it } from 'vitest';
import { applyEffect, freshStatus, isControlled, moveMult, tickStatus } from './status';
import type { SourceChain } from './tracker';

const src: SourceChain = {
  actor: { kind: 'player', index: 0 },
  itemId: 'candlestick',
  grantedBy: null,
  deliveryTag: 'melee',
  hitId: 1,
};

function drain(s: ReturnType<typeof freshStatus>, seconds: number, step = 1 / 30) {
  const ticks = [];
  for (let t = 0; t < seconds; t += step) ticks.push(...tickStatus(s, step));
  return ticks;
}

describe('burn', () => {
  it('deals the listed amount over ~3 seconds and preserves the source', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'burn', amount: 6, chance: 1 }, src, 'normal');
    const ticks = drain(s, 3.6);
    const total = ticks.reduce((a, t) => a + t.amount, 0);
    expect(total).toBeCloseTo(6, 1);
    expect(ticks.every((t) => t.kind === 'burn' && t.source.itemId === 'candlestick')).toBe(true);
    expect(s.burnPool).toBe(0);
  });

  it('reapply adds 50% of the new total', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'burn', amount: 6, chance: 1 }, src, 'normal');
    applyEffect(s, { kind: 'burn', amount: 6, chance: 1 }, src, 'normal');
    expect(s.burnPool).toBeCloseTo(9, 5); // 6 + 3
  });
});

describe('control', () => {
  it('stun stops movement and expires', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'stun', duration: 0.5, chance: 1 }, src, 'normal');
    expect(isControlled(s)).toBe(true);
    expect(moveMult(s)).toBe(0);
    drain(s, 0.6);
    expect(isControlled(s)).toBe(false);
  });

  it('diminishing returns: quick re-stuns are 50% shorter each time', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'stun', duration: 1, chance: 1 }, src, 'normal');
    const first = s.stunLeft;
    s.stunLeft = 0;
    applyEffect(s, { kind: 'stun', duration: 1, chance: 1 }, src, 'normal');
    const second = s.stunLeft;
    expect(second).toBeCloseTo(first * 0.5, 5);
  });

  it('elites take half control duration; bosses 15%', () => {
    const e = freshStatus();
    applyEffect(e, { kind: 'stun', duration: 1, chance: 1 }, src, 'elite');
    expect(e.stunLeft).toBeCloseTo(0.5, 5);
    const b = freshStatus();
    applyEffect(b, { kind: 'stun', duration: 1, chance: 1 }, src, 'boss');
    expect(b.stunLeft).toBeCloseTo(0.15, 5);
  });

  it('freeze becomes heavy slow on elites', () => {
    const e = freshStatus();
    applyEffect(e, { kind: 'freeze', duration: 2, chance: 1 }, src, 'elite');
    expect(e.freezeLeft).toBe(0);
    expect(e.slowMag).toBeGreaterThanOrEqual(0.6);
  });

  it('slow reduces movement by magnitude', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'slow', duration: 2, magnitude: 0.3, chance: 1 }, src, 'normal');
    expect(moveMult(s)).toBeCloseTo(0.7, 5);
  });
});

describe('poison', () => {
  it('stacks fully', () => {
    const s = freshStatus();
    applyEffect(s, { kind: 'poison', amount: 5, chance: 1 }, src, 'normal');
    applyEffect(s, { kind: 'poison', amount: 5, chance: 1 }, src, 'normal');
    expect(s.poisonPool).toBe(10);
  });
});
