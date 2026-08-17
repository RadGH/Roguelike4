// The simulation core: pure TypeScript, no browser APIs, no rendering.
// The live game, the headless simulator, and the tests all drive THIS.
// M0 scope: players, movement, dash (i-frames tracked), arena bounds.

import {
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_IFRAMES,
  DASH_SPEED,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  TICK_SECONDS,
} from './constants';
import { type InputFrame, neutralInput } from './input';
import { createRng, type Rng } from './rng';

export type PlayerState = {
  index: number; // 0..3
  x: number;
  y: number;
  facing: number; // radians
  moveSpeedMult: number;
  dashTimer: number; // >0 while dashing
  dashCooldown: number;
  iframeTimer: number;
  dashDirX: number;
  dashDirY: number;
  /** squish factor for the slug-wobble locomotion animation (cosmetic, but simulated
   *  deterministically so replays look identical) */
  squishPhase: number;
  moving: boolean;
};

export type Arena = { width: number; height: number };

export type SimState = {
  tick: number;
  arena: Arena;
  players: PlayerState[];
};

export type SimEvent =
  | { type: 'dash'; player: number }
  | { type: 'dashThroughEnemy'; player: number; enemy: number };

export class Sim {
  readonly state: SimState;
  readonly rng: Rng;
  private eventsThisTick: SimEvent[] = [];

  constructor(seed: number, playerCount = 1, arena: Arena = { width: 40, height: 30 }) {
    this.rng = createRng(seed);
    const players: PlayerState[] = [];
    for (let i = 0; i < playerCount; i++) {
      players.push({
        index: i,
        x: arena.width / 2 + (i - (playerCount - 1) / 2) * 2,
        y: arena.height / 2,
        facing: 0,
        moveSpeedMult: 1,
        dashTimer: 0,
        dashCooldown: 0,
        iframeTimer: 0,
        dashDirX: 1,
        dashDirY: 0,
        squishPhase: 0,
        moving: false,
      });
    }
    this.state = { tick: 0, arena, players };
  }

  /** Advance one fixed tick. inputs[i] belongs to players[i]; missing = neutral. */
  tick(inputs: readonly InputFrame[]): SimEvent[] {
    this.eventsThisTick = [];
    const dt = TICK_SECONDS;
    for (const p of this.state.players) {
      const input = inputs[p.index] ?? neutralInput();
      this.tickPlayer(p, input, dt);
    }
    this.state.tick++;
    return this.eventsThisTick;
  }

  private tickPlayer(p: PlayerState, input: InputFrame, dt: number): void {
    // Timers
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (p.iframeTimer > 0) p.iframeTimer = Math.max(0, p.iframeTimer - dt);

    // Movement input (normalize)
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    p.moving = mag > 0.01;

    // Facing: aim beats movement
    const aimMag = Math.hypot(input.aimX, input.aimY);
    if (aimMag > 0.25) p.facing = Math.atan2(input.aimY, input.aimX);
    else if (p.moving) p.facing = Math.atan2(my, mx);

    // Dash start
    if (input.dash && p.dashTimer <= 0 && p.dashCooldown <= 0) {
      p.dashTimer = DASH_DURATION;
      p.dashCooldown = DASH_COOLDOWN;
      p.iframeTimer = DASH_IFRAMES;
      if (p.moving) {
        p.dashDirX = mx / (mag || 1);
        p.dashDirY = my / (mag || 1);
      } else {
        p.dashDirX = Math.cos(p.facing);
        p.dashDirY = Math.sin(p.facing);
      }
      this.eventsThisTick.push({ type: 'dash', player: p.index });
    }

    // Velocity
    let vx: number;
    let vy: number;
    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      vx = p.dashDirX * DASH_SPEED;
      vy = p.dashDirY * DASH_SPEED;
    } else {
      const speed = PLAYER_MOVE_SPEED * p.moveSpeedMult;
      vx = mx * speed;
      vy = my * speed;
    }

    p.x += vx * dt;
    p.y += vy * dt;

    // Arena bounds
    const r = PLAYER_RADIUS;
    p.x = Math.min(this.state.arena.width - r, Math.max(r, p.x));
    p.y = Math.min(this.state.arena.height - r, Math.max(r, p.y));

    // Squish wobble advances while moving (deterministic cosmetic state)
    if (p.moving || p.dashTimer > 0) p.squishPhase = (p.squishPhase + dt * 9) % (Math.PI * 2);
  }

  /** Cheap structural hash for determinism tests and desync detection. */
  hash(): number {
    let h = 2166136261 >>> 0;
    const mix = (n: number) => {
      // Quantize floats so the hash is stable across identical runs.
      h ^= Math.round(n * 1024) >>> 0;
      h = Math.imul(h, 16777619);
    };
    mix(this.state.tick);
    for (const p of this.state.players) {
      mix(p.x);
      mix(p.y);
      mix(p.facing);
      mix(p.dashTimer);
      mix(p.dashCooldown);
    }
    return h >>> 0;
  }
}
