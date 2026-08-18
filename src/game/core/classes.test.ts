import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';
import { loadRegistry } from '../data/registry';

const reg = loadRegistry();
const idle = (): InputFrame => neutralInput();

describe('class definitions', () => {
  it('all six launch classes load; hero is the only default', () => {
    expect(reg.classes.size).toBeGreaterThanOrEqual(6);
    const defaults = [...reg.classes.values()].filter((c) => c.unlock.type === 'default');
    expect(defaults.map((c) => c.id)).toEqual(['hero']);
  });

  it('every unlockable class has a deed that actually unlocks it', () => {
    for (const c of reg.classes.values()) {
      if (c.unlock.type !== 'deed') continue;
      const deed = reg.deeds.get(c.unlock.deedId)!;
      expect(deed.unlocks.some((u) => u.type === 'class' && u.id === c.id)).toBe(true);
    }
  });
});

describe('class creation', () => {
  it('classes get their starting weapons and stat mods', () => {
    const sim = new Sim(1, 2, undefined, ['fighter', 'mage']);
    const [fighter, mage] = sim.state.players as [
      (typeof sim.state.players)[0],
      (typeof sim.state.players)[0],
    ];
    expect(fighter.classId).toBe('fighter');
    expect(fighter.weapons.map((w) => w.itemId)).toEqual(['shortsword', 'hatchet']);
    expect(fighter.stats.maxHp).toBeGreaterThan(12); // base 10 + class 4 (+weapons)
    expect(mage.weapons.map((w) => w.itemId)).toEqual(['wand']);
    expect(mage.stats.fireDamage ?? 0).toBeGreaterThan(0);
  });

  it('deny tags gate chest rolls: mage never sees physical weapons', () => {
    const sim = new Sim(2, 1, undefined, ['mage']);
    for (let i = 0; i < 40; i++) {
      for (const id of sim.rollWeaponChoices(0, 3)) {
        const w = reg.weapons.get(id)!;
        expect(w.tags).not.toContain('physical');
      }
    }
  });
});

describe('hand points', () => {
  it('fighter (4 pts) can stack weapons; hero (2 pts) cannot', () => {
    const sim = new Sim(3, 2, undefined, ['fighter', 'hero']);
    // fighter starts with 2×1H → 2 points free
    expect(sim.equipWeapon(0, 'dagger')).toBe(true);
    expect(sim.equipWeapon(0, 'sling')).toBe(true);
    expect(sim.equipWeapon(0, 'firecracker')).toBe(false); // full at 4
    // hero starts with 2×1H → full at 2
    expect(sim.equipWeapon(1, 'dagger')).toBe(false);
  });

  it('replace cannot overflow points (1H → 2H on a full fighter)', () => {
    const sim = new Sim(4, 1, undefined, ['fighter']);
    sim.equipWeapon(0, 'dagger');
    sim.equipWeapon(0, 'hatchet'); // 4/4 used
    const p = sim.state.players[0]!;
    sim.replaceWeapon(0, 0, 'greatclub'); // 2H over cap → refused
    expect(p.weapons[0]!.itemId).toBe('shortsword');
    sim.replaceWeapon(0, 0, 'dagger'); // 1H↔1H fine
    expect(p.weapons[0]!.itemId).toBe('dagger');
  });
});

describe('mechanics', () => {
  it('redline: berserker at low HP hits much harder', () => {
    const mk = (hpFrac: number) => {
      const sim = new Sim(5, 1, undefined, ['berserker']);
      const p = sim.state.players[0]!;
      p.hp = (p.stats.maxHp ?? 10) * hpFrac;
      p.iframeTimer = 9999; // isolate the mechanic — dummy can't hit back
      const e = sim.spawnEnemy('grand-snuff', p.x + 1.5, p.y); // unkillable-in-2s target
      for (let t = 0; t < TICK_RATE * 2; t++) sim.tick([idle()]);
      return e.maxHp - e.hp;
    };
    expect(mk(0.1)).toBeGreaterThan(mk(1) * 1.4);
  });

  it('redline: healing never exceeds 80% max HP', () => {
    const sim = new Sim(6, 1, undefined, ['berserker']);
    const p = sim.state.players[0]!;
    p.hp = 1;
    sim.healPlayer(p, 9999, null);
    expect(p.hp).toBeLessThanOrEqual((p.stats.maxHp ?? 10) * 0.8 + 0.001);
  });

  it('redthirst: vampire lifesteals from weapon damage and it feeds the deed', () => {
    const sim = new Sim(7, 1, undefined, ['vampire']);
    const p = sim.state.players[0]!;
    p.hp = 3;
    p.iframeTimer = 9999; // isolate lifesteal — dummy can't hit back
    sim.spawnEnemy('snuffling', p.x + 1.2, p.y);
    for (let t = 0; t < TICK_RATE * 4; t++) sim.tick([idle()]);
    const heals = sim.tracker.events.filter(
      (e) => e.type === 'heal' && e.source.grantedBy === 'lifesteal',
    );
    expect(heals.length).toBeGreaterThan(0);
    expect(p.hp).toBeGreaterThan(3);
  });

  it('ironhide: fighter armor partially reduces spell damage', () => {
    const sim = new Sim(8, 1, undefined, ['fighter']);
    const p = sim.state.players[0]!;
    p.stats.armor = 50;
    sim.recomputeStats(p);
    p.defense.armor = 50; // force armor for the check
    p.defense.armorVsSpellsFrac = 0.25;
    expect(p.defense.armorVsSpellsFrac).toBe(0.25);
  });

  it('backspin: rogue dash-through guarantees a crit on the next hit', () => {
    const sim = new Sim(9, 1, undefined, ['rogue']);
    const p = sim.state.players[0]!;
    p.stats.critChance = 0; // remove randomness
    p.guaranteedCrit = true;
    sim.spawnEnemy('snuffling', p.x + 1.2, p.y);
    let sawCrit = false;
    for (let t = 0; t < TICK_RATE * 3 && !sawCrit; t++) {
      sim.tick([idle()]);
      if (sim.tracker.events.some((e) => e.type === 'damage' && e.crit)) sawCrit = true;
    }
    expect(sawCrit).toBe(true);
    expect(p.guaranteedCrit).toBe(false); // consumed
  });
});

describe('class level-up items', () => {
  it('mage queues the level-2 spell choice', () => {
    const sim = new Sim(10, 1, undefined, ['mage']);
    const p = sim.state.players[0]!;
    sim.grantXpTo(0, 10); // level 2
    expect(p.level).toBe(2);
    expect(p.pendingClassItems.length).toBe(1);
    expect(p.pendingClassItems[0]).toEqual(['fireball', 'lightning-bolt', 'frostbolt']);
    // Equipping the class grant bypasses account locks (fireball is deed-locked)
    expect(sim.equipWeapon(0, 'fireball')).toBe(true);
    expect(p.weapons.some((w) => w.itemId === 'fireball')).toBe(true);
  });
});
