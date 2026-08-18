import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';
import { loadRegistry } from '../data/registry';
import { resolveWeapon, standardInstance, type WeaponInstance } from './items';

const reg = loadRegistry();
const idle = (): InputFrame => neutralInput();

const inst = (partial: Partial<WeaponInstance>): WeaponInstance => ({
  itemId: 'shortsword',
  quality: 'standard',
  variant: null,
  holo: false,
  seedTag: 7,
  ...partial,
});

describe('quality tiers', () => {
  it('masterwork multiplies damage and grants ×1.5; rusty ×0.8', () => {
    const std = resolveWeapon(reg, inst({}));
    const master = resolveWeapon(reg, inst({ quality: 'masterwork' }));
    const rusty = resolveWeapon(reg, inst({ quality: 'rusty' }));
    expect(master.multiplier).toBeCloseTo(std.multiplier * 1.5, 5);
    expect(rusty.flat[0]).toBeCloseTo(std.flat[0] * 0.8, 5);
    expect(master.grants[0]!.flat!).toBeCloseTo(std.grants[0]!.flat! * 1.5, 5);
    expect(master.label).toBe('Masterwork');
  });

  it('quality changes stats through the whole player pipeline', () => {
    const sim = new Sim(1, 1);
    const p = sim.state.players[0]!;
    const before = p.stats.meleeDamage ?? 0; // rusty starting kit
    p.weapons[0]!.quality = 'masterwork';
    sim.recomputeStats(p);
    expect(p.stats.meleeDamage ?? 0).toBeGreaterThan(before);
  });
});

describe('variants', () => {
  it('corrupted shortsword deals fire and counts as a spell', () => {
    const r = resolveWeapon(reg, inst({ variant: 'corrupted' }));
    expect(r.types).toEqual(['fire']);
    expect(r.kind).toBe('spell');
    expect(r.grants.some((g) => g.stat === 'fireDamage')).toBe(true);
    expect(r.label).toContain('Corrupted');
  });

  it('corrupted fireball turns to ice', () => {
    const r = resolveWeapon(reg, inst({ itemId: 'fireball', variant: 'corrupted' }));
    expect(r.types).toEqual(['ice']);
  });

  it('cursed items boost one stat and add a negative rider', () => {
    const std = resolveWeapon(reg, inst({}));
    const cursed = resolveWeapon(reg, inst({ variant: 'cursed', seedTag: 0 }));
    expect(cursed.grants.length).toBe(std.grants.length + 1);
    const boosted = cursed.grants[0]!;
    expect(boosted.flat!).toBeCloseTo(std.grants[0]!.flat! * 1.5, 5);
    const rider = cursed.grants[cursed.grants.length - 1]!;
    expect((rider.flat ?? 0) < 0).toBe(true);
  });

  it('relic items gain 1-2 extra grants; holographic ×1.05', () => {
    const std = resolveWeapon(reg, inst({}));
    const relic = resolveWeapon(reg, inst({ variant: 'relic', seedTag: 4 }));
    expect(relic.grants.length).toBeGreaterThan(std.grants.length);
    const holo = resolveWeapon(reg, inst({ holo: true }));
    expect(holo.multiplier).toBeCloseTo(std.multiplier * 1.05, 5);
    expect(holo.label).toContain('✨');
  });

  it('resolution is deterministic — same instance, same result', () => {
    const a = resolveWeapon(reg, inst({ variant: 'relic', seedTag: 42 }));
    const b = resolveWeapon(reg, inst({ variant: 'relic', seedTag: 42 }));
    expect(a).toEqual(b);
  });

  it('corrupted melee kills count as fire kills (deed chain works)', () => {
    const sim = new Sim(3, 1);
    const p = sim.state.players[0]!;
    p.weapons = [{ ...inst({ variant: 'corrupted' }), cooldownLeft: 0 }];
    sim.recomputeStats(p);
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 1.3, p.y);
    let fireKill = false;
    for (let t = 0; t < TICK_RATE * 5 && !fireKill; t++) {
      sim.tick([idle()]);
      fireKill = sim.tracker.events.some((e) => e.type === 'kill' && e.types.includes('fire'));
    }
    expect(fireKill).toBe(true);
  });
});

describe('drops & tinkering', () => {
  it('rollWeaponInstance quality odds improve with the wave', () => {
    const early = new Sim(5, 1);
    early.state.wave = 1;
    const late = new Sim(5, 1);
    late.state.wave = 35;
    const score = (sim: Sim) => {
      const order = ['rusty', 'standard', 'fine', 'superb', 'masterwork'];
      let total = 0;
      for (let i = 0; i < 300; i++) total += order.indexOf(sim.rollWeaponInstance('shortsword').quality);
      return total;
    };
    expect(score(late)).toBeGreaterThan(score(early));
  });

  it('salvage bits buy quality upgrades with rising costs', () => {
    const sim = new Sim(6, 1);
    const p = sim.state.players[0]!;
    p.weapons = [{ ...standardInstance('shortsword'), cooldownLeft: 0 }];
    sim.recomputeStats(p);
    p.bits = 5;
    expect(sim.tinker(0, 0)).toBe(true); // standard→fine costs 2
    expect(p.weapons[0]!.quality).toBe('fine');
    expect(p.bits).toBe(3);
    expect(sim.tinker(0, 0)).toBe(true); // fine→superb costs 3
    expect(p.bits).toBe(0);
    expect(sim.tinker(0, 0)).toBe(false); // superb→masterwork costs 5, can't afford
  });
});
