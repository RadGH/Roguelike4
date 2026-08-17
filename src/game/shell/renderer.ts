// PixiJS renderer: draws the arena and entities from sim state, interpolating
// between the previous and current tick for smooth motion at any refresh rate.
// Rendering NEVER mutates sim state.

import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Sim, PlayerState } from '@game/core/sim';
import { PLAYER_RADIUS } from '@game/core/constants';
import playerWickUrl from '../../../art/player-wick.svg?url';

export const PX_PER_UNIT = 32; // reference zoom; camera scales around this

type PlayerVisual = {
  root: Container;
  sprite: Sprite;
  shadow: Graphics;
};

export type RenderSnapshot = {
  players: { x: number; y: number; facing: number; squishPhase: number; moving: boolean; dashing: boolean }[];
};

export function takeSnapshot(sim: Sim): RenderSnapshot {
  return {
    players: sim.state.players.map((p: PlayerState) => ({
      x: p.x,
      y: p.y,
      facing: p.facing,
      squishPhase: p.squishPhase,
      moving: p.moving,
      dashing: p.dashTimer > 0,
    })),
  };
}

export class GameRenderer {
  readonly app = new Application();
  private world = new Container();
  private playerVisuals: PlayerVisual[] = [];
  private wickTexture: Texture | null = null;
  private zoom = 1;
  private initialized = false;
  private disposed = false;

  async init(mount: HTMLElement): Promise<void> {
    await this.app.init({
      background: '#8fd06e', // sunny meadow green (Act 1 palette)
      resizeTo: mount,
      antialias: true,
      preference: 'webgl',
    });
    if (this.disposed) {
      // Unmounted while initializing (React StrictMode double-mount) — clean up now.
      this.app.destroy(true, { children: true });
      return;
    }
    mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.wickTexture = await Assets.load<Texture>({
      src: playerWickUrl,
      data: { resolution: 2 },
    });
    this.initialized = true;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  buildArena(width: number, height: number): void {
    const g = new Graphics();
    // Soft checker + border, whimsical bright
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if ((x + y) % 2 === 0) {
          g.rect(x * PX_PER_UNIT, y * PX_PER_UNIT, PX_PER_UNIT, PX_PER_UNIT).fill({
            color: 0x9ada78,
            alpha: 0.5,
          });
        }
      }
    }
    g.rect(0, 0, width * PX_PER_UNIT, height * PX_PER_UNIT).stroke({
      color: 0x5f9e4a,
      width: 6,
    });
    this.world.addChildAt(g, 0);
  }

  private ensurePlayerVisual(i: number): PlayerVisual {
    while (this.playerVisuals.length <= i) {
      const root = new Container();
      const shadow = new Graphics();
      shadow.ellipse(0, 0, PLAYER_RADIUS * PX_PER_UNIT * 0.9, PLAYER_RADIUS * PX_PER_UNIT * 0.35).fill({
        color: 0x000000,
        alpha: 0.18,
      });
      shadow.y = PLAYER_RADIUS * PX_PER_UNIT * 0.9;
      const sprite = new Sprite(this.wickTexture ?? Texture.WHITE);
      sprite.anchor.set(0.5, 0.78); // pivot near the feet for squish
      const h = PLAYER_RADIUS * PX_PER_UNIT * 3.2;
      sprite.height = h;
      sprite.width = h * (64 / 80);
      root.addChild(shadow, sprite);
      this.world.addChild(root);
      this.playerVisuals.push({ root, sprite, shadow });
    }
    return this.playerVisuals[i]!;
  }

  /** Render interpolated state. alpha = fraction of a tick since the last sim step. */
  render(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): void {
    if (!this.initialized) return;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;

    let cx = 0;
    let cy = 0;
    for (let i = 0; i < curr.players.length; i++) {
      const p0 = prev.players[i] ?? curr.players[i]!;
      const p1 = curr.players[i]!;
      const v = this.ensurePlayerVisual(i);
      const x = lerp(p0.x, p1.x) * PX_PER_UNIT;
      const y = lerp(p0.y, p1.y) * PX_PER_UNIT;
      v.root.position.set(x, y);
      // Squish wobble: horizontal/vertical scale oscillation while moving
      const base = 1;
      const wob = p1.moving || p1.dashing ? Math.sin(lerp(p0.squishPhase, p1.squishPhase)) * 0.08 : 0;
      v.sprite.scale.set(
        (v.sprite.scale.x < 0 ? -1 : 1) * Math.abs((base + wob) * (p1.dashing ? 1.12 : 1)),
        (base - wob) * (p1.dashing ? 0.88 : 1),
      );
      // Face left/right by aim/facing
      const facingX = Math.cos(p1.facing);
      if (Math.abs(facingX) > 0.15) {
        const sign = facingX < 0 ? -1 : 1;
        v.sprite.scale.x = sign * Math.abs(v.sprite.scale.x);
      }
      cx += x;
      cy += y;
    }

    // Camera: center on party average (M0: single player), clamp zoom later
    const n = Math.max(1, curr.players.length);
    cx /= n;
    cy /= n;
    this.zoom = 1.4;
    const { width, height } = this.app.renderer;
    this.world.scale.set(this.zoom);
    this.world.position.set(width / 2 - cx * this.zoom, height / 2 - cy * this.zoom);
  }

  /** Screen-space position of a player (for mouse aim direction). */
  playerScreenPos(index: number, snap: RenderSnapshot): { x: number; y: number } {
    const p = snap.players[index];
    if (!p) return { x: this.app.renderer.width / 2, y: this.app.renderer.height / 2 };
    return {
      x: p.x * PX_PER_UNIT * this.zoom + this.world.position.x,
      y: p.y * PX_PER_UNIT * this.zoom + this.world.position.y,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }
    // If init is still in flight, it destroys the app itself when it resolves.
    this.playerVisuals = [];
    this.initialized = false;
  }
}
