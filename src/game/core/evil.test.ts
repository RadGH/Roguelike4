import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';

const idle = (): InputFrame => neutralInput();

describe('evil items', () => {
  it('evil candle raises spawn counts', () => {
    const plain = new Sim(1, 1);
    plain.startWaveNumber(1);
    const cursed = new Sim(1, 1);
    cursed.addPassive(0, 'evil-candle');
    cursed.startWaveNumber(1);
    const count = (s: Sim) => s.state.spawning.queue.reduce((a, q) => a + q.count, 0);
    expect(count(cursed)).toBeGreaterThan(count(plain));
  });

  it('evil drum toughens enemies; evil heart pays better', () => {
    const plain = new Sim(2, 1);
    plain.state.wave = 1;
    const e1 = plain.spawnEnemy('snuffling', 5, 5);
    const cursed = new Sim(2, 1);
    cursed.addPassive(0, 'evil-drum');
    cursed.addPassive(0, 'evil-heart');
    cursed.state.wave = 1;
    const e2 = cursed.spawnEnemy('snuffling', 5, 5);
    expect(e2.maxHp).toBeGreaterThan(e1.maxHp);
    expect(e2.xp).toBeGreaterThan(e1.xp);
  });

  it('evil eye invites the act miniboss into every wave', () => {
    const sim = new Sim(3, 1);
    sim.addPassive(0, 'evil-eye');
    sim.startWaveNumber(1);
    expect(sim.state.spawning.queue.some((q) => q.defId === 'sir-fluffington')).toBe(true);
  });

  it('evil fist drops a bonus chest at wave start', () => {
    const sim = new Sim(4, 1);
    sim.addPassive(0, 'evil-fist');
    sim.startWaveNumber(1);
    expect(sim.state.pickups.some((p) => p.active && p.kind === 'chest')).toBe(true);
  });
});

describe('mimics', () => {
  it('plays chest until approached, then wakes and chases', () => {
    const sim = new Sim(5, 1);
    const p = sim.state.players[0]!;
    const mimic = sim.spawnEnemy('possessed-chest', p.x + 6, p.y);
    for (let t = 0; t < TICK_RATE; t++) sim.tick([idle()]);
    expect(mimic.mimicAwake).toBe(false);
    expect(Math.abs(mimic.x - (p.x + 6))).toBeLessThan(0.01); // hasn't moved
    // Walk toward it
    for (let t = 0; t < TICK_RATE * 2 && !mimic.mimicAwake; t++) {
      sim.tick([{ ...idle(), moveX: 1 }]);
    }
    expect(mimic.mimicAwake).toBe(true);
  });

  it('possessed chest drops a real chest on defeat; gilded pays gold', () => {
    const sim = new Sim(6, 1);
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    const mimic = sim.spawnEnemy('possessed-chest', p.x + 1.5, p.y);
    mimic.mimicAwake = true;
    for (let t = 0; t < TICK_RATE * 15 && sim.aliveEnemyCount() > 0; t++) sim.tick([idle()]);
    expect(sim.state.players[0]!.pendingChests).toBeGreaterThan(0);

    const sim2 = new Sim(7, 1);
    const p2 = sim2.state.players[0]!;
    p2.iframeTimer = 9999;
    const gilded = sim2.spawnEnemy('gilded-mimic', p2.x + 1.5, p2.y);
    gilded.mimicAwake = true;
    for (let t = 0; t < TICK_RATE * 20 && sim2.aliveEnemyCount() > 0; t++) sim2.tick([idle()]);
    expect(p2.gold).toBeGreaterThan(5);
  });

  it('mimic kills progress the mimic deed', () => {
    const sim = new Sim(8, 1);
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    const mimic = sim.spawnEnemy('possessed-chest', p.x + 1.5, p.y);
    mimic.mimicAwake = true;
    for (let t = 0; t < TICK_RATE * 15 && sim.aliveEnemyCount() > 0; t++) sim.tick([idle()]);
    const kill = sim.tracker.events.find(
      (e) => e.type === 'kill' && e.target.kind === 'enemy' && e.target.id === 'possessed-chest',
    );
    expect(kill).toBeTruthy();
  });
});

describe('minibosses', () => {
  it('each act miniboss exists with a guaranteed chest', () => {
    const sim = new Sim(9, 1);
    for (const id of ['sir-fluffington', 'the-damp', 'avalanche-jr', 'the-understudy']) {
      const def = sim.registry.enemies.get(id)!;
      expect(def.name).toBeTruthy();
      expect(def.chestChance).toBe(1);
    }
  });
});
