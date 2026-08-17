import { useEffect, useRef } from 'react';
import { Engine } from '@game/shell/engine';

export function GameView({ seed }: { seed: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new Engine(seed, 1);
    let disposed = false;
    void engine.mount(el).catch((err) => {
      if (!disposed) console.error('engine mount failed', err);
    });
    return () => {
      disposed = true;
      engine.dispose();
    };
  }, [seed]);

  return <div ref={mountRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }} data-screen="arena" />;
}
