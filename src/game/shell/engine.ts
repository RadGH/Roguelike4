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

  private waveBreakTimer = 0;

  private startWave(n: number): void {
    this.sim.startWaveNumber(n);
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
      // Wave progression: cleared → short breather → next wave (the real
      // recap/reward/boon screen flow replaces this breather in M1-C).
      if (this.sim.state.phase === 'cleared') {
        this.waveBreakTimer += elapsed;
        if (this.waveBreakTimer >= 2.5) {
          this.waveBreakTimer = 0;
          if (this.sim.hasNextWave()) this.startWave(this.sim.state.wave + 1);
          else this.startWave(1); // act loop placeholder until acts 2-4 land
        }
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
