import { describe, expect, it } from 'vitest';
import { runHeadless } from './runner';

describe('headless runner', () => {
  it('pilots a full bot run through the real sim', () => {
    const r = runHeadless({ seed: 42, classIds: ['hero'], allUnlocked: true, untilWave: 3 });
    expect(r.waveReached).toBeGreaterThanOrEqual(2);
    expect(r.kills).toBeGreaterThan(5);
    expect(r.damageDealt).toBeGreaterThan(0);
  });

  it('is deterministic: same seed → same outcome', () => {
    const a = runHeadless({ seed: 777, classIds: ['hero'], untilWave: 3 });
    const b = runHeadless({ seed: 777, classIds: ['hero'], untilWave: 3 });
    expect(a).toEqual(b);
  });

  it('handles the weaponless necromancer without crashing', () => {
    const r = runHeadless({ seed: 5, classIds: ['necromancer'], allUnlocked: true, untilWave: 2 });
    expect(r.ticks).toBeGreaterThan(0);
  });

  it('co-op parties run too', () => {
    const r = runHeadless({ seed: 9, players: 2, classIds: ['fighter', 'mage'], untilWave: 2 });
    expect(r.ticks).toBeGreaterThan(0);
  });
});
