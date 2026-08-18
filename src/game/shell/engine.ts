// The engine shell: owns the Sim, the renderer, the input sampler, and the
// fixed-timestep accumulator loop. React mounts/unmounts this.

import { Sim } from '@game/core/sim';
import { TICK_SECONDS } from '@game/core/constants';
import { neutralInput, type InputFrame } from '@game/core/input';
import { GameRenderer, takeSnapshot, type RenderSnapshot } from './renderer';
import { InputSampler } from './inputSources';
import { createDebugApi, type DebugApi } from '../debug/harness';
import { GAME_VERSION } from '@game/branding';

export class Engine {
  private sim: Sim;
  private renderer = new GameRenderer();
  private input = new InputSampler();
  private prevSnap: RenderSnapshot;
  private currSnap: RenderSnapshot;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private pausedByDebug = false;
  readonly debug: DebugApi;

  constructor(seed: number, playerCount = 1) {
    this.sim = new Sim(seed, playerCount);
    this.prevSnap = takeSnapshot(this.sim);
    this.currSnap = takeSnapshot(this.sim);
    this.debug = createDebugApi(
      {
        snapshot: () => JSON.parse(JSON.stringify(this.sim.state)),
        screen: () => 'arena',
        step: (ticks: number, input: InputFrame) => {
          for (let i = 0; i < ticks; i++) this.stepOnce([input]);
        },
        setPaused: (p: boolean) => {
          this.pausedByDebug = p;
        },
        cheat: (action: string) => {
          if (action === 'killAll') {
            for (const e of [...this.sim.state.enemies]) {
              this.sim.applyDamageToEnemy(
                e,
                { kind: 'spell', types: ['void'], multiplier: 0, flat: [0, 0], noCrit: true },
                null,
                {
                  actor: { kind: 'player', index: 0 },
                  itemId: 'debug',
                  grantedBy: 'cheat',
                  deliveryTag: 'explosion',
                  hitId: this.sim.tracker.newHitId(),
                },
                { rawOverride: 999999, noCrit: true },
              );
            }
          } else if (action === 'stopSpawns') {
            this.sim.state.spawning.queue.forEach((q) => (q.count = 0));
            this.sim.state.spawning.done = true;
          } else if (action === 'gotoBossWave') {
            this.intermissionActive = false;
            this.boonChoices = null;
            this.chestChoices = null;
            this.startWave(10);
          } else if (action === 'snuffParty') {
            for (const p of this.sim.state.players) {
              p.hp = 0;
              p.alive = false;
            }
            this.runState = 'gameOver';
          }
        },
      },
      GAME_VERSION,
    );
  }

  private disposed = false;

  async mount(el: HTMLElement): Promise<void> {
    await this.renderer.init(el);
    if (this.disposed || !this.renderer.isReady) return;
    this.renderer.buildArena(this.sim.state.arena.width, this.sim.state.arena.height);
    this.input.attach(el);
    this.input.playerScreenPos = (i) => this.renderer.playerScreenPos(i, this.currSnap);
    this.startWave(1);
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.app.ticker.add(() => this.frame());
  }

  private startWave(n: number): void {
    this.sim.startWaveNumber(n);
  }

  // ---- intermission (between waves; replaced by full screens in M2) ----

  private intermissionActive = false;
  private boonChoices: string[] | null = null;
  private chestChoices: string[] | null = null;
  private pendingEquip: string | null = null;

  private weaponInfo(id: string) {
    const name = id
      .split('-')
      .map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : s))
      .join(' ');
    const w = this.sim.registry.weapons.get(id);
    if (!w) return { id, name, desc: '' };
    const effects = w.effects.map((e) => e.kind).join(', ');
    return {
      id,
      name,
      desc:
        `${w.hands}H ${w.kind} · ${Math.round(w.damage.multiplier * 100)}% ${w.damage.types.join('/')}` +
        (effects ? ` · ${effects}` : ''),
    };
  }

  /** Advance the intermission pipeline: chests first, then boons. */
  private refreshIntermissionOffers(): void {
    const p = this.sim.state.players[0]!;
    if (p.pendingChests > 0) {
      if (!this.chestChoices) this.chestChoices = this.sim.rollWeaponChoices(0, 3);
    } else {
      this.chestChoices = null;
      this.pendingEquip = null;
      this.boonChoices = p.pendingBoons > 0 ? (this.boonChoices ?? this.sim.rollBoonChoices(4)) : null;
    }
  }

  chooseChestWeapon(weaponId: string): void {
    if (!this.intermissionActive || !this.chestChoices?.includes(weaponId)) return;
    this.pendingEquip = weaponId;
  }

  cancelEquip(): void {
    this.pendingEquip = null;
  }

  equipReplace(slotIndex: number): void {
    if (!this.intermissionActive || !this.pendingEquip) return;
    this.sim.replaceWeapon(0, slotIndex, this.pendingEquip);
    this.finishChest();
  }

  salvageChest(): void {
    if (!this.intermissionActive || !this.chestChoices) return;
    for (const other of this.sim.state.players) other.gold += 15; // mirrored, like gold drops
    this.finishChest();
  }

  private finishChest(): void {
    const p = this.sim.state.players[0]!;
    p.pendingChests = Math.max(0, p.pendingChests - 1);
    this.chestChoices = null;
    this.pendingEquip = null;
    this.refreshIntermissionOffers();
  }

  intermission() {
    if (!this.intermissionActive) return null;
    const p = this.sim.state.players[0]!;
    const items = this.sim.tracker.byPlayerItem.get(0);
    const damageDealt = items ? [...items.values()].reduce((a, b) => a + b.total, 0) : 0;
    return {
      wave: this.sim.state.wave,
      lastWaveOfAct: !this.sim.hasNextWave(),
      recap: {
        kills: this.sim.tracker.killsByPlayer.get(0) ?? 0,
        damageDealt: Math.round(damageDealt),
        damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(0) ?? 0),
        gold: p.gold,
        level: p.level,
      },
      pendingBoons: p.pendingBoons,
      pendingChests: p.pendingChests,
      chest: this.chestChoices
        ? {
            choices: this.chestChoices.map((id) => this.weaponInfo(id)),
            pendingEquip: this.pendingEquip ? this.weaponInfo(this.pendingEquip) : null,
            currentWeapons: p.weapons.map((w, slot) => ({ slot, ...this.weaponInfo(w.itemId) })),
          }
        : null,
      boonChoices:
        this.boonChoices?.map((id) => {
          const b = this.sim.registry.boons.get(id)!;
          return { id, name: b.name, desc: b.desc };
        }) ?? null,
    };
  }

  chooseBoon(boonId: string): void {
    if (!this.intermissionActive || !this.boonChoices?.includes(boonId)) return;
    this.sim.applyBoon(0, boonId);
    const p = this.sim.state.players[0]!;
    this.boonChoices = p.pendingBoons > 0 ? this.sim.rollBoonChoices(4) : null;
  }

  continueToNextWave(): void {
    if (!this.intermissionActive) return;
    const p = this.sim.state.players[0]!;
    if (p.pendingBoons > 0 || p.pendingChests > 0) return; // resolve rewards first
    this.intermissionActive = false;
    this.boonChoices = null;
    this.chestChoices = null;
    this.pendingEquip = null;
    if (this.sim.hasNextWave()) this.startWave(this.sim.state.wave + 1);
    // No next wave: runState is already 'victory' — nothing to start.
  }

  /** Small HUD summary for the React overlay (polled at low frequency). */
  hud() {
    const p = this.sim.state.players[0]!;
    const bossEnemy = this.sim.state.enemies.find((e) => e.alive && e.boss);
    const bossDef = bossEnemy ? this.sim.registry.enemies.get(bossEnemy.defId) : null;
    return {
      boss:
        bossEnemy && bossDef
          ? {
              name: bossDef.name ?? bossEnemy.defId,
              hpFrac: Math.max(0, bossEnemy.hp) / bossEnemy.maxHp,
              phase: bossEnemy.boss!.phaseIdx,
              notches: (bossDef.bossPhases ?? []).map((ph) => ph.until).filter((u) => u > 0),
            }
          : null,
      hp: Math.ceil(p.hp),
      maxHp: Math.ceil(p.stats.maxHp ?? 10),
      gold: p.gold,
      xp: p.xp,
      level: p.level,
      chests: p.pendingChests,
      wave: this.sim.state.wave,
      cleared: this.sim.state.phase === 'cleared',
      runState: this.runState,
      enemies: this.sim.aliveEnemyCount(),
      combo: this.sim.state.combo.count,
      alive: p.alive,
      kills: this.sim.tracker.killsByPlayer.get(0) ?? 0,
    };
  }

  /** playing → gameOver (party snuffed) | victory (act's last wave cleared) */
  runState: 'playing' | 'gameOver' | 'victory' = 'playing';

  private stepOnce(inputs: readonly InputFrame[]): void {
    this.prevSnap = this.currSnap;
    const events = this.sim.tick(inputs);
    for (const ev of events) {
      if (ev.type === 'damageNumber' && this.renderer.isReady) {
        this.renderer.spawnDamageNumber(ev.x, ev.y, ev.amount, ev.crit, ev.onPlayer);
      } else if (ev.type === 'runOver') {
        this.runState = 'gameOver';
      } else if (ev.type === 'waveCleared' && !this.sim.hasNextWave()) {
        this.runState = 'victory';
      }
    }
    this.currSnap = takeSnapshot(this.sim);
  }

  /** Damage-meter drill-down for the recap panels (player 0 until M2 co-op). */
  meters() {
    const items = this.sim.tracker.byPlayerItem.get(0);
    const rows = items
      ? [...items.entries()]
          .map(([itemId, agg]) => ({
            itemId,
            name: this.weaponInfo(itemId).name,
            total: Math.round(agg.total),
            hits: agg.hits,
            crits: agg.crits,
            max: Math.round(agg.max),
          }))
          .sort((a, b) => b.total - a.total)
      : [];
    const grandTotal = rows.reduce((a, r) => a + r.total, 0) || 1;
    return {
      rows: rows.map((r) => ({ ...r, share: r.total / grandTotal })),
      damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(0) ?? 0),
      dodgeSaves: this.sim.tracker.dodgeSavesByPlayer.get(0) ?? 0,
      kills: this.sim.tracker.killsByPlayer.get(0) ?? 0,
    };
  }

  private frame(): void {
    if (!this.running) return;
    const now = performance.now();
    let elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (elapsed > 0.25) elapsed = 0.25; // tab-back clamp

    if (!this.pausedByDebug) {
      this.accumulator += elapsed;
      while (this.accumulator >= TICK_SECONDS) {
        const frames = this.input.sample(this.sim.state.players.length);
        this.stepOnce(frames.length ? frames : [neutralInput()]);
        this.accumulator -= TICK_SECONDS;
      }
      // Wave cleared → open the intermission (chests → boons → continue). The sim
      // keeps running so players can stroll and vacuum leftover pickups.
      if (this.sim.state.phase === 'cleared' && !this.intermissionActive && this.runState === 'playing') {
        this.intermissionActive = true;
        this.refreshIntermissionOffers();
      }
    }
    const alpha = this.pausedByDebug ? 1 : this.accumulator / TICK_SECONDS;
    this.renderer.render(this.prevSnap, this.currSnap, alpha);
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.input.dispose();
    this.renderer.dispose();
  }
}
