import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { getEnemy } from '../data/registry';

describe('endless mode', () => {
  it('remix waves spawn from the full pool and scaling compounds past wave 40', () => {
    const sim = new Sim(9, 1);
    sim.startEndlessWave(41);
    expect(sim.state.endless).toBe(true);
    expect(sim.state.spawning.queue.length).toBeGreaterThan(0);
    // let a batch spawn
    for (let i = 0; i < 240 && sim.state.enemies.length === 0; i++) sim.tick([]);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    const e41 = sim.state.enemies[0]!;
    const base41 = getEnemy(sim.registry, e41.defId);
    const hp41Scale = e41.maxHp / base41.maxHp;

    // deep endless scales meaningfully harder
    const deep = new Sim(9, 1);
    deep.startEndlessWave(60);
    for (let i = 0; i < 240 && deep.state.enemies.length === 0; i++) deep.tick([]);
    expect(deep.state.enemies.length).toBeGreaterThan(0);
    const e60 = deep.state.enemies[0]!;
    const base60 = getEnemy(deep.registry, e60.defId);
    expect(e60.maxHp / base60.maxHp).toBeGreaterThan(hp41Scale * 1.5);
  });

  it('endless waves clear and chain without act boundaries', () => {
    const sim = new Sim(11, 1);
    sim.startEndlessWave(41);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    sim.state.spawning.done = true;
    for (const e of [...sim.state.enemies]) e.alive = false;
    for (let i = 0; i < 10 && sim.state.phase !== 'cleared'; i++) sim.tick([]);
    expect(sim.state.phase).toBe('cleared');
    sim.startEndlessWave(42);
    expect(sim.state.wave).toBe(42);
    expect(sim.state.phase).toBe('fighting');
  });
});
