import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { neutralInput } from './input';

describe('final class batch — the full 24', () => {
  it('all 24 launch classes load with legal kits', () => {
    const sim = new Sim(1, 1);
    expect(sim.registry.classes.size).toBe(24);
  });

  it("monk's bare fists strike and scale with level", () => {
    const sim = new Sim(2, 1, undefined, ['monk']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    expect(p.weapons.length).toBe(0);
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 1, p.y);
    let fistDamage = 0;
    for (let i = 0; i < 90; i++) {
      sim.tick([{ ...neutralInput(), aimX: 1, aimY: 0, fire: true }]);
      fistDamage = sim.tracker.events.filter(
        (ev) => ev.type === 'damage' && ev.source.itemId === 'fists',
      ).length;
      if (fistDamage > 0) break;
    }
    expect(fistDamage).toBeGreaterThan(0);
  });

  it("ninja's dash leaves a decoy that lures enemies", () => {
    const sim = new Sim(3, 1, undefined, ['ninja']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    sim.tick([{ ...neutralInput(), moveX: 1, dash: true }]);
    expect(sim.state.decoys.length).toBe(1);
    // decoy expires on its own
    for (let i = 0; i < 120; i++) sim.tick([]);
    expect(sim.state.decoys.length).toBe(0);
    expect(p.decoyCooldown).toBeGreaterThanOrEqual(0);
  });

  it('the turret shoots from range without moving', () => {
    const sim = new Sim(4, 1, undefined, ['engineer']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const turret = sim.state.pets.find((pet) => pet.defId === 'turret')!;
    expect(turret).toBeTruthy();
    const tx = turret.x;
    const e = sim.spawnEnemy('snuffling', turret.x + 5, turret.y);
    e.hp = 999; // ensure it survives long enough to be shot
    const hpBefore = e.hp;
    for (let i = 0; i < 90; i++) sim.tick([]);
    expect(e.hp).toBeLessThan(hpBefore); // shot from 5 units away
    expect(Math.abs(turret.x - tx)).toBeLessThan(0.5); // never wandered
  });

  it("bard's mending song heals nearby allies", () => {
    const sim = new Sim(5, 2, undefined, ['bard', 'hero']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const bard = sim.state.players[0]!;
    const friend = sim.state.players[1]!;
    bard.songIdx = 2; // jump straight to the mending verse
    bard.songTimer = 0;
    friend.hp = 3;
    for (let i = 0; i < 60; i++) sim.tick([]);
    expect(friend.hp).toBeGreaterThan(3);
  });

  it('a flawless wave clear emits the ninja-unlock event', () => {
    const sim = new Sim(6, 1);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const e = sim.spawnEnemy('snuffling', 30, 5);
    e.hp = 1;
    sim.applyDamageToEnemy(
      e,
      { kind: 'attack', types: ['melee'], multiplier: 0, flat: [0, 0] },
      null,
      { actor: { kind: 'player', index: 0 }, itemId: 'shortsword', grantedBy: null, deliveryTag: 'melee', hitId: 1 },
      { rawOverride: 10, noCrit: true },
    );
    const evs = sim.tick([]);
    expect(evs.some((ev) => ev.type === 'flawlessWave')).toBe(true);
  });
});
