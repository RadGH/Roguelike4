import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput } from './input';
import { TICK_RATE } from './constants';
import { loadRegistry, getWave, maxWave } from '../data/registry';

describe('wave data', () => {
  it('act 1 has 10 waves and every entry references a real enemy', () => {
    const reg = loadRegistry();
    expect(maxWave(reg, 1)).toBe(10);
    for (let w = 1; w <= 10; w++) {
      const wave = getWave(reg, 1, w);
      for (const e of wave.entries) expect(reg.enemies.has(e.defId)).toBe(true);
    }
  });
});

describe('wave lifecycle', () => {
  it('startWaveNumber spawns per script; clearing emits waveCleared', () => {
    const sim = new Sim(5, 1);
    sim.startWaveNumber(1);
    expect(sim.state.phase).toBe('fighting');
    // Run until first spawns appear
    for (let t = 0; t < TICK_RATE; t++) sim.tick([neutralInput()]);
    expect(sim.aliveEnemyCount()).toBeGreaterThan(0);
    // Let the player's auto-fire clear the whole wave (weapons out-DPS wave 1)
    let cleared = false;
    for (let t = 0; t < TICK_RATE * 120 && !cleared; t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'waveCleared')) cleared = true;
    }
    expect(cleared).toBe(true);
    expect(sim.state.phase).toBe('cleared');
  });

  it('enemies scale up with wave number', () => {
    const sim = new Sim(5, 1);
    sim.state.wave = 1;
    const early = sim.spawnEnemy('snuffling', 5, 5);
    sim.state.wave = 8;
    const late = sim.spawnEnemy('snuffling', 6, 6);
    expect(late.maxHp).toBeGreaterThan(early.maxHp);
    expect(late.damage).toBeGreaterThan(early.damage);
  });

  it('elite spawns are stronger and drop chests often', () => {
    const sim = new Sim(5, 1);
    sim.state.wave = 1;
    const normal = sim.spawnEnemy('snuffling', 5, 5, false);
    const elite = sim.spawnEnemy('snuffling', 6, 6, true);
    expect(elite.maxHp).toBeGreaterThan(normal.maxHp);
    expect(elite.chestChance).toBeGreaterThan(0);
    expect(elite.elite).toBe(true);
  });
});

describe('splitter', () => {
  it('dandelion-popper splits into seeds on death', () => {
    const sim = new Sim(11, 1);
    const p = sim.state.players[0]!;
    sim.spawnEnemy('dandelion-popper', p.x + 1.5, p.y);
    let sawSeed = false;
    for (let t = 0; t < TICK_RATE * 20 && !sawSeed; t++) {
      sim.tick([neutralInput()]);
      if (sim.state.enemies.some((e) => e.defId === 'dandelion-seed')) sawSeed = true;
    }
    expect(sawSeed).toBe(true);
  });
});

describe('charger', () => {
  it('grumble-beetle telegraphs before charging', () => {
    const sim = new Sim(13, 1);
    const p = sim.state.players[0]!;
    const beetle = sim.spawnEnemy('grumble-beetle', p.x + 5, p.y);
    let sawTelegraph = false;
    for (let t = 0; t < TICK_RATE * 5 && !sawTelegraph; t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'chargeTelegraph' && e.instance === beetle.instance))
        sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
  });
});

describe('leveling', () => {
  it('XP grants levels with overflow across multiple levels', () => {
    const sim = new Sim(17, 1);
    const p = sim.state.players[0]!;
    // base 10, perLevel 5: L1→2 needs 10, L2→3 needs 15, L3→4 needs 20 (Σ=45)
    (sim as unknown as { grantXp(p: unknown, n: number): void }).grantXp(p, 50);
    expect(p.level).toBe(4);
    expect(p.xpIntoLevel).toBe(50 - 45);
    expect(p.pendingBoons).toBe(3);
  });
});

describe('burn kills attribute to the burning weapon', () => {
  it('candlestick burn DoT can finish a snuffling and credit the player', () => {
    const sim = new Sim(23, 1);
    const p = sim.state.players[0]!;
    p.weapons = [{ itemId: 'candlestick', cooldownLeft: 0, quality: 'standard', variant: null, holo: false, seedTag: 0 }];
    sim.spawnEnemy('snuffling', p.x + 1.2, p.y);
    for (let t = 0; t < TICK_RATE * 15 && sim.aliveEnemyCount() > 0; t++) sim.tick([neutralInput()]);
    expect(sim.aliveEnemyCount()).toBe(0);
    const items = sim.tracker.byPlayerItem.get(0);
    expect(items?.has('candlestick')).toBe(true);
  });
});
