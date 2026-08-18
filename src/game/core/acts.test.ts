import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput } from './input';
import { TICK_RATE } from './constants';
import { loadRegistry, getWave, maxWave } from '../data/registry';

const reg = loadRegistry();

describe('acts 2-4 data', () => {
  it('all four acts load with 10 waves each, every entry resolvable', () => {
    for (let act = 1; act <= 4; act++) {
      expect(maxWave(reg, act)).toBe(act * 10);
      for (let w = (act - 1) * 10 + 1; w <= act * 10; w++) {
        const wave = getWave(reg, act, w);
        for (const e of wave.entries) expect(reg.enemies.has(e.defId)).toBe(true);
      }
    }
  });

  it('each act ends in its boss', () => {
    expect(getWave(reg, 2, 20).entries[0]!.defId).toBe('ribbert');
    expect(getWave(reg, 3, 30).entries[0]!.defId).toBe('shiverina');
    expect(getWave(reg, 4, 40).entries[0]!.defId).toBe('grand-snuff');
  });
});

describe('act progression', () => {
  it('advanceAct moves to the next act first wave', () => {
    const sim = new Sim(1, 1);
    sim.startWaveNumber(10);
    sim.advanceAct();
    expect(sim.state.act).toBe(2);
    expect(sim.state.wave).toBe(11);
    expect(sim.state.phase).toBe('fighting');
  });

  it('act 2 wave spawns marsh enemies', () => {
    const sim = new Sim(2, 1);
    sim.state.act = 2;
    sim.startWaveNumber(11);
    for (let t = 0; t < TICK_RATE; t++) sim.tick([neutralInput()]);
    expect(sim.state.enemies.some((e) => e.defId === 'soggun')).toBe(true);
  });
});

describe('new archetypes', () => {
  it('lobber lays a damaging pool near the player', () => {
    const sim = new Sim(3, 1);
    const p = sim.state.players[0]!;
    p.weapons = []; // don't kill it
    sim.spawnEnemy('bubblim', p.x + 6, p.y);
    let sawPool = false;
    for (let t = 0; t < TICK_RATE * 8 && !sawPool; t++) {
      sim.tick([neutralInput()]);
      if (sim.state.pools.some((pool) => pool.active)) sawPool = true;
    }
    expect(sawPool).toBe(true);
  });

  it('standing in a pool hurts', () => {
    const sim = new Sim(4, 1);
    const p = sim.state.players[0]!;
    const pool = sim.state.pools[0]!;
    pool.active = true;
    pool.x = p.x;
    pool.y = p.y;
    pool.radius = 2;
    pool.dps = 4;
    pool.duration = 5;
    pool.tickIn = 0.1;
    pool.ownerDefId = 'bubblim';
    for (let t = 0; t < TICK_RATE * 2; t++) sim.tick([neutralInput()]);
    expect(sim.tracker.damageTakenByPlayer.get(0) ?? 0).toBeGreaterThan(0);
  });

  it('summoner calls reinforcements up to its cap', () => {
    const sim = new Sim(5, 1);
    const p = sim.state.players[0]!;
    p.weapons = [];
    sim.spawnEnemy('yodeler', p.x + 6, p.y);
    for (let t = 0; t < TICK_RATE * 10; t++) sim.tick([neutralInput()]);
    const minions = sim.state.enemies.filter((e) => e.defId === 'chatterjaw').length;
    expect(minions).toBeGreaterThan(0);
    expect(minions).toBeLessThanOrEqual(6);
  });

  it('buffer aura speeds up nearby enemies', () => {
    const sim = new Sim(6, 1);
    const p = sim.state.players[0]!;
    p.weapons = [];
    // Chaser alone vs chaser near a drizzlecloud: buffed one closes distance faster
    const lone = new Sim(6, 1);
    lone.state.players[0]!.weapons = [];
    const eA = sim.spawnEnemy('soggun', p.x + 12, p.y);
    sim.spawnEnemy('drizzlecloud', p.x + 12.5, p.y + 0.5);
    const eB = lone.spawnEnemy('soggun', lone.state.players[0]!.x + 12, lone.state.players[0]!.y);
    for (let t = 0; t < TICK_RATE * 2; t++) {
      sim.tick([neutralInput()]);
      lone.tick([neutralInput()]);
    }
    const distBuffed = Math.hypot(eA.x - p.x, eA.y - p.y);
    const distLone = Math.hypot(eB.x - lone.state.players[0]!.x, eB.y - lone.state.players[0]!.y);
    expect(distBuffed).toBeLessThan(distLone);
  });
});

describe('volley boss', () => {
  it('Ribbert phase 3 fires projectile volleys', () => {
    const sim = new Sim(7, 1);
    const p = sim.state.players[0]!;
    p.weapons = [];
    const boss = sim.spawnEnemy('ribbert', p.x + 6, p.y);
    boss.hp = boss.maxHp * 0.2; // straight to volley phase
    sim.state.phase = 'fighting';
    let sawVolley = false;
    for (let t = 0; t < TICK_RATE * 8 && !sawVolley; t++) {
      sim.tick([neutralInput()]);
      const enemyProjectiles = sim.state.projectiles.filter((pr) => pr.active && pr.fromPlayer < 0);
      if (enemyProjectiles.length >= 6) sawVolley = true;
    }
    expect(sawVolley).toBe(true);
  });
});

describe('endless mode', () => {
  it('generates escalating remix waves past 40', () => {
    const sim = new Sim(8, 1);
    sim.startEndlessWave(41);
    expect(sim.state.endless).toBe(true);
    expect(sim.hasNextWave()).toBe(true);
    for (let t = 0; t < TICK_RATE; t++) sim.tick([neutralInput()]);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
  });

  it('endless scaling compounds enemy strength', () => {
    const a = new Sim(9, 1);
    a.state.wave = 41;
    const weak = a.spawnEnemy('snuffling', 5, 5);
    a.state.wave = 60;
    const strong = a.spawnEnemy('snuffling', 6, 6);
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp * 2);
  });

  it('every 10th endless wave brings back a stirred boss', () => {
    const sim = new Sim(10, 1);
    sim.startEndlessWave(50);
    const hasBoss = sim.state.spawning.queue.some((q) =>
      ['mopsy', 'ribbert', 'shiverina', 'grand-snuff'].includes(q.defId),
    );
    expect(hasBoss).toBe(true);
  });
});
