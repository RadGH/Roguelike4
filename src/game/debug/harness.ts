// Debug harness: error ring buffer always on (cheap, powers "copy error log");
// the full __debug API only activates with ?debug=1. Playwright drives the game
// through this — input injection + tick stepping = deterministic E2E.

import type { InputFrame } from '@game/core/input';
import { neutralInput } from '@game/core/input';

export type DebugApi = {
  version: string;
  isDebug: boolean;
  errors: { ts: number; message: string; source: string }[];
  /** Pause the real-time loop (debug only). */
  pause(): void;
  resume(): void;
  paused(): boolean;
  /** Advance N ticks while paused, using the injected inputs (debug only). */
  step(ticks: number): void;
  /** Set the injected input frame for a player (default 0) while stepping/paused. */
  setInput(partial: Partial<InputFrame>, playerIndex?: number): void;
  /** Structured game state snapshot. */
  snapshot(): unknown;
  /** Current screen name (title, arena, ...). */
  screen(): string;
  /** Debug-only cheats: 'killAll', 'clearWave', ... (debug mode only). */
  cheat(action: string): void;
};

const MAX_ERRORS = 500;

export function installErrorCapture(errors: DebugApi['errors']): void {
  const push = (message: string, source: string) => {
    errors.push({ ts: Date.now(), message, source });
    if (errors.length > MAX_ERRORS) errors.splice(0, 50);
  };
  window.addEventListener('error', (e) => push(String(e.message), e.filename ?? 'window'));
  window.addEventListener('unhandledrejection', (e) =>
    push(String((e as PromiseRejectionEvent).reason), 'promise'),
  );
}

export function isDebugMode(): boolean {
  return new URLSearchParams(window.location.search).has('debug');
}

export type DebugHooks = {
  snapshot: () => unknown;
  screen: () => string;
  step: (ticks: number, inputs: InputFrame[]) => void;
  setPaused: (paused: boolean) => void;
  cheat: (action: string) => void;
};

export function createDebugApi(hooks: DebugHooks, version: string): DebugApi {
  const errors: DebugApi['errors'] = [];
  installErrorCapture(errors);
  const injected: InputFrame[] = [neutralInput(), neutralInput(), neutralInput(), neutralInput()];
  let pausedFlag = false;
  const debug = isDebugMode();

  const api: DebugApi = {
    version,
    isDebug: debug,
    errors,
    pause: () => {
      if (!debug) return;
      pausedFlag = true;
      hooks.setPaused(true);
    },
    resume: () => {
      pausedFlag = false;
      hooks.setPaused(false);
    },
    paused: () => pausedFlag,
    step: (ticks) => {
      if (!debug) return;
      hooks.step(ticks, injected);
    },
    setInput: (partial, playerIndex = 0) => {
      injected[playerIndex] = { ...(injected[playerIndex] ?? neutralInput()), ...partial };
    },
    snapshot: () => hooks.snapshot(),
    screen: () => hooks.screen(),
    cheat: (action) => {
      if (!debug) return;
      hooks.cheat(action);
    },
  };

  (window as unknown as { __debug: DebugApi }).__debug = api;
  return api;
}
