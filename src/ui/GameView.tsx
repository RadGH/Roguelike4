import { useEffect, useRef, useState } from 'react';
import { Engine } from '@game/shell/engine';

type Hud = ReturnType<Engine['hud']>;

export function GameView({ seed }: { seed: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new Engine(seed, 1);
    let disposed = false;
    void engine.mount(el).catch((err) => {
      if (!disposed) console.error('engine mount failed', err);
    });
    const hudTimer = setInterval(() => {
      if (!disposed) setHud(engine.hud());
    }, 250);
    return () => {
      disposed = true;
      clearInterval(hudTimer);
      engine.dispose();
    };
  }, [seed]);

  return (
    <div ref={mountRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }} data-screen="arena">
      {hud && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            color: '#fff',
            fontFamily: 'system-ui',
            fontWeight: 700,
            textShadow: '0 1px 3px #0009',
            pointerEvents: 'none',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontSize: 18 }}>
            ❤️ {hud.hp}/{hud.maxHp} · Lv {hud.level} {!hud.alive && '— snuffed!'}
          </div>
          <div>
            💰 {hud.gold} ✨ {hud.xp} ⚔️ {hud.kills}
            {hud.chests > 0 && <> 🧰 {hud.chests}</>}
          </div>
        </div>
      )}
      {hud && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontFamily: 'system-ui',
            fontWeight: 800,
            textAlign: 'center',
            textShadow: '0 1px 3px #0009',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 20 }}>Wave {hud.wave}</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {hud.cleared ? 'wave cleared! ✨' : `${hud.enemies} foes about`}
          </div>
          {hud.combo >= 5 && (
            <div style={{ fontSize: 22, color: hud.combo >= 20 ? '#ff5c5c' : hud.combo >= 10 ? '#ffb347' : '#ffee66' }}>
              ×{hud.combo} COMBO!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
