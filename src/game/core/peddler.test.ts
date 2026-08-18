import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { stat } from './stats';

describe('wandering peddler', () => {
  it('visits on waves 3/6/9 of every act, including endless-numbered waves', () => {
    const sim = new Sim(1, 1);
    const visit = (w: number) => {
      sim.state.wave = w;
      return sim.peddlerVisiting();
    };
    expect(visit(3)).toBe(true);
    expect(visit(6)).toBe(true);
    expect(visit(9)).toBe(true);
    expect(visit(1)).toBe(false);
    expect(visit(10)).toBe(false);
    expect(visit(13)).toBe(true); // act 2, wave-in-act 3
    expect(visit(20)).toBe(false);
    expect(visit(43)).toBe(true); // endless keeps the rhythm
  });

  it('stock is class-filtered items plus the Wax Snack, priced by act', () => {
    const sim = new Sim(2, 1, undefined, ['fighter']);
    for (const id of sim.registry.weapons.keys()) sim.unlockedItems.add(id);
    const stock = sim.rollPeddlerStock(0);
    expect(stock.length).toBe(sim.registry.balance.peddler.stockSize + 1);
    expect(stock[stock.length - 1]!.kind).toBe('snack');
    const base = sim.registry.balance.peddler.itemPriceBase;
    for (const o of stock) {
      if (o.kind !== 'snack') {
        expect(o.price).toBe(base); // act 1 → no per-act markup
        // fighter denies spells — the peddler respects the filter
        if (o.kind === 'weapon') {
          const def = sim.registry.weapons.get(o.inst.itemId)!;
          expect(def.tags.some((t) => sim.registry.classes.get('fighter')!.denyTags?.includes(t))).toBe(
            false,
          );
        }
      }
    }
    // act scaling
    sim.state.act = 3;
    const stock3 = sim.rollPeddlerStock(0);
    const item3 = stock3.find((o) => o.kind !== 'snack');
    expect(item3?.price).toBe(base + sim.registry.balance.peddler.itemPricePerAct * 2);
  });

  it('spending gold is personal and bounded', () => {
    const sim = new Sim(3, 2);
    sim.state.players[0]!.gold = 50;
    sim.state.players[1]!.gold = 50;
    expect(sim.spendGold(0, 30)).toBe(true);
    expect(sim.state.players[0]!.gold).toBe(20);
    expect(sim.state.players[1]!.gold).toBe(50); // partner's wallet untouched
    expect(sim.spendGold(0, 30)).toBe(false); // can't overdraw
    expect(sim.state.players[0]!.gold).toBe(20);
  });

  it('the Wax Snack heals to full', () => {
    const sim = new Sim(4, 1);
    const p = sim.state.players[0]!;
    p.hp = 3;
    sim.eatSnack(0);
    expect(p.hp).toBe(stat(p.stats, 'maxHp'));
  });
});
