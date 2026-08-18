// Samples browser input devices into InputFrames per simulation tick.
// Keyboard+mouse drive player 1; gamepads drive any player (pad 0 may also be P1
// per the design — for M0 pad 0 simply merges into P1).

import type { InputFrame } from '@game/core/input';
import { neutralInput } from '@game/core/input';

const DEADZONE = 0.18;

export class InputSampler {
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseX = 0;
  private mouseY = 0;
  private dashLatch = false;
  private abilityLatch = false;
  private pauseLatch = false;
  private prevPadStart: boolean[] = [];
  private prevPadButtons: boolean[][] = [];
  private detach: (() => void) | null = null;

  /** One-shot: true if any device requested pause since the last call. */
  consumePause(): boolean {
    const v = this.pauseLatch;
    this.pauseLatch = false;
    return v;
  }

  /** Screen-space player position provider so mouse aim can be a direction. */
  playerScreenPos: (playerIndex: number) => { x: number; y: number } = () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });

  attach(target: HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.dashLatch = true;
        e.preventDefault();
      }
      if (e.code === 'KeyQ') this.abilityLatch = true;
      if (e.code === 'Escape') this.pauseLatch = true;
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.dashLatch = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    const onContext = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    target.addEventListener('contextmenu', onContext);
    this.detach = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('contextmenu', onContext);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  /** Sample one tick's worth of input for the given player count. Latches reset. */
  sample(playerCount: number): InputFrame[] {
    const frames: InputFrame[] = [];
    for (let i = 0; i < playerCount; i++) frames.push(neutralInput());

    // Keyboard + mouse → player 0
    const p1 = frames[0]!;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) p1.moveY -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) p1.moveY += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) p1.moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) p1.moveX += 1;
    const pp = this.playerScreenPos(0);
    const dx = this.mouseX - pp.x;
    const dy = this.mouseY - pp.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8) {
      p1.aimX = dx / dist;
      p1.aimY = dy / dist;
    }
    p1.fire = this.mouseDown;
    p1.dash = this.dashLatch;
    p1.interact = this.keys.has('KeyE'); // held (revives are hold-to-channel)
    p1.ability = this.abilityLatch;

    // Gamepads: pad i → player i (pad 0 merges into player 0)
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < playerCount; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const f = frames[i]!;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > DEADZONE) {
        f.moveX += ax;
        f.moveY += ay;
      }
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.25) {
        f.aimX = rx;
        f.aimY = ry;
        f.fire = true; // aiming with the stick auto-fires
      }
      const btn = (n: number) => pad.buttons[n]?.pressed ?? false;
      const prev = this.prevPadButtons[i] ?? [];
      if (btn(0) && !prev[0]) f.dash = true; // A (edge)
      if (btn(2)) f.interact = true; // X (held — revives channel)
      if (btn(1) && !prev[1]) f.ability = true; // B (edge)
      if (btn(7)) f.fire = true; // RT
      if (btn(9) && !this.prevPadStart[i]) this.pauseLatch = true; // Start (edge)
      this.prevPadStart[i] = btn(9);
      this.prevPadButtons[i] = [btn(0), btn(1), btn(2), btn(3), false, false, false, btn(7)];
    }

    this.dashLatch = false;
    this.abilityLatch = false;
    return frames;
  }
}
