import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';

const idle = (): InputFrame => neutralInput();

describe('passive grants', () => {
  it('lodestone charm boosts pickup radius; greedy gauntlet trades gold for xp', () => {
    const sim = new Sim(1, 1);
    const p = sim.state.players[0]!;
    const before = p.stats.pickupRadius ?? 0;
    sim.addPassive(0, 'lodestone-charm');
    expect(p.stats.pickupRadius ?? 0).toBeCloseTo(before * 1.5, 3);
    sim.addPassive(0, 'greedy-gauntlet');
    expect(p.stats.goldGain).toBeCloseTo(0.3, 5);
    expect(p.stats.xpGain).toBeCloseTo(-0.1, 5);
  });

  it('goldGain multiplies mirrored gold per receiver', () => {
    const sim = new Sim(2, 2);
    sim.addPassive(0, 'greedy-gauntlet'); // P1 +30% gold, P2 plain
    const p0 = sim.state.players[0]!;
    (sim as unknown as { collectGold(p: unknown, n: number, v: null): void }).collectGold(p0, 10, null);
    expect(sim.state.players[0]!.gold).toBe(13);
    expect(sim.state.players[1]!.gold).toBe(10);
  });
});

describe('triggers', () => {
  it("magpie's eye can pocket gold straight from the drop", () => {
    const sim = new Sim(3, 1);
    sim.addPassive(0, 'magpies-eye');
    const p = sim.state.players[0]!;
    // Far-away drops: only the trigger can collect them. 10% × 60 drops ≈ certain.
    for (let i = 0; i < 60; i++) {
      (sim as unknown as { dropPickup(x: number, y: number, k: string, a: number): void }).dropPickup(
        1,
        1,
        'gold',
        1,
      );
    }
    expect(p.gold).toBeGreaterThan(0);
  });

  it('powder keg belt pools burn other enemies after a kill', () => {
    const sim = new Sim(4, 1);
    // Force the trigger to always fire for the test
    const keg = sim.registry.passives.get('powder-keg-belt')!;
    const original = keg.triggers[0]!.chance;
    keg.triggers[0]!.chance = 1;
    sim.addPassive(0, 'powder-keg-belt');
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 1.3, p.y);
    sim.spawnEnemy('pillowman', p.x + 1.6, p.y); // tanky bystander stands in the fire
    let sawFriendlyPool = false;
    let poolDamage = false;
    for (let t = 0; t < TICK_RATE * 8 && !poolDamage; t++) {
      sim.tick([idle()]);
      if (sim.state.pools.some((pl) => pl.active && pl.friendly)) sawFriendlyPool = true;
      poolDamage = sim.tracker.events.some(
        (e) => e.type === 'damage' && e.source.itemId === 'powder-keg-belt',
      );
    }
    keg.triggers[0]!.chance = original;
    expect(sawFriendlyPool).toBe(true);
    expect(poolDamage).toBe(true);
  });

  it('second wick survives exactly one fatal blow per run', () => {
    const sim = new Sim(5, 1);
    sim.addPassive(0, 'second-wick');
    const p = sim.state.players[0]!;
    p.hp = 1;
    const def = sim.registry.enemies.get('snuffling')!;
    (sim as unknown as { damagePlayer(p: unknown, n: number, d: unknown, t: string): void }).damagePlayer(
      p,
      999,
      def,
      'contact',
    );
    expect(p.alive).toBe(true);
    expect(p.usedSecondWick).toBe(true);
    p.iframeTimer = 0;
    (sim as unknown as { damagePlayer(p: unknown, n: number, d: unknown, t: string): void }).damagePlayer(
      p,
      999,
      def,
      'contact',
    );
    expect(p.alive).toBe(false);
  });

  it('storm anklet chains lightning off melee hits with item attribution', () => {
    const sim = new Sim(6, 1);
    const anklet = sim.registry.passives.get('storm-anklet')!;
    const original = anklet.triggers[0]!.chance;
    anklet.triggers[0]!.chance = 1;
    sim.addPassive(0, 'storm-anklet');
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    sim.spawnEnemy('pillowman', p.x + 1.5, p.y);
    sim.spawnEnemy('pillowman', p.x + 3, p.y);
    let sawChain = false;
    for (let t = 0; t < TICK_RATE * 3 && !sawChain; t++) {
      sim.tick([idle()]);
      sawChain = sim.tracker.events.some(
        (e) => e.type === 'damage' && e.source.itemId === 'storm-anklet' && e.types.includes('lightning'),
      );
    }
    anklet.triggers[0]!.chance = original;
    expect(sawChain).toBe(true);
  });

  it('coin-operated blade converts gold into one big hit', () => {
    const sim = new Sim(7, 1);
    sim.addPassive(0, 'coin-operated-blade');
    const p = sim.state.players[0]!;
    (sim as unknown as { collectGold(p: unknown, n: number, v: null): void }).collectGold(p, 30, null);
    expect(p.coinCharge).toBeCloseTo(0.3, 5);
    p.iframeTimer = 9999;
    sim.spawnEnemy('grand-snuff', p.x + 1.5, p.y);
    for (let t = 0; t < TICK_RATE && p.coinCharge > 0; t++) sim.tick([idle()]);
    expect(p.coinCharge).toBe(0); // spent on the next hit
  });
});

describe('projectile mods', () => {
  it('splitter prism forks projectiles on impact', () => {
    const sim = new Sim(8, 1);
    sim.addPassive(0, 'splitter-prism');
    const p = sim.state.players[0]!;
    p.weapons = [{ itemId: 'sling', cooldownLeft: 0, quality: 'standard', variant: null, holo: false, seedTag: 0 }];
    sim.recomputeStats(p);
    p.iframeTimer = 9999;
    sim.spawnEnemy('grand-snuff', p.x + 5, p.y);
    let sawChild = false;
    for (let t = 0; t < TICK_RATE * 4 && !sawChild; t++) {
      sim.tick([idle()]);
      if (sim.state.projectiles.some((pr) => pr.active && pr.isChild)) sawChild = true;
    }
    expect(sawChild).toBe(true);
  });

  it('lucky ribbon is recognized as the 5-boon mod', () => {
    const sim = new Sim(9, 1);
    const p = sim.state.players[0]!;
    expect(sim.hasMod(p, 'boonChoices5')).toBe(false);
    sim.addPassive(0, 'lucky-ribbon');
    expect(sim.hasMod(p, 'boonChoices5')).toBe(true);
  });
});

describe('chest pools', () => {
  it('mixed chest rolls can offer passives; owned passives never repeat', () => {
    const sim = new Sim(10, 1);
    let sawPassive = false;
    for (let i = 0; i < 40 && !sawPassive; i++) {
      for (const offer of sim.rollChestChoices(0, 3)) {
        if (offer.kind === 'passive') sawPassive = true;
      }
    }
    expect(sawPassive).toBe(true);
    // Own everything ownable → no repeats offered
    for (const id of sim.registry.passives.keys()) {
      if (!sim.registry.passives.get(id)!.unlockDeed) sim.addPassive(0, id);
    }
    for (let i = 0; i < 20; i++) {
      for (const offer of sim.rollChestChoices(0, 3)) {
        if (offer.kind === 'passive') expect(sim.state.players[0]!.passives).not.toContain(offer.id);
      }
    }
  });
});
