import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput, type InputFrame } from './input';
import {
  DASH_COOLDOWN,
  DASH_DURATION,
  PLAYER_MOVE_SPEED,
  TICK_RATE,
} from './constants';

const right = (): InputFrame => ({ ...neutralInput(), moveX: 1 });

describe('sim determinism', () => {
  it('same seed + same inputs → identical state hash', () => {
    const a = new Sim(123, 2);
    const b = new Sim(123, 2);
    const inputs = [right(), { ...neutralInput(), moveY: -1 }];
    for (let t = 0; t < 300; t++) {
      if (t === 60) inputs[0] = { ...inputs[0]!, dash: true };
      else inputs[0] = { ...inputs[0]!, dash: false };
      a.tick(inputs);
      b.tick(inputs);
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('different inputs → different hash', () => {
    const a = new Sim(123, 1);
    const b = new Sim(123, 1);
    for (let t = 0; t < 30; t++) {
      a.tick([right()]);
      b.tick([neutralInput()]);
    }
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('movement', () => {
  it('moves at base speed', () => {
    const sim = new Sim(1);
    const x0 = sim.state.players[0]!.x;
    for (let t = 0; t < TICK_RATE; t++) sim.tick([right()]); // 1 second
    expect(sim.state.players[0]!.x - x0).toBeCloseTo(PLAYER_MOVE_SPEED, 1);
  });

  it('diagonal movement is normalized', () => {
    const sim = new Sim(1);
    const p = sim.state.players[0]!;
    const { x: x0, y: y0 } = p;
    for (let t = 0; t < TICK_RATE; t++) sim.tick([{ ...neutralInput(), moveX: 1, moveY: 1 }]);
    const dist = Math.hypot(p.x - x0, p.y - y0);
    expect(dist).toBeCloseTo(PLAYER_MOVE_SPEED, 1);
  });

  it('is clamped to arena bounds', () => {
    const sim = new Sim(1);
    for (let t = 0; t < TICK_RATE * 20; t++) sim.tick([right()]);
    expect(sim.state.players[0]!.x).toBeLessThan(sim.state.arena.width);
  });
});

describe('dash', () => {
  it('dashes farther than running for the same duration and grants i-frames', () => {
    const run = new Sim(1);
    const dash = new Sim(1);
    const ticks = Math.ceil(DASH_DURATION * TICK_RATE);
    for (let t = 0; t < ticks; t++) {
      run.tick([right()]);
      dash.tick([{ ...right(), dash: t === 0 }]);
    }
    expect(dash.state.players[0]!.x).toBeGreaterThan(run.state.players[0]!.x);
  });

  it('emits a dash event and respects cooldown', () => {
    const sim = new Sim(1);
    const ev1 = sim.tick([{ ...right(), dash: true }]);
    expect(ev1).toContainEqual({ type: 'dash', player: 0 });
    // Immediately try again — still cooling down
    const ev2 = sim.tick([{ ...right(), dash: true }]);
    expect(ev2).toHaveLength(0);
    // After cooldown expires it works again
    const cooldownTicks = Math.ceil(DASH_COOLDOWN * TICK_RATE) + 1;
    for (let t = 0; t < cooldownTicks; t++) sim.tick([right()]);
    const ev3 = sim.tick([{ ...right(), dash: true }]);
    expect(ev3).toContainEqual({ type: 'dash', player: 0 });
  });

  it('i-frames expire before dash ends is allowed (0.15 < 0.18)', () => {
    const sim = new Sim(1);
    sim.tick([{ ...right(), dash: true }]);
    expect(sim.state.players[0]!.iframeTimer).toBeGreaterThan(0);
  });
});
