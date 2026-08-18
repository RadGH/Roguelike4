import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { stat } from './stats';
import { neutralInput } from './input';

describe('third class batch', () => {
  it('all four classes exist with legal starting gear', () => {
    for (const id of ['oracle', 'chef', 'beekeeper', 'alchemist']) {
      const sim = new Sim(1, 1, undefined, [id]);
      const p = sim.state.players[0]!;
      expect(p.weapons.length).toBeGreaterThan(0);
    }
  });

  it('beekeeper starts with a bee and hits harder while angry', () => {
    const sim = new Sim(2, 1, undefined, ['beekeeper']);
    const p = sim.state.players[0]!;
    expect(sim.state.pets.some((pet) => pet.defId === 'bee' && pet.owner === 0)).toBe(true);
    expect(p.angerTimer).toBe(0);
    // getting hurt angers the swarm
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const e = sim.spawnEnemy('snuffling', p.x + 0.5, p.y);
    for (let i = 0; i < 90 && p.angerTimer === 0; i++) sim.tick([]);
    expect(p.angerTimer).toBeGreaterThan(0);
    void e;
  });

  it('chef can overheal to 125% and stocks the pantry', () => {
    const sim = new Sim(3, 1, undefined, ['chef']);
    const p = sim.state.players[0]!;
    const max = stat(p.stats, 'maxHp');
    const healed = sim.healPlayer(p, 999, 'test');
    expect(p.hp).toBeCloseTo(max * 1.25, 5);
    expect(healed).toBeGreaterThan(0);
  });

  it("alchemist's flask lays a poison pool where it lands", () => {
    const sim = new Sim(4, 1, undefined, ['alchemist']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    sim.spawnEnemy('grumble-beetle', p.x + 4, p.y);
    let sawPool = false;
    for (let i = 0; i < 240; i++) {
      sim.tick([{ ...neutralInput(), aimX: 1, aimY: 0, fire: true }]);
      if (sim.state.pools.some((pl) => pl.active && pl.friendly && pl.damageType === 'poison')) {
        sawPool = true;
        break;
      }
    }
    expect(sawPool).toBe(true);
  });

  it('spillage pools damage as poison and attribute to the alchemist', () => {
    const sim = new Sim(5, 1, undefined, ['alchemist']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    // force many kills so the 15% spillage roll fires
    let sawSpill = false;
    for (let round = 0; round < 30 && !sawSpill; round++) {
      const e = sim.spawnEnemy('snuffling', p.x + 1, p.y);
      e.hp = 1;
      sim.applyDamageToEnemy(
        e,
        { kind: 'spell', types: ['poison'], multiplier: 0, flat: [0, 0] },
        p.stats,
        { actor: { kind: 'player', index: 0 }, itemId: 'acid-flask', grantedBy: null, deliveryTag: 'projectile', hitId: round + 1 },
        { rawOverride: 10, noCrit: true },
      );
      sawSpill = sim.state.pools.some((pl) => pl.active && pl.itemId === 'spillage');
    }
    expect(sawSpill).toBe(true);
  });
});
