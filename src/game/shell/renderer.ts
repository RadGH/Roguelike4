// PixiJS renderer: draws the arena and entities from sim snapshots, interpolating
// between the previous and current tick. Rendering NEVER mutates sim state.
// Visuals are pooled and reused — no per-frame allocation churn.

import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Sim } from '@game/core/sim';
import playerWickUrl from '../../../art/player-wick.svg?url';
import snufflingUrl from '../../../art/enemy-snuffling.svg?url';
import puffballUrl from '../../../art/enemy-puffball.svg?url';
import thistleArcherUrl from '../../../art/enemy-thistle-archer.svg?url';

export const PX_PER_UNIT = 32;

const ENEMY_ART: Record<string, string> = {
  snuffling: snufflingUrl,
  puffball: puffballUrl,
  'thistle-archer': thistleArcherUrl,
};

export type RenderSnapshot = {
  players: {
    x: number;
    y: number;
    facing: number;
    squishPhase: number;
    moving: boolean;
    dashing: boolean;
    alive: boolean;
    hpFrac: number;
  }[];
  enemies: {
    instance: number;
    defId: string;
    x: number;
    y: number;
    radius: number;
    hpFrac: number;
    hitFlash: boolean;
  }[];
  projectiles: { x: number; y: number; radius: number; friendly: boolean }[];
  pickups: { x: number; y: number; kind: 'gold' | 'xp' }[];
};

export function takeSnapshot(sim: Sim): RenderSnapshot {
  return {
    players: sim.state.players.map((p) => ({
      x: p.x,
      y: p.y,
      facing: p.facing,
      squishPhase: p.squishPhase,
      moving: p.moving,
      dashing: p.dashTimer > 0,
      alive: p.alive,
      hpFrac: Math.max(0, p.hp) / Math.max(1, p.stats.maxHp ?? 10),
    })),
    enemies: sim.state.enemies
      .filter((e) => e.alive)
      .map((e) => {
        const def = sim.registry.enemies.get(e.defId);
        return {
          instance: e.instance,
          defId: e.defId,
          x: e.x,
          y: e.y,
          radius: def?.radius ?? 0.4,
          hpFrac: Math.max(0, e.hp) / Math.max(1, def?.maxHp ?? 1),
          hitFlash: e.hitFlash > 0,
        };
      }),
    projectiles: sim.state.projectiles
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y, radius: p.radius, friendly: p.fromPlayer >= 0 })),
    pickups: sim.state.pickups
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
  };
}

type SpriteVisual = {
  root: Container;
  sprite: Sprite;
  hpBar: Graphics;
  baseScaleX: number;
  baseScaleY: number;
};

export class GameRenderer {
  readonly app = new Application();
  private world = new Container();
  private playerVisuals: SpriteVisual[] = [];
  private enemyVisuals = new Map<number, SpriteVisual>();
  private enemyPool: SpriteVisual[] = [];
  private projectileGfx = new Graphics();
  private pickupGfx = new Graphics();
  private textures = new Map<string, Texture>();
  private zoom = 1.4;
  private initialized = false;
  private disposed = false;

  async init(mount: HTMLElement): Promise<void> {
    await this.app.init({
      background: '#8fd06e',
      resizeTo: mount,
      antialias: true,
      preference: 'webgl',
    });
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }
    mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);
    const load = async (key: string, url: string) => {
      this.textures.set(key, await Assets.load<Texture>({ src: url, data: { resolution: 2 } }));
    };
    await Promise.all([
      load('player', playerWickUrl),
      ...Object.entries(ENEMY_ART).map(([k, u]) => load(k, u)),
    ]);
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.initialized = true;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  buildArena(width: number, height: number): void {
    const g = new Graphics();
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
    g.rect(0, 0, width * PX_PER_UNIT, height * PX_PER_UNIT).stroke({ color: 0x5f9e4a, width: 6 });
    this.world.addChildAt(g, 0);
    // Entity layers above the floor: pickups, projectiles
    this.world.addChild(this.pickupGfx, this.projectileGfx);
  }

  private makeSpriteVisual(texture: Texture, heightUnits: number): SpriteVisual {
    const root = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.78);
    const h = heightUnits * PX_PER_UNIT;
    const ratio = texture.width / texture.height || 0.8;
    sprite.height = h;
    sprite.width = h * ratio;
    const hpBar = new Graphics();
    hpBar.y = -h * 0.95;
    root.addChild(sprite, hpBar);
    this.world.addChild(root);
    return { root, sprite, hpBar, baseScaleX: sprite.scale.x, baseScaleY: sprite.scale.y };
  }

  private drawHpBar(v: SpriteVisual, frac: number, widthPx: number): void {
    v.hpBar.clear();
    if (frac >= 1 || frac <= 0) return;
    v.hpBar
      .rect(-widthPx / 2, 0, widthPx, 4)
      .fill({ color: 0x2b2140, alpha: 0.6 })
      .rect(-widthPx / 2, 0, widthPx * frac, 4)
      .fill({ color: frac > 0.5 ? 0x7ce464 : frac > 0.25 ? 0xffb347 : 0xff5c5c });
  }

  render(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): void {
    if (!this.initialized) return;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;

    // Players
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < curr.players.length; i++) {
      const p0 = prev.players[i] ?? curr.players[i]!;
      const p1 = curr.players[i]!;
      while (this.playerVisuals.length <= i) {
        this.playerVisuals.push(this.makeSpriteVisual(this.textures.get('player')!, 1.8));
      }
      const v = this.playerVisuals[i]!;
      const x = lerp(p0.x, p1.x) * PX_PER_UNIT;
      const y = lerp(p0.y, p1.y) * PX_PER_UNIT;
      v.root.position.set(x, y);
      v.root.alpha = p1.alive ? 1 : 0.35;
      const wob = p1.moving || p1.dashing ? Math.sin(lerp(p0.squishPhase, p1.squishPhase)) * 0.08 : 0;
      const sx = (1 + wob) * (p1.dashing ? 1.12 : 1);
      const sy = (1 - wob) * (p1.dashing ? 0.88 : 1);
      const facingX = Math.cos(p1.facing);
      const prevSign = v.sprite.scale.x < 0 ? -1 : 1;
      const sign = Math.abs(facingX) > 0.15 ? (facingX < 0 ? -1 : 1) : prevSign;
      v.sprite.scale.set(sign * v.baseScaleX * sx, v.baseScaleY * sy);
      this.drawHpBar(v, p1.hpFrac, 40);
      cx += x;
      cy += y;
    }

    // Enemies — match visuals by instance id, pool the rest
    const seen = new Set<number>();
    for (const e of curr.enemies) {
      seen.add(e.instance);
      let v = this.enemyVisuals.get(e.instance);
      if (!v) {
        v = this.enemyPool.pop() ?? this.makeSpriteVisual(this.textures.get(e.defId) ?? Texture.WHITE, 1);
        v.sprite.texture = this.textures.get(e.defId) ?? Texture.WHITE;
        const h = e.radius * 2.6 * PX_PER_UNIT;
        v.sprite.height = h;
        v.sprite.width = h * (v.sprite.texture.width / v.sprite.texture.height || 1);
        v.baseScaleX = v.sprite.scale.x;
        v.baseScaleY = v.sprite.scale.y;
        v.root.visible = true;
        this.enemyVisuals.set(e.instance, v);
      }
      const p0 = prev.enemies.find((pe) => pe.instance === e.instance) ?? e;
      v.root.position.set(lerp(p0.x, e.x) * PX_PER_UNIT, lerp(p0.y, e.y) * PX_PER_UNIT);
      v.sprite.tint = e.hitFlash ? 0xffb3b3 : 0xffffff;
      this.drawHpBar(v, e.hpFrac, 30);
    }
    for (const [instance, v] of this.enemyVisuals) {
      if (!seen.has(instance)) {
        v.root.visible = false;
        this.enemyVisuals.delete(instance);
        this.enemyPool.push(v);
      }
    }

    // Projectiles
    this.projectileGfx.clear();
    for (const pr of curr.projectiles) {
      this.projectileGfx
        .circle(pr.x * PX_PER_UNIT, pr.y * PX_PER_UNIT, pr.radius * PX_PER_UNIT)
        .fill({ color: pr.friendly ? 0xfff3c4 : 0xb88ae0 })
        .stroke({ color: pr.friendly ? 0xe8a020 : 0x5d4d85, width: 2 });
    }

    // Pickups
    this.pickupGfx.clear();
    for (const pk of curr.pickups) {
      const x = pk.x * PX_PER_UNIT;
      const y = pk.y * PX_PER_UNIT;
      if (pk.kind === 'gold') {
        this.pickupGfx.circle(x, y, 5).fill({ color: 0xffd97a }).stroke({ color: 0xc89020, width: 1.5 });
      } else {
        this.pickupGfx.star(x, y, 4, 5, 2).fill({ color: 0x9be8ff });
      }
    }

    // Camera
    const n = Math.max(1, curr.players.length);
    cx /= n;
    cy /= n;
    const { width, height } = this.app.renderer;
    this.world.scale.set(this.zoom);
    this.world.position.set(width / 2 - cx * this.zoom, height / 2 - cy * this.zoom);
  }

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
    if (this.initialized) this.app.destroy(true, { children: true });
    this.playerVisuals = [];
    this.enemyVisuals.clear();
    this.enemyPool = [];
    this.initialized = false;
  }
}
