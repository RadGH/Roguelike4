// Integration: a scripted fight through the real Sim — the same code the browser runs.

import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';

const idle = (): InputFrame => neutralInput();

function runTicks(sim: Sim, ticks: number, input: InputFrame = idle()) {
  for (let t = 0; t < ticks; t++) sim.tick([input]);
}

describe('scripted fight', () => {
  it('player auto-kills a nearby snuffling and collects its drops', () => {
    const sim = new Sim(42, 1);
    const p = sim.state.players[0]!;
    sim.spawnEnemy('snuffling', p.x + 1.5, p.y); // inside melee reach + auto-aim range
    runTicks(sim, TICK_RATE * 3);
    expect(sim.aliveEnemyCount()).toBe(0);
    // Sweep over the drop site like a real player would
    runTicks(sim, TICK_RATE, { ...idle(), moveX: 1 });
    runTicks(sim, TICK_RATE, { ...idle(), moveX: -1 });
    // Tracker attributed the kill and the damage to a real item
    expect(sim.tracker.killsByPlayer.get(0)).toBe(1);
    const items = sim.tracker.byPlayerItem.get(0)!;
    const total = [...items.values()].reduce((a, b) => a + b.total, 0);
    expect(total).toBeGreaterThan(0);
    expect([...items.keys()].every((k) => k === 'shortsword' || k === 'sling')).toBe(true);
    // Drops were picked up (mirrored gold + xp)
    expect(p.gold).toBeGreaterThan(0);
    expect(p.xp).toBeGreaterThan(0);
  });

  it('enemy contact damage hurts and can snuff the player', () => {
    const sim = new Sim(42, 1);
    const p = sim.state.players[0]!;
    // Ring of snufflings on top of the player, player has no escape input
    for (let i = 0; i < 8; i++) sim.spawnEnemy('snuffling', p.x + 0.5, p.y + 0.5);
    runTicks(sim, TICK_RATE * 10);
    expect(sim.tracker.damageTakenByPlayer.get(0) ?? 0).toBeGreaterThan(0);
  });

  it('shooter keeps distance and fires projectiles that can hit', () => {
    const sim = new Sim(7, 1);
    const p = sim.state.players[0]!;
    sim.spawnEnemy('thistle-archer', p.x + 6, p.y);
    let sawEnemyProjectile = false;
    for (let t = 0; t < TICK_RATE * 6; t++) {
      sim.tick([idle()]);
      if (sim.state.projectiles.some((pr) => pr.active && pr.fromPlayer < 0)) sawEnemyProjectile = true;
    }
    expect(sawEnemyProjectile).toBe(true);
  });

  it('combo streak boosts XP drops', () => {
    const a = new Sim(9, 1);
    // Kill several enemies rapidly → later kills drop more XP than the first
    const p = a.state.players[0]!;
    for (let i = 0; i < 6; i++) a.spawnEnemy('snuffling', p.x + 1.2, p.y + (i - 3) * 0.2);
    runTicks(a, TICK_RATE * 6);
    // Sweep the battlefield to vacuum every orb
    runTicks(a, TICK_RATE, { ...idle(), moveX: 1 });
    runTicks(a, TICK_RATE * 2, { ...idle(), moveX: -1 });
    runTicks(a, TICK_RATE, { ...idle(), moveX: 1 });
    expect(a.state.combo.best).toBeGreaterThanOrEqual(3);
    // 6 snufflings at base xp 2 each = 12 without combo; combo must push it higher
    expect(p.xp).toBeGreaterThan(12);
  });

  it('full-fight determinism: same seed → identical hash', () => {
    const mk = () => {
      const sim = new Sim(1234, 1);
      sim.startWave([
        { defId: 'snuffling', count: 6, atSecond: 0 },
        { defId: 'thistle-archer', count: 2, atSecond: 2 },
      ]);
      const input: InputFrame = { ...neutralInput(), moveX: 0.4, moveY: 0.2 };
      for (let t = 0; t < TICK_RATE * 12; t++) sim.tick([input]);
      return sim.hash();
    };
    expect(mk()).toBe(mk());
  });
});
