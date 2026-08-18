import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import { TICK_RATE } from './constants';

const idle = (): InputFrame => neutralInput();

describe('co-op mechanics', () => {
  it('spawn counts scale with party size', () => {
    const solo = new Sim(1, 1);
    const duo = new Sim(1, 2);
    solo.startWaveNumber(1);
    duo.startWaveNumber(1);
    const count = (s: Sim) => s.state.spawning.queue.reduce((a, q) => a + q.count, 0);
    expect(count(duo)).toBeGreaterThan(count(solo));
  });

  it('XP is equal-share and normalized by party size', () => {
    const duo = new Sim(2, 2);
    const [p0, p1] = duo.state.players as [(typeof duo.state.players)[0], (typeof duo.state.players)[0]];
    // Drop a 10-xp orb on p0 and let them collect it
    (duo as unknown as { dropPickup(x: number, y: number, k: string, n: number): void }).dropPickup(
      p0.x,
      p0.y,
      'xp',
      10,
    );
    for (let t = 0; t < TICK_RATE; t++) duo.tick([idle(), idle()]);
    expect(p0.xp).toBe(5);
    expect(p1.xp).toBe(5); // equal share, half each
  });

  it('chests deal round-robin regardless of collector', () => {
    const duo = new Sim(3, 2);
    const p0 = duo.state.players[0]!;
    const drop = (n: number) =>
      (duo as unknown as { dropPickup(x: number, y: number, k: string, a: number): void }).dropPickup(
        p0.x,
        p0.y,
        'chest',
        n,
      );
    drop(1);
    for (let t = 0; t < TICK_RATE; t++) duo.tick([idle(), idle()]);
    drop(1);
    for (let t = 0; t < TICK_RATE; t++) duo.tick([idle(), idle()]);
    expect(duo.state.players[0]!.pendingChests).toBe(1);
    expect(duo.state.players[1]!.pendingChests).toBe(1); // second chest went to P2
  });

  it('mirrored gold reaches snuffed players too', () => {
    const duo = new Sim(4, 2);
    const p1 = duo.state.players[1]!;
    p1.alive = false;
    p1.hp = 0;
    const p0 = duo.state.players[0]!;
    (duo as unknown as { dropPickup(x: number, y: number, k: string, a: number): void }).dropPickup(
      p0.x,
      p0.y,
      'gold',
      5,
    );
    for (let t = 0; t < TICK_RATE; t++) duo.tick([idle(), idle()]);
    expect(p0.gold).toBe(5);
    expect(p1.gold).toBe(5);
  });

  it('hold-interact revive brings a teammate back at partial HP, once per wave', () => {
    const duo = new Sim(5, 2);
    const [p0, p1] = [duo.state.players[0]!, duo.state.players[1]!];
    p1.alive = false;
    p1.hp = 0;
    p1.x = p0.x + 0.5;
    p1.y = p0.y;
    const helping: InputFrame = { ...idle(), interact: true };
    for (let t = 0; t < TICK_RATE * 3 + 3 && !p1.alive; t++) duo.tick([helping, idle()]);
    expect(p1.alive).toBe(true);
    expect(p1.hp).toBeGreaterThan(0);
    expect(p1.revivedThisWave).toBe(true);
    // Second snuff same wave: revive is spent
    p1.alive = false;
    p1.hp = 0;
    for (let t = 0; t < TICK_RATE * 4; t++) duo.tick([helping, idle()]);
    expect(p1.alive).toBe(false);
  });

  it('runOver only when ALL players are down', () => {
    const duo = new Sim(6, 2);
    const p1 = duo.state.players[1]!;
    p1.alive = false; // one down, one up → no runOver
    const evs1 = duo.tick([idle(), idle()]);
    expect(evs1.some((e) => e.type === 'runOver')).toBe(false);
  });

  it('addPlayer catches up to party level and shares mirrored gold', () => {
    const solo = new Sim(7, 1);
    const p0 = solo.state.players[0]!;
    p0.level = 6;
    p0.gold = 123;
    const joiner = solo.addPlayer();
    expect(joiner.level).toBe(6);
    expect(joiner.gold).toBe(123);
    expect(joiner.pendingBoons).toBeGreaterThan(0);
    expect(solo.state.players.length).toBe(2);
  });
});
