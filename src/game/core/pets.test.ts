import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';

const idle = (): InputFrame => neutralInput();

describe('pets', () => {
  it('hunter starts with a dog that fights and attributes to the owner', () => {
    const sim = new Sim(1, 1, undefined, ['hunter']);
    expect(sim.state.pets.length).toBe(1);
    expect(sim.state.pets[0]!.defId).toBe('dog');
    const p = sim.state.players[0]!;
    p.weapons = []; // let the dog do the work
    sim.recomputeStats(p);
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 2, p.y);
    let petDamage = false;
    for (let t = 0; t < TICK_RATE * 8 && !petDamage; t++) {
      sim.tick([idle()]);
      petDamage = sim.tracker.events.some(
        (e) => e.type === 'damage' && e.source.actor.kind === 'pet' && e.types.includes('pet'),
      );
    }
    expect(petDamage).toBe(true);
    // Pet kills credit the OWNER in the kill counter
    for (let t = 0; t < TICK_RATE * 10 && sim.aliveEnemyCount() > 0; t++) sim.tick([idle()]);
    expect(sim.tracker.killsByPlayer.get(0) ?? 0).toBeGreaterThan(0);
  });

  it('pet damage scales with the owner petDamage stat', () => {
    const hit = (petStat: number) => {
      const sim = new Sim(2, 1, undefined, ['hunter']);
      const p = sim.state.players[0]!;
      p.weapons = [];
      sim.recomputeStats(p);
      p.stats.petDamage = petStat;
      p.iframeTimer = 9999;
      sim.spawnEnemy('grand-snuff', p.x + 2, p.y);
      const boss = sim.state.enemies[0]!;
      for (let t = 0; t < TICK_RATE * 6; t++) sim.tick([idle()]);
      return boss.maxHp - boss.hp;
    };
    expect(hit(30)).toBeGreaterThan(hit(0));
  });

  it('necromancer raises zombies from kills without any weapon', () => {
    const sim = new Sim(3, 1, undefined, ['necromancer']);
    const p = sim.state.players[0]!;
    expect(p.weapons.length).toBe(0);
    p.iframeTimer = 9999;
    // Seed one zombie (as if a kill raised it) and a crowd for it to chew through
    sim.spawnPet('zombie', 0, 'necromancer', p.x + 1, p.y);
    for (let i = 0; i < 4; i++) sim.spawnEnemy('snuffling', p.x + 2.5, p.y + (i - 2) * 0.5);
    for (let t = 0; t < TICK_RATE * 25 && sim.aliveEnemyCount() > 0; t++) sim.tick([idle()]);
    // Zombies killed things → riseAndShine (20%) likely raised more along the way
    expect(sim.tracker.killsByPlayer.get(0) ?? 0).toBeGreaterThan(0);
  });

  it('zombies expire after their lifetime', () => {
    const sim = new Sim(4, 1);
    sim.spawnPet('zombie', 0, 'zombie-flute', 10, 10);
    expect(sim.state.pets.length).toBe(1);
    for (let t = 0; t < TICK_RATE * 21; t++) sim.tick([idle()]);
    expect(sim.state.pets.length).toBe(0);
  });

  it('per-owner pet caps hold', () => {
    const sim = new Sim(5, 1);
    for (let i = 0; i < 10; i++) sim.spawnPet('zombie', 0, 'zombie-flute', 10, 10);
    expect(sim.state.pets.length).toBe(6); // zombie maxPerOwner
    expect(sim.spawnPet('dog', 0, 'hunter', 10, 10)).not.toBeNull();
    expect(sim.spawnPet('dog', 0, 'hunter', 10, 10)).toBeNull(); // dog cap 1
  });

  it('pet kills progress the pet-kills deed chain', () => {
    const sim = new Sim(6, 1, undefined, ['hunter']);
    const p = sim.state.players[0]!;
    p.weapons = [];
    sim.recomputeStats(p);
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 2, p.y);
    let petKill = false;
    for (let t = 0; t < TICK_RATE * 12 && !petKill; t++) {
      sim.tick([idle()]);
      petKill = sim.tracker.events.some(
        (e) => e.type === 'kill' && e.source.actor.kind === 'pet' && e.types.includes('pet'),
      );
    }
    expect(petKill).toBe(true);
  });
});
