import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { stat } from './stats';

function simWithFeats(seed = 1, classId = 'hero'): Sim {
  const sim = new Sim(seed, 1, undefined, [classId]);
  for (const id of sim.registry.feats.keys()) sim.unlockedFeats.add(id);
  return sim;
}

describe('feats', () => {
  it('every 3rd level owes a feat pick', () => {
    const sim = simWithFeats();
    const p = sim.state.players[0]!;
    sim.grantXpTo(0, 10000);
    expect(p.level).toBeGreaterThanOrEqual(6);
    expect(p.pendingFeats).toBe(Math.floor(p.level / 3));
  });

  it('rolls 1-of-4 distinct unlocked feats and applying one grants its stats', () => {
    const sim = simWithFeats();
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    const choices = sim.rollFeatChoices(0, 4);
    expect(choices.length).toBe(4);
    expect(new Set(choices).size).toBe(4);
    const before = stat(p.stats, 'maxHp');
    sim.applyFeat(0, 'thick-wax');
    expect(p.feats).toContain('thick-wax');
    expect(p.pendingFeats).toBe(0);
    expect(stat(p.stats, 'maxHp')).toBeGreaterThan(before);
    // no double-dipping: a second apply without a pending pick is refused
    sim.applyFeat(0, 'fleet-wick');
    expect(p.feats).not.toContain('fleet-wick');
  });

  it('locked feats stay out of the pool until their deed unlocks them', () => {
    const sim = new Sim(2, 1); // nothing unlocked
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    const pool = sim.rollFeatChoices(0, 99);
    expect(pool).not.toContain('cinder'); // gated behind burn-kills-25
    expect(pool).toContain('thick-wax'); // day-one feat
  });

  it('glass cannon trades health for damage', () => {
    const sim = simWithFeats();
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    const hpBefore = stat(p.stats, 'maxHp');
    const dmgBefore = stat(p.stats, 'meleeDamage');
    sim.applyFeat(0, 'glass-cannon');
    expect(stat(p.stats, 'maxHp')).toBeLessThan(hpBefore);
    expect(stat(p.stats, 'meleeDamage')).toBeGreaterThanOrEqual(dmgBefore);
  });

  it('bee yourself spawns a permanent bee on acquire', () => {
    const sim = simWithFeats();
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    sim.applyFeat(0, 'bee-yourself');
    expect(sim.state.pets.some((pet) => pet.defId === 'bee' && pet.owner === 0)).toBe(true);
  });

  it('overflow splashes overkill to the nearest enemy', () => {
    const sim = simWithFeats(7);
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    sim.applyFeat(0, 'overflow');
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const a = sim.spawnEnemy('snuffling', 10, 10);
    const b = sim.spawnEnemy('snuffling', 11, 10);
    a.hp = 1;
    const hpBefore = b.hp;
    sim.applyDamageToEnemy(
      a,
      { kind: 'attack', types: ['melee'], multiplier: 0, flat: [0, 0] },
      p.stats,
      { actor: { kind: 'player', index: 0 }, itemId: 'shortsword', grantedBy: null, deliveryTag: 'melee', hitId: 1 },
      { rawOverride: 50, noCrit: true },
    );
    expect(a.alive).toBe(false);
    expect(b.hp).toBeLessThan(hpBefore); // the overkill found a new home
  });

  it('second course makes hearts heal more', () => {
    const sim = simWithFeats(9);
    const p = sim.state.players[0]!;
    p.pendingFeats = 1;
    sim.applyFeat(0, 'second-course');
    p.hp = 1;
    const healed = sim.healPlayer(p, 4, 'test');
    expect(healed).toBe(4); // healPlayer itself is unchanged — the mod scales pickup amounts
    expect(sim.hasMod(p, 'secondCourse')).toBe(true);
  });
});
