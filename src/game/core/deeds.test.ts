import { describe, expect, it } from 'vitest';
import { DeedEngine } from './deeds';
import { loadRegistry } from '../data/registry';
import { Sim } from './sim';
import { neutralInput } from './input';
import { TICK_RATE } from './constants';
import type { TrackerEvent } from './tracker';

const reg = loadRegistry();

function makeEngine() {
  return new DeedEngine(reg.deeds, {}, new Set());
}

const killEvent = (types: string[], deliveryTag = 'melee', hitId = 1, grantedBy: string | null = null): TrackerEvent =>
  ({
    type: 'kill',
    tick: 0,
    wave: 1,
    source: {
      actor: { kind: 'player', index: 0 },
      itemId: 'x',
      grantedBy,
      deliveryTag: deliveryTag as 'melee',
      hitId,
    },
    target: { kind: 'enemy', id: 'snuffling', instance: 1 },
    types: types as TrackerEvent extends never ? never : ('fire' | 'melee')[],
  }) as TrackerEvent;

describe('deed engine', () => {
  it('fire kill completes fire-kill-1 and unlocks fireball', () => {
    const de = makeEngine();
    const done = de.processTick([killEvent(['fire'])], [], { maxGoldHeld: 0 });
    const fire = done.find((d) => d.deedId === 'fire-kill-1');
    expect(fire).toBeTruthy();
    expect(fire!.unlocks[0]).toEqual({ type: 'weapon', id: 'fireball' });
  });

  it('non-fire kills do not progress fire-kill-1', () => {
    const de = makeEngine();
    de.processTick([killEvent(['melee'])], [], { maxGoldHeld: 0 });
    expect(de.progress['fire-kill-1'] ?? 0).toBe(0);
  });

  it('explosion multikill needs >= target kills sharing one hitId', () => {
    const de = makeEngine();
    const four = Array.from({ length: 4 }, () => killEvent(['fire'], 'explosion', 99));
    expect(
      de.processTick(four, [], { maxGoldHeld: 0 }).find((d) => d.deedId === 'explosion-multikill-5'),
    ).toBeUndefined();
    const five = Array.from({ length: 5 }, () => killEvent(['fire'], 'explosion', 100));
    expect(
      de.processTick(five, [], { maxGoldHeld: 0 }).find((d) => d.deedId === 'explosion-multikill-5'),
    ).toBeTruthy();
  });

  it('burn kills count via grantedBy chain', () => {
    const de = makeEngine();
    de.processTick([killEvent(['fire'], 'pool', 1, 'burn')], [], { maxGoldHeld: 0 });
    expect(de.progress['burn-kills-25']).toBe(1);
  });

  it('counters accumulate across ticks and persist through progress object', () => {
    const progress: Record<string, number> = {};
    const de1 = new DeedEngine(reg.deeds, progress, new Set());
    de1.processTick([killEvent(['melee'])], [], { maxGoldHeld: 0 }); // no melee damage event; kill only
    // melee-damage-1000 counts damage amounts:
    const dmg: TrackerEvent = {
      type: 'damage',
      tick: 0,
      wave: 1,
      source: { actor: { kind: 'player', index: 0 }, itemId: 'shortsword', grantedBy: null, deliveryTag: 'melee', hitId: 2 },
      target: { kind: 'enemy', id: 'snuffling', instance: 2 },
      amount: 600,
      raw: 600,
      types: ['melee'],
      crit: false,
      mitigated: { dodged: false, blocked: 0, armor: 0, resist: 0, flat: 0 },
      overkill: 0,
    };
    de1.processTick([dmg], [], { maxGoldHeld: 0 });
    expect(progress['melee-damage-1000']).toBe(600);
    // "New session": fresh engine, same progress object → completes at 1000
    const de2 = new DeedEngine(reg.deeds, progress, new Set());
    const done = de2.processTick([dmg], [], { maxGoldHeld: 0 });
    expect(done.find((d) => d.deedId === 'melee-damage-1000')).toBeTruthy();
  });

  it('goldHeld is a high-water run-state check', () => {
    const de = makeEngine();
    expect(de.processTick([], [], { maxGoldHeld: 499 }).length).toBe(0);
    const done = de.processTick([], [], { maxGoldHeld: 500 });
    expect(done.find((d) => d.deedId === 'gold-hoard-500')).toBeTruthy();
  });

  it('completed deeds never re-fire', () => {
    const de = makeEngine();
    de.processTick([killEvent(['fire'])], [], { maxGoldHeld: 0 });
    const again = de.processTick([killEvent(['fire'])], [], { maxGoldHeld: 0 });
    expect(again.length).toBe(0);
  });
});

describe('unlock gating in the sim', () => {
  it('locked weapons never appear in chest rolls; unlocked ones can', () => {
    const sim = new Sim(1, 1);
    for (let i = 0; i < 30; i++) {
      for (const id of sim.rollWeaponChoices(0, 3)) {
        const w = reg.weapons.get(id)!;
        expect(w.unlockDeed).toBeUndefined();
      }
    }
    sim.unlockedItems.add('fireball');
    let sawFireball = false;
    for (let i = 0; i < 60 && !sawFireball; i++) {
      if (sim.rollWeaponChoices(0, 3).includes('fireball')) sawFireball = true;
    }
    expect(sawFireball).toBe(true);
  });

  it('firecracker blasts share one hitId across every enemy hit', () => {
    const sim = new Sim(9, 1);
    const p = sim.state.players[0]!;
    p.weapons = [{ itemId: 'firecracker', cooldownLeft: 0 }];
    // A tight cluster in range
    for (let i = 0; i < 5; i++) sim.spawnEnemy('snuffling', p.x + 5, p.y + (i - 2) * 0.5);
    for (let t = 0; t < TICK_RATE * 4; t++) sim.tick([neutralInput()]);
    const explosionHits = sim.tracker.events.filter(
      (e) => e.type === 'damage' && e.source.deliveryTag === 'explosion',
    );
    expect(explosionHits.length).toBeGreaterThan(1);
    const byHitId = new Map<number, number>();
    for (const e of explosionHits) {
      if (e.type === 'damage') byHitId.set(e.source.hitId, (byHitId.get(e.source.hitId) ?? 0) + 1);
    }
    expect(Math.max(...byHitId.values())).toBeGreaterThanOrEqual(2);
  });
});
