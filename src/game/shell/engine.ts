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
    if (p.pendingBoons > 0) return; // pick your boons first
    this.intermissionActive = false;
    this.boonChoices = null;
    if (this.sim.hasNextWave()) this.startWave(this.sim.state.wave + 1);
    else this.startWave(1); // act loop placeholder until acts 2-4 land
  }

  /** Small HUD summary for the React overlay (polled at low frequency). */
  hud() {
    const p = this.sim.state.players[0]!;
    return {
      hp: Math.ceil(p.hp),
      maxHp: Math.ceil(p.stats.maxHp ?? 10),
      gold: p.gold,
      xp: p.xp,
      level: p.level,
      chests: p.pendingChests,
      wave: this.sim.state.wave,
      cleared: this.sim.state.phase === 'cleared',
      enemies: this.sim.aliveEnemyCount(),
      combo: this.sim.state.combo.count,
      alive: p.alive,
      kills: this.sim.tracker.killsByPlayer.get(0) ?? 0,
    };
  }

  private stepOnce(inputs: readonly InputFrame[]): void {
    this.prevSnap = this.currSnap;
    this.sim.tick(inputs);
    this.currSnap = takeSnapshot(this.sim);
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
      // Wave cleared → open the intermission (recap + boon picks). The sim keeps
      // running so players can stroll and vacuum leftover pickups.
      if (this.sim.state.phase === 'cleared' && !this.intermissionActive) {
        this.intermissionActive = true;
        const p = this.sim.state.players[0]!;
        this.boonChoices = p.pendingBoons > 0 ? this.sim.rollBoonChoices(4) : null;
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
