import { describe, expect, it } from 'vitest';
import { freshProfile } from './profile';
import { buyClass, buyItem, buyUpgrade, SHOPS, townBonuses, upgradePrice } from './shop';
import { loadRegistry } from '../data/registry';
import { Sim } from '../core/sim';

const reg = loadRegistry();

describe('shop data integrity', () => {
  it('every shop class/item id exists in the registry', () => {
    for (const c of SHOPS.flick.classes) expect(reg.classes.has(c.id)).toBe(true);
    for (const it of SHOPS.cinder.items) {
      expect(reg.weapons.has(it.id) || reg.passives.has(it.id)).toBe(true);
    }
  });

  it('every deed-locked class is purchasable at Flick (no orphan classes)', () => {
    for (const c of reg.classes.values()) {
      if (c.unlock.type === 'deed') {
        expect(SHOPS.flick.classes.some((s) => s.id === c.id)).toBe(true);
      }
    }
  });
});

describe('purchases', () => {
  it('buying a class spends glimmers and unlocks it; double-buy refused', () => {
    const p = freshProfile();
    p.glimmers = 20;
    expect(buyClass(p, 'fighter', 15).ok).toBe(true);
    expect(p.glimmers).toBe(5);
    expect(p.unlockedClasses).toContain('fighter');
    expect(buyClass(p, 'fighter', 15)).toEqual({ ok: false, reason: 'owned' });
    expect(buyClass(p, 'rogue', 15)).toEqual({ ok: false, reason: 'poor' });
  });

  it('buying an item unlocks it for drops', () => {
    const p = freshProfile();
    p.glimmers = 10;
    expect(buyItem(p, 'fireball', 8).ok).toBe(true);
    expect(p.unlockedItems).toContain('fireball');
  });

  it('upgrades level up with rising prices and cap at maxLevel', () => {
    const p = freshProfile();
    p.glimmers = 999;
    const hp = SHOPS.mayor.upgrades.find((u) => u.id === 'startHp')!;
    expect(upgradePrice(hp, 0)).toBe(3);
    for (let i = 0; i < hp.maxLevel; i++) expect(buyUpgrade(p, hp).ok).toBe(true);
    expect(buyUpgrade(p, hp)).toEqual({ ok: false, reason: 'maxed' });
    expect(p.townUpgrades.startHp).toBe(hp.maxLevel);
  });
});

describe('town bonuses reach the run', () => {
  it('startHp/startDamage/startBits apply to players at run start', () => {
    const p = freshProfile();
    p.townUpgrades = { startHp: 3, startDamage: 1, startBits: 2 };
    const { grants, startBits } = townBonuses(p);
    const sim = new Sim(1, 1);
    const before = sim.state.players[0]!.stats.maxHp ?? 0;
    sim.setTownBonuses(grants, startBits);
    const player = sim.state.players[0]!;
    expect(player.stats.maxHp ?? 0).toBeCloseTo(before + 3, 5);
    expect(player.stats.meleeDamage ?? 0).toBeGreaterThan(0);
    expect(player.bits).toBe(4);
    expect(player.hp).toBeCloseTo(player.stats.maxHp!, 5); // starts topped up
  });
});
