// Gamepad + keyboard menu navigation for overlay panels.
// Each player's pad (pad i = player i) drives their own panel; keyboard drives
// player 0's. `player: 'any'` lets every device control one shared menu (pause).

import { useEffect, useRef, useState } from 'react';

type Options = {
  player: number | 'any';
  count: number;
  enabled: boolean;
  onConfirm: (index: number) => void;
  onBack?: () => void;
  /** keyboard arrows/enter/escape participate (default: player 0 or 'any') */
  keyboard?: boolean;
};

const POLL_MS = 80;
const REPEAT_MS = 220;

export function useMenuNav({ player, count, enabled, onConfirm, onBack, keyboard }: Options): number {
  const [focus, setFocus] = useState(0);
  const stateRef = useRef({ prevDir: 0, prevA: false, prevB: false, lastMove: 0 });
  const focusRef = useRef(0);
  focusRef.current = Math.min(focus, Math.max(0, count - 1));

  useEffect(() => {
    if (focus >= count && count > 0) setFocus(0);
  }, [count, focus]);

  useEffect(() => {
    if (!enabled || count === 0) return;
    const useKeyboard = keyboard ?? (player === 'any' || player === 0);

    const move = (dir: number) => {
      setFocus((f) => (f + dir + count) % count);
    };
    const confirm = () => onConfirm(focusRef.current);

    const iv = setInterval(() => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const relevant =
        player === 'any' ? [...pads].filter(Boolean) : pads[player] ? [pads[player]!] : [];
      let dir = 0;
      let a = false;
      let b = false;
      for (const pad of relevant) {
        if (!pad) continue;
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        if (pad.buttons[14]?.pressed || ax < -0.5 || pad.buttons[12]?.pressed || ay < -0.5) dir = -1;
        if (pad.buttons[15]?.pressed || ax > 0.5 || pad.buttons[13]?.pressed || ay > 0.5) dir = 1;
        if (pad.buttons[0]?.pressed) a = true;
        if (pad.buttons[1]?.pressed) b = true;
      }
      const s = stateRef.current;
      const now = performance.now();
      if (dir !== 0 && (dir !== s.prevDir || now - s.lastMove > REPEAT_MS)) {
        move(dir);
        s.lastMove = now;
      }
      if (a && !s.prevA) confirm();
      if (b && !s.prevB && onBack) onBack();
      s.prevDir = dir;
      s.prevA = a;
      s.prevB = b;
    }, POLL_MS);

    const onKey = (e: KeyboardEvent) => {
      if (!useKeyboard) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(1);
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'Backspace' && onBack) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(iv);
      window.removeEventListener('keydown', onKey);
    };
  }, [player, count, enabled, onConfirm, onBack, keyboard]);

  return focusRef.current;
}
