// PixiJS renderer: draws the arena and entities from sim snapshots, interpolating
// between the previous and current tick. Rendering NEVER mutates sim state.
// Visuals are pooled and reused — no per-frame allocation churn.

import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Sim } from '@game/core/sim';
import playerWickUrl from '../../../art/player-wick.svg?url';
import snufflingUrl from '../../../art/enemy-snuffling.svg?url';
import puffballUrl from '../../../art/enemy-puffball.svg?url';
import thistleArcherUrl from '../../../art/enemy-thistle-archer.svg?url';
import mopsyUrl from '../../../art/boss-mopsy.svg?url';
import grumbleBeetleUrl from '../../../art/enemy-grumble-beetle.svg?url';
import dandelionPopperUrl from '../../../art/enemy-dandelion-popper.svg?url';
import mimicUrl from '../../../art/enemy-mimic.svg?url';
import petDogUrl from '../../../art/pet-dog.svg?url';
import petZombieUrl from '../../../art/pet-zombie.svg?url';
import petBeeUrl from '../../../art/pet-bee.svg?url';
import petBoneChumUrl from '../../../art/pet-bone-chum.svg?url';
// Act 2 — Sogbottom Marsh
import soggunUrl from '../../../art/enemy-soggun.svg?url';
import bubblimUrl from '../../../art/enemy-bubblim.svg?url';
import mudpuppyUrl from '../../../art/enemy-mudpuppy.svg?url';
import croakswainUrl from '../../../art/enemy-croakswain.svg?url';
import bogboilUrl from '../../../art/enemy-bogboil.svg?url';
import drizzlecloudUrl from '../../../art/enemy-drizzlecloud.svg?url';
import theDampUrl from '../../../art/boss-the-damp.svg?url';
import ribbertUrl from '../../../art/boss-ribbert.svg?url';
// Act 3 — The Frosted Wick
import snowballUrl from '../../../art/enemy-snowball-with-teeth.svg?url';
import icicleImpUrl from '../../../art/enemy-icicle-imp.svg?url';
import chatterjawUrl from '../../../art/enemy-chatterjaw.svg?url';
import yodelerUrl from '../../../art/enemy-yodeler.svg?url';
import draftGhastUrl from '../../../art/enemy-draft-ghast.svg?url';
import frostLobberUrl from '../../../art/enemy-frost-lobber.svg?url';
import avalancheJrUrl from '../../../art/boss-avalanche-jr.svg?url';
import shiverinaUrl from '../../../art/boss-shiverina.svg?url';
// Act 4 — The Snuffed Palace
import pillowmanUrl from '../../../art/enemy-pillowman.svg?url';
import velvetArcherUrl from '../../../art/enemy-velvet-archer.svg?url';
import nightLightSnatcherUrl from '../../../art/enemy-night-light-snatcher.svg?url';
import duvetGolemUrl from '../../../art/enemy-duvet-golem.svg?url';
import hushlingUrl from '../../../art/enemy-hushling.svg?url';
import gloamLobberUrl from '../../../art/enemy-gloam-lobber.svg?url';
import theUnderstudyUrl from '../../../art/boss-the-understudy.svg?url';
import grandSnuffUrl from '../../../art/boss-grand-snuff.svg?url';
// Act 1 miniboss
import sirFluffingtonUrl from '../../../art/boss-sir-fluffington.svg?url';

const PET_ART: Record<string, string> = {
  dog: petDogUrl,
  zombie: petZombieUrl,
  bee: petBeeUrl,
  'bone-chum': petBoneChumUrl,
};

export const PX_PER_UNIT = 32;

/** Party identity colors: P1 gold, P2 sky, P3 pink, P4 mint (colorblind-checked hues). */
export const PLAYER_COLORS = [0xffd97a, 0x6ec6ff, 0xff9ad5, 0x8ce68c];
export const PLAYER_COLORS_CSS = ['#ffd97a', '#6ec6ff', '#ff9ad5', '#8ce68c'];

const ENEMY_ART: Record<string, string> = {
  snuffling: snufflingUrl,
  puffball: puffballUrl,
  'thistle-archer': thistleArcherUrl,
  mopsy: mopsyUrl,
  'grumble-beetle': grumbleBeetleUrl,
  'dandelion-popper': dandelionPopperUrl,
  'dandelion-seed': puffballUrl, // seeds are just tiny puffs — intentional
  'possessed-chest': mimicUrl,
  // gilded-mimic intentionally absent: it uses the mimic fallback + gold tint
  'sir-fluffington': sirFluffingtonUrl,
  // Act 2 — Sogbottom Marsh
  soggun: soggunUrl,
  bubblim: bubblimUrl,
  mudpuppy: mudpuppyUrl,
  croakswain: croakswainUrl,
  bogboil: bogboilUrl,
  drizzlecloud: drizzlecloudUrl,
  'the-damp': theDampUrl,
  ribbert: ribbertUrl,
  // Act 3 — The Frosted Wick
  'snowball-with-teeth': snowballUrl,
  'icicle-imp': icicleImpUrl,
  chatterjaw: chatterjawUrl,
  yodeler: yodelerUrl,
  'draft-ghast': draftGhastUrl,
  'frost-lobber': frostLobberUrl,
  'avalanche-jr': avalancheJrUrl,
  shiverina: shiverinaUrl,
  // Act 4 — The Snuffed Palace
  pillowman: pillowmanUrl,
  'velvet-archer': velvetArcherUrl,
  'night-light-snatcher': nightLightSnatcherUrl,
  'duvet-golem': duvetGolemUrl,
  hushling: hushlingUrl,
  'gloam-lobber': gloamLobberUrl,
  'the-understudy': theUnderstudyUrl,
  'grand-snuff': grandSnuffUrl,
};

// Acts 2-4 use tinted archetype placeholders until the bespoke art pass (M4).
const ARCHETYPE_FALLBACK_ART: Record<string, string> = {
  chaser: snufflingUrl,
  skitterer: puffballUrl,
  shooter: thistleArcherUrl,
  charger: grumbleBeetleUrl,
  splitter: dandelionPopperUrl,
  lobber: dandelionPopperUrl,
  summoner: snufflingUrl,
  buffer: puffballUrl,
  mimic: mimicUrl,
  boss: mopsyUrl,
};

// Safety net for future enemies added to data before their art exists: the
// archetype fallback renders with this tint so clones stay distinguishable.
const ENEMY_TINT: Record<string, number> = {
  'gilded-mimic': 0xffe28a, // shares the mimic sprite on purpose — gold sheen
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
    reviveFrac: number;
  }[];
  enemies: {
    instance: number;
    defId: string;
    archetype: string;
    x: number;
    y: number;
    radius: number;
    hpFrac: number;
    hitFlash: boolean;
    elite: boolean;
    frozen: boolean;
    stunned: boolean;
    telegraphing: boolean;
    asleep: boolean;
  }[];
  projectiles: { x: number; y: number; radius: number; friendly: boolean }[];
  pickups: { x: number; y: number; kind: 'gold' | 'xp' | 'chest' | 'heart' }[];
  pools: { x: number; y: number; radius: number }[];
  pets: { instance: number; defId: string; owner: number; x: number; y: number; squishPhase: number }[];
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
      reviveFrac: p.alive ? 0 : Math.min(1, p.reviveProgress / 3),
    })),
    enemies: sim.state.enemies
      .filter((e) => e.alive)
      .map((e) => {
        const def = sim.registry.enemies.get(e.defId);
        return {
          instance: e.instance,
          defId: e.defId,
          archetype: def?.archetype ?? 'chaser',
          x: e.x,
          y: e.y,
          radius: def?.radius ?? 0.4,
          hpFrac: Math.max(0, e.hp) / Math.max(1, e.maxHp),
          hitFlash: e.hitFlash > 0,
          elite: e.elite,
          frozen: e.status.freezeLeft > 0,
          stunned: e.status.stunLeft > 0,
          telegraphing: e.charge.phase === 'windup',
          asleep: def?.archetype === 'mimic' && !e.mimicAwake,
        };
      }),
    projectiles: sim.state.projectiles
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y, radius: p.radius, friendly: p.fromPlayer >= 0 })),
    pickups: sim.state.pickups
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
    pools: sim.state.pools
      .filter((p) => p.active)
      .map((p) => ({ x: p.x, y: p.y, radius: p.radius })),
    pets: sim.state.pets.map((pt) => ({
      instance: pt.instance,
      defId: pt.defId,
      owner: pt.owner,
      x: pt.x,
      y: pt.y,
      squishPhase: pt.squishPhase,
    })),
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
  private petVisuals = new Map<number, SpriteVisual>();
  private petPool: SpriteVisual[] = [];
  private projectileGfx = new Graphics();
  private pickupGfx = new Graphics();
  private poolGfx = new Graphics();
  private damageNumbers: { text: Text; age: number; active: boolean }[] = [];
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
      ...Object.entries(ARCHETYPE_FALLBACK_ART).map(([k, u]) => load(`arch:${k}`, u)),
      ...Object.entries(PET_ART).map(([k, u]) => load(`pet:${k}`, u)),
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

  private floorGfx: Graphics | null = null;
  private arenaSize = { width: 0, height: 0 };

  /** Act palettes: bg, checker, border (design 01-world.md). */
  private static ACT_THEMES: Record<number, { bg: string; checker: number; border: number }> = {
    1: { bg: '#8fd06e', checker: 0x9ada78, border: 0x5f9e4a },
    2: { bg: '#4f9e8f', checker: 0x5cab97, border: 0x2f6e62 },
    3: { bg: '#a9cfe8', checker: 0xbcdcf2, border: 0x7aa8c8 },
    4: { bg: '#3d3260', checker: 0x4a3d6b, border: 0xb88ae0 },
  };

  buildArena(width: number, height: number, act = 1): void {
    this.arenaSize = { width, height };
    this.setActTheme(act);
    // Entity layers above the floor: pools, pickups, projectiles
    this.world.addChild(this.poolGfx, this.pickupGfx, this.projectileGfx);
  }

  setActTheme(act: number): void {
    const theme = GameRenderer.ACT_THEMES[act] ?? GameRenderer.ACT_THEMES[1]!;
    this.app.renderer.background.color = theme.bg;
    if (this.floorGfx) {
      this.floorGfx.destroy();
      this.floorGfx = null;
    }
    const { width, height } = this.arenaSize;
    const g = new Graphics();
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if ((x + y) % 2 === 0) {
          g.rect(x * PX_PER_UNIT, y * PX_PER_UNIT, PX_PER_UNIT, PX_PER_UNIT).fill({
            color: theme.checker,
            alpha: 0.5,
          });
        }
      }
    }
    g.rect(0, 0, width * PX_PER_UNIT, height * PX_PER_UNIT).stroke({ color: theme.border, width: 6 });
    this.world.addChildAt(g, 0);
    this.floorGfx = g;
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

  /** Draw without clearing (caller may have drawn a ring first). */
  private drawHpBarKeep(v: SpriteVisual, frac: number, widthPx: number): void {
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
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
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
      // Identity ring (and revive channel arc when snuffed)
      v.hpBar.clear();
      const ringColor = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
      v.hpBar
        .ellipse(0, 18, 16, 7)
        .stroke({ color: ringColor, width: 2.5, alpha: p1.alive ? 0.9 : 0.5 });
      if (!p1.alive && p1.reviveFrac > 0) {
        v.hpBar
          .arc(0, -18, 14, -Math.PI / 2, -Math.PI / 2 + p1.reviveFrac * Math.PI * 2)
          .stroke({ color: 0xffd97a, width: 4 });
      }
      const wob = p1.moving || p1.dashing ? Math.sin(lerp(p0.squishPhase, p1.squishPhase)) * 0.08 : 0;
      const sx = (1 + wob) * (p1.dashing ? 1.12 : 1);
      const sy = (1 - wob) * (p1.dashing ? 0.88 : 1);
      const facingX = Math.cos(p1.facing);
      const prevSign = v.sprite.scale.x < 0 ? -1 : 1;
      const sign = Math.abs(facingX) > 0.15 ? (facingX < 0 ? -1 : 1) : prevSign;
      v.sprite.scale.set(sign * v.baseScaleX * sx, v.baseScaleY * sy);
      this.drawHpBarKeep(v, p1.hpFrac, 40);
      cx += x;
      cy += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    // Enemies — match visuals by instance id, pool the rest
    const seen = new Set<number>();
    for (const e of curr.enemies) {
      seen.add(e.instance);
      let v = this.enemyVisuals.get(e.instance);
      if (!v) {
        const tex =
          this.textures.get(e.defId) ?? this.textures.get(`arch:${e.archetype}`) ?? Texture.WHITE;
        v = this.enemyPool.pop() ?? this.makeSpriteVisual(tex, 1);
        v.sprite.texture = tex;
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
      const baseTint = this.textures.has(e.defId) ? 0xffffff : (ENEMY_TINT[e.defId] ?? 0xffffff);
      v.sprite.tint = e.telegraphing
        ? 0xff8080
        : e.hitFlash
          ? 0xffb3b3
          : e.frozen
            ? 0x9be8ff
            : e.stunned
              ? 0xfff2a0
              : baseTint;
      // Elite: golden ring under the sprite
      v.hpBar.clear();
      if (e.elite) {
        v.hpBar
          .ellipse(0, e.radius * PX_PER_UNIT * 0.8, e.radius * PX_PER_UNIT * 1.2, e.radius * PX_PER_UNIT * 0.45)
          .stroke({ color: 0xffd97a, width: 3 });
      }
      if (!e.asleep) this.drawHpBarKeep(v, e.hpFrac, 30);
    }
    for (const [instance, v] of this.enemyVisuals) {
      if (!seen.has(instance)) {
        v.root.visible = false;
        this.enemyVisuals.delete(instance);
        this.enemyPool.push(v);
      }
    }

    // Pets — small companions with their owner's color ring
    const petSeen = new Set<number>();
    for (const pt of curr.pets) {
      petSeen.add(pt.instance);
      let v = this.petVisuals.get(pt.instance);
      if (!v) {
        const tex = this.textures.get(`pet:${pt.defId}`) ?? Texture.WHITE;
        v = this.petPool.pop() ?? this.makeSpriteVisual(tex, 1.1);
        v.sprite.texture = tex;
        const h = 1.1 * PX_PER_UNIT;
        v.sprite.height = h;
        v.sprite.width = h * (tex.width / tex.height || 1);
        v.baseScaleX = v.sprite.scale.x;
        v.baseScaleY = v.sprite.scale.y;
        v.root.visible = true;
        this.petVisuals.set(pt.instance, v);
      }
      const p0 = prev.pets.find((pp) => pp.instance === pt.instance) ?? pt;
      v.root.position.set(lerp(p0.x, pt.x) * PX_PER_UNIT, lerp(p0.y, pt.y) * PX_PER_UNIT);
      const wob = Math.sin(lerp(p0.squishPhase, pt.squishPhase)) * 0.06;
      v.sprite.scale.set(v.baseScaleX * (1 + wob), v.baseScaleY * (1 - wob));
      v.hpBar.clear();
      v.hpBar
        .ellipse(0, 12, 10, 4.5)
        .stroke({ color: PLAYER_COLORS[pt.owner % PLAYER_COLORS.length]!, width: 2, alpha: 0.7 });
    }
    for (const [instance, v] of this.petVisuals) {
      if (!petSeen.has(instance)) {
        v.root.visible = false;
        this.petVisuals.delete(instance);
        this.petPool.push(v);
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

    // Ground pools (hazards)
    this.poolGfx.clear();
    for (const pool of curr.pools) {
      this.poolGfx
        .circle(pool.x * PX_PER_UNIT, pool.y * PX_PER_UNIT, pool.radius * PX_PER_UNIT)
        .fill({ color: 0x7fbf68, alpha: 0.3 })
        .stroke({ color: 0x5f9e4a, width: 2, alpha: 0.5 });
    }

    // Pickups
    this.pickupGfx.clear();
    for (const pk of curr.pickups) {
      const x = pk.x * PX_PER_UNIT;
      const y = pk.y * PX_PER_UNIT;
      if (pk.kind === 'gold') {
        this.pickupGfx.circle(x, y, 5).fill({ color: 0xffd97a }).stroke({ color: 0xc89020, width: 1.5 });
      } else if (pk.kind === 'xp') {
        this.pickupGfx.star(x, y, 4, 5, 2).fill({ color: 0x9be8ff });
      } else if (pk.kind === 'heart') {
        this.pickupGfx
          .circle(x - 2.4, y - 1.5, 3)
          .circle(x + 2.4, y - 1.5, 3)
          .fill({ color: 0xff7f9e });
        this.pickupGfx.poly([x - 5, y - 0.4, x + 5, y - 0.4, x, y + 5.5]).fill({ color: 0xff7f9e });
      } else {
        // chest: little golden box with a lid line
        this.pickupGfx
          .roundRect(x - 7, y - 6, 14, 12, 2)
          .fill({ color: 0xc98f3d })
          .stroke({ color: 0x8a5a20, width: 2 });
        this.pickupGfx.moveTo(x - 7, y - 1).lineTo(x + 7, y - 1).stroke({ color: 0x8a5a20, width: 1.5 });
      }
    }

    this.tickDamageNumbers(this.app.ticker.deltaMS);

    // Camera: fit the whole party with margin; zoom clamped to the raster budget
    const n = Math.max(1, curr.players.length);
    cx /= n;
    cy /= n;
    const { width, height } = this.app.renderer;
    const ZOOM_MAX = 1.4;
    const ZOOM_MIN = 0.55;
    const marginPx = 7 * PX_PER_UNIT;
    const spanX = Math.max(1, maxX - minX) + marginPx * 2;
    const spanY = Math.max(1, maxY - minY) + marginPx * 2;
    const targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, width / spanX, height / spanY));
    this.zoom += (targetZoom - this.zoom) * 0.08;
    this.world.scale.set(this.zoom);
    this.world.position.set(width / 2 - cx * this.zoom, height / 2 - cy * this.zoom);
  }

  /** Pooled floating damage numbers (cosmetic, renderer-owned). */
  spawnDamageNumber(x: number, y: number, amount: number, crit: boolean, onPlayer: boolean): void {
    let dn = this.damageNumbers.find((d) => !d.active);
    if (!dn) {
      if (this.damageNumbers.length >= 80) return; // cap — drop excess, never allocate more
      dn = { text: new Text({ text: '' }), age: 0, active: false };
      dn.text.anchor.set(0.5, 1);
      this.world.addChild(dn.text);
      this.damageNumbers.push(dn);
    }
    dn.active = true;
    dn.age = 0;
    dn.text.visible = true;
    dn.text.text = String(amount);
    dn.text.style = {
      fontFamily: 'system-ui',
      fontSize: crit ? 22 : 15,
      fontWeight: '800',
      fill: onPlayer ? 0xff5c5c : crit ? 0xffd97a : 0xffffff,
      stroke: { color: 0x2b2140, width: 3 },
    };
    dn.text.position.set(x * PX_PER_UNIT + (Math.random() - 0.5) * 10, y * PX_PER_UNIT - 14);
    dn.text.alpha = 1;
  }

  private tickDamageNumbers(dtMs: number): void {
    const LIFE = 700;
    for (const dn of this.damageNumbers) {
      if (!dn.active) continue;
      dn.age += dtMs;
      dn.text.y -= (dtMs / 1000) * 55;
      dn.text.alpha = Math.max(0, 1 - dn.age / LIFE);
      if (dn.age >= LIFE) {
        dn.active = false;
        dn.text.visible = false;
      }
    }
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
