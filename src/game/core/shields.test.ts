import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { stat } from './stats';

describe('shields, paladin, snail knight', () => {
  it('a shield grants block and never swings', () => {
    const sim = new Sim(1, 1, undefined, ['paladin']);
    const p = sim.state.players[0]!;
    expect(p.weapons.map((w) => w.itemId)).toContain('round-shield');
    expect(stat(p.stats, 'blockPhys')).toBeGreaterThan(0);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    sim.spawnEnemy('snuffling', p.x + 1, p.y);
    for (let i = 0; i < 60; i++) sim.tick([]);
    const shieldDamage = sim.tracker.events.some(
      (ev) => ev.type === 'damage' && ev.source.itemId === 'round-shield',
    );
    expect(shieldDamage).toBe(false);
  });

  it('one shield per candle — except the paladin', () => {
    const fighter = new Sim(2, 1, undefined, ['fighter']);
    expect(fighter.equipWeapon(0, 'round-shield')).toBe(true);
    expect(fighter.equipWeapon(0, 'round-shield')).toBe(false); // off-hand is taken

    const pal = new Sim(3, 1, undefined, ['paladin']);
    // paladin starts mace+shield (2 of 4 points): two more shields fit under Aegis
    expect(pal.equipWeapon(0, 'round-shield')).toBe(true);
    expect(pal.equipWeapon(0, 'round-shield')).toBe(true);
    expect(pal.state.players[0]!.weapons.filter((w) => w.itemId === 'round-shield').length).toBe(3);
  });

  it('rogue and berserker refuse shields', () => {
    for (const cls of ['rogue', 'berserker']) {
      const sim = new Sim(4, 1, undefined, [cls]);
      expect(sim.equipWeapon(0, 'round-shield')).toBe(false);
    }
  });

  it('blocking emits events that feed the block deed', () => {
    const sim = new Sim(5, 1, undefined, ['paladin']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    sim.spawnEnemy('grumble-beetle', p.x + 0.5, p.y);
    let blocked = 0;
    for (let i = 0; i < 300; i++) {
      const evs = sim.tick([]);
      blocked += evs
        .filter((e) => e.type === 'blockedDamage')
        .reduce((n, e) => n + (e as { amount: number }).amount, 0);
      if (blocked > 0) break;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('the snail knight leaves a slowing slime ribbon', () => {
    const sim = new Sim(6, 1, undefined, ['snail-knight']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    for (let i = 0; i < 30; i++) sim.tick([]);
    const trail = sim.state.pools.find((pl) => pl.active && pl.itemId === 'slime-trail');
    expect(trail).toBeTruthy();
    expect(trail!.damageType).toBe('poison');
  });
});
