import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { standardInstance } from './items';

describe('satchel', () => {
  it('stashes, equips when legal, and salvages into bits', () => {
    const sim = new Sim(1, 1, undefined, ['fighter']); // 4 points, 2 used
    const p = sim.state.players[0]!;
    sim.stashWeapon(0, standardInstance('mace'));
    sim.stashWeapon(0, standardInstance('wand')); // fighter refuses spells
    expect(p.satchel.length).toBe(2);

    expect(sim.equipFromSatchel(0, 1)).toBe(false); // wand: class-illegal stays stashed
    expect(sim.equipFromSatchel(0, 0)).toBe(true); // mace fits free points
    expect(p.weapons.some((w) => w.itemId === 'mace')).toBe(true);
    expect(p.satchel.length).toBe(1);

    const bitsBefore = p.bits;
    expect(sim.salvageFromSatchel(0, 0)).toBe(true);
    expect(p.bits).toBe(bitsBefore + 2);
    expect(p.satchel.length).toBe(0);
  });

  it('capacity still rules: a full-handed hero cannot equip from the satchel', () => {
    const sim = new Sim(2, 1, undefined, ['hero']); // 2 points, both used
    sim.stashWeapon(0, standardInstance('mace'));
    expect(sim.equipFromSatchel(0, 0)).toBe(false);
    expect(sim.state.players[0]!.satchel.length).toBe(1); // stays safe in the bag
  });
});
