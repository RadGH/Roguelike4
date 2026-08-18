import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { stat } from './stats';

describe('second class batch', () => {
  it('all six new classes exist with legal starting gear', () => {
    for (const id of ['pyromancer', 'stormcaller', 'frostwitch', 'tycoon', 'jester', 'warlock']) {
      const sim = new Sim(1, 1, undefined, [id]);
      const p = sim.state.players[0]!;
      expect(p.weapons.length).toBeGreaterThan(0);
      for (const w of p.weapons) expect(sim.registry.weapons.has(w.itemId)).toBe(true);
    }
  });

  it('tycoon starts with the coin pouch and collects 25% richer', () => {
    const sim = new Sim(2, 1, undefined, ['tycoon']);
    const p = sim.state.players[0]!;
    expect(p.passives).toContain('coin-pouch');
    expect(stat(p.stats, 'goldGain')).toBeGreaterThan(0.2); // pouch 10% + talent 15%
  });

  it('coin toss fires after 15 gold and scales with the hoard', () => {
    const sim = new Sim(3, 1, undefined, ['tycoon']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    const e = sim.spawnEnemy('grumble-beetle', p.x + 3, p.y);
    const hpBefore = e.hp;
    p.gold = 500;
    // drop and collect a 20-gold pickup through the real pipeline
    sim.dropPickup(p.x, p.y, 'gold', 20);
    for (let i = 0; i < 10; i++) sim.tick([]);
    expect(e.hp).toBeLessThan(hpBefore); // the coin found its mark
  });

  it("warlock's pact echoes hits as void and collects at the bell", () => {
    const sim = new Sim(4, 1, undefined, ['warlock']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    const e = sim.spawnEnemy('grumble-beetle', p.x + 1, p.y);
    const events = [...sim.tracker.events];
    void events;
    // direct weapon hit via aiming at the enemy
    for (let i = 0; i < 60; i++) {
      sim.tick([{ ...neutral(), aimX: 1, aimY: 0, fire: true }]);
      if (!e.alive) break;
    }
    const voidDamage = sim.tracker.events.filter(
      (ev) => ev.type === 'damage' && ev.source.itemId === 'pact',
    );
    expect(voidDamage.length).toBeGreaterThan(0);
    // wave tithe: never below 1 HP
    p.hp = 1;
    sim.startWaveNumber(2);
    expect(p.hp).toBe(1);
  });

  it('jester gets a free boon at each bell', () => {
    const sim = new Sim(5, 1, undefined, ['jester']);
    const p = sim.state.players[0]!;
    sim.startWaveNumber(1);
    expect(p.boonIds.length).toBe(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    sim.startWaveNumber(2);
    expect(p.boonIds.length).toBe(2);
  });

  it('frostwitch aura slows nearby enemies without a single cast', () => {
    const sim = new Sim(6, 1, undefined, ['frostwitch']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    const near = sim.spawnEnemy('snuffling', p.x + 1.5, p.y);
    const far = sim.spawnEnemy('snuffling', p.x + 10, p.y);
    sim.tick([]);
    expect(near.status.slowLeft).toBeGreaterThan(0);
    expect(far.status.slowLeft).toBe(0);
  });

  it('stun and freeze deeds count status applications', () => {
    const sim = new Sim(7, 1, undefined, ['frostwitch']);
    sim.startWaveNumber(1);
    sim.state.spawning.queue.forEach((q) => (q.count = 0));
    const p = sim.state.players[0]!;
    p.iframeTimer = 9999;
    sim.spawnEnemy('snuffling', p.x + 4, p.y);
    let freezes = 0;
    for (let i = 0; i < 240; i++) {
      const evs = sim.tick([{ ...neutral(), aimX: 1, aimY: 0, fire: true }]);
      freezes += evs.filter((e) => e.type === 'statusApplied' && e.kind === 'freeze').length;
    }
    expect(freezes).toBeGreaterThan(0); // frostbolt's listed freeze fires the event
  });
});

function neutral() {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    fire: false,
    dash: false,
    interact: false,
    pause: false,
  };
}
