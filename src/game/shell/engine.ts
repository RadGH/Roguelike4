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
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.app.ticker.add(() => this.frame());
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
