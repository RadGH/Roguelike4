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
        step: (ticks: number, inputs: InputFrame[]) => {
          for (let i = 0; i < ticks; i++) this.stepOnce(inputs);
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
            this.clearIntermission();
            this.startWave(10);
          } else if (action === 'addPlayer') {
            if (this.sim.state.players.length < 4) this.sim.addPlayer();
          } else if (action.startsWith('snuff:')) {
            const idx = Number(action.slice(6));
            const p = this.sim.state.players[idx];
            if (p) {
              p.hp = 0;
              p.alive = false;
            }
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
    window.addEventListener('gamepadconnected', this.onPadConnected);
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.app.ticker.add(() => this.frame());
  }

  private startWave(n: number): void {
    this.sim.startWaveNumber(n);
  }

  // ---- intermission (between waves) — per-player panels ----

  private intermissionActive = false;
  private boonChoices = new Map<number, string[]>();
  private chestChoices = new Map<number, string[]>();
  private pendingEquip = new Map<number, string>();

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

  /** Advance one player's intermission pipeline: chests first, then boons. */
  private refreshIntermissionOffers(playerIndex: number): void {
    const p = this.sim.state.players[playerIndex]!;
    if (p.pendingChests > 0) {
      if (!this.chestChoices.has(playerIndex)) {
        this.chestChoices.set(playerIndex, this.sim.rollWeaponChoices(playerIndex, 3));
      }
    } else {
      this.chestChoices.delete(playerIndex);
      this.pendingEquip.delete(playerIndex);
      if (p.pendingBoons > 0) {
        if (!this.boonChoices.has(playerIndex)) {
          this.boonChoices.set(playerIndex, this.sim.rollBoonChoices(4));
        }
      } else {
        this.boonChoices.delete(playerIndex);
      }
    }
  }

  private openIntermission(): void {
    this.intermissionActive = true;
    for (const p of this.sim.state.players) this.refreshIntermissionOffers(p.index);
  }

  private clearIntermission(): void {
    this.intermissionActive = false;
    this.boonChoices.clear();
    this.chestChoices.clear();
    this.pendingEquip.clear();
  }

  chooseChestWeapon(playerIndex: number, weaponId: string): void {
    if (!this.intermissionActive || !this.chestChoices.get(playerIndex)?.includes(weaponId)) return;
    this.pendingEquip.set(playerIndex, weaponId);
  }

  cancelEquip(playerIndex: number): void {
    this.pendingEquip.delete(playerIndex);
  }

  equipReplace(playerIndex: number, slotIndex: number): void {
    const weaponId = this.pendingEquip.get(playerIndex);
    if (!this.intermissionActive || !weaponId) return;
    this.sim.replaceWeapon(playerIndex, slotIndex, weaponId);
    this.finishChest(playerIndex);
  }

  salvageChest(playerIndex: number): void {
    if (!this.intermissionActive || !this.chestChoices.has(playerIndex)) return;
    for (const other of this.sim.state.players) other.gold += 15; // mirrored, like gold drops
    this.finishChest(playerIndex);
  }

  private finishChest(playerIndex: number): void {
    const p = this.sim.state.players[playerIndex]!;
    p.pendingChests = Math.max(0, p.pendingChests - 1);
    this.chestChoices.delete(playerIndex);
    this.pendingEquip.delete(playerIndex);
    this.refreshIntermissionOffers(playerIndex);
  }

  chooseBoon(playerIndex: number, boonId: string): void {
    if (!this.intermissionActive || !this.boonChoices.get(playerIndex)?.includes(boonId)) return;
    this.sim.applyBoon(playerIndex, boonId);
    const p = this.sim.state.players[playerIndex]!;
    if (p.pendingBoons > 0) this.boonChoices.set(playerIndex, this.sim.rollBoonChoices(4));
    else this.boonChoices.delete(playerIndex);
  }

  intermission() {
    if (!this.intermissionActive) return null;
    const shared = this.sim.state.players[0]!;
    return {
      wave: this.sim.state.wave,
      lastWaveOfAct: !this.sim.hasNextWave(),
      gold: shared.gold, // mirrored — same for everyone
      allDone: this.sim.state.players.every((p) => p.pendingBoons === 0 && p.pendingChests === 0),
      panels: this.sim.state.players.map((p) => {
        const chest = this.chestChoices.get(p.index);
        const equip = this.pendingEquip.get(p.index);
        const boons = this.boonChoices.get(p.index);
        return {
          player: p.index,
          level: p.level,
          kills: this.sim.tracker.killsByPlayer.get(p.index) ?? 0,
          damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(p.index) ?? 0),
          pendingBoons: p.pendingBoons,
          pendingChests: p.pendingChests,
          done: p.pendingBoons === 0 && p.pendingChests === 0,
          chest: chest
            ? {
                choices: chest.map((id) => this.weaponInfo(id)),
                pendingEquip: equip ? this.weaponInfo(equip) : null,
                currentWeapons: p.weapons.map((w, slot) => ({ slot, ...this.weaponInfo(w.itemId) })),
              }
            : null,
          boonChoices:
            boons?.map((id) => {
              const b = this.sim.registry.boons.get(id)!;
              return { id, name: b.name, desc: b.desc };
            }) ?? null,
        };
      }),
    };
  }

  continueToNextWave(): void {
    if (!this.intermissionActive) return;
    const allDone = this.sim.state.players.every((p) => p.pendingBoons === 0 && p.pendingChests === 0);
    if (!allDone) return; // resolve every player's rewards first
    this.clearIntermission();
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
      gold: p.gold, // mirrored — one value for the party
      wave: this.sim.state.wave,
      cleared: this.sim.state.phase === 'cleared',
      runState: this.runState,
      enemies: this.sim.aliveEnemyCount(),
      combo: this.sim.state.combo.count,
      players: this.sim.state.players.map((pl) => ({
        index: pl.index,
        hp: Math.ceil(pl.hp),
        maxHp: Math.ceil(pl.stats.maxHp ?? 10),
        level: pl.level,
        alive: pl.alive,
        chests: pl.pendingChests,
        kills: this.sim.tracker.killsByPlayer.get(pl.index) ?? 0,
        reviveFrac: pl.alive
          ? 0
          : Math.min(1, pl.reviveProgress / this.sim.registry.balance.coop.reviveHoldSeconds),
      })),
    };
  }

  /** playing → gameOver (party snuffed) | victory (act's last wave cleared) */
  runState: 'playing' | 'gameOver' | 'victory' = 'playing';
  private joinRequests = 0;
  private onPadConnected = () => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean).length : 0;
    if (pads > this.sim.state.players.length && this.sim.state.players.length < 4) {
      this.joinRequests++;
    }
  };

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

  /** Damage-meter drill-down for the recap panels. */
  meters(playerIndex = 0) {
    const items = this.sim.tracker.byPlayerItem.get(playerIndex);
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
      damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(playerIndex) ?? 0),
      dodgeSaves: this.sim.tracker.dodgeSavesByPlayer.get(playerIndex) ?? 0,
      kills: this.sim.tracker.killsByPlayer.get(playerIndex) ?? 0,
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
        // Hot-join lands at the wave boundary
        while (this.joinRequests > 0 && this.sim.state.players.length < 4) {
          this.sim.addPlayer();
          this.joinRequests--;
        }
        this.joinRequests = 0;
        this.openIntermission();
      }
    }
    const alpha = this.pausedByDebug ? 1 : this.accumulator / TICK_SECONDS;
    this.renderer.render(this.prevSnap, this.currSnap, alpha);
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    window.removeEventListener('gamepadconnected', this.onPadConnected);
    this.input.dispose();
    this.renderer.dispose();
  }
}
