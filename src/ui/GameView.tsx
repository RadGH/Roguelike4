import { useEffect, useRef, useState } from 'react';
import { Engine } from '@game/shell/engine';
import { PLAYER_COLORS_CSS } from '@game/shell/renderer';
import { IntermissionOverlay } from './IntermissionOverlay';
import { RunEndOverlay } from './RunEndOverlay';
import { PauseOverlay } from './PauseOverlay';

type Hud = ReturnType<Engine['hud']>;
type IntermissionData = ReturnType<Engine['intermission']>;

const CORNERS: React.CSSProperties[] = [
  { left: 12, bottom: 12 },
  { right: 12, bottom: 12, textAlign: 'right' },
  { left: 12, top: 52 },
  { right: 12, top: 52, textAlign: 'right' },
];

export function GameView({
  seed,
  playerCount,
  slot,
  startAct,
  resume,
  classIds,
  onExit,
}: {
  seed: number;
  playerCount: number;
  slot: number;
  startAct: number;
  resume?: boolean;
  classIds: string[];
  onExit: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [intermission, setIntermission] = useState<IntermissionData>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new Engine(seed, playerCount, window.localStorage, { slot, startAct, classIds, resume });
    engineRef.current = engine;
    let disposed = false;
    void engine.mount(el).catch((err) => {
      if (!disposed) console.error('engine mount failed', err);
    });
    const hudTimer = setInterval(() => {
      if (!disposed) {
        setHud(engine.hud());
        setIntermission(engine.intermission());
      }
    }, 200);
    return () => {
      disposed = true;
      clearInterval(hudTimer);
      engineRef.current = null;
      engine.dispose();
    };
  }, [seed, playerCount, slot, startAct]);

  return (
    <div ref={mountRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }} data-screen="arena">
      {hud?.players.map((p) => (
        <div
          key={p.index}
          data-player-hud={p.index}
          style={{
            position: 'absolute',
            ...CORNERS[p.index],
            color: '#fff',
            fontFamily: 'system-ui',
            fontWeight: 700,
            textShadow: '0 1px 3px #0009',
            pointerEvents: 'none',
            lineHeight: 1.45,
            borderLeft: p.index % 2 === 0 ? `4px solid ${PLAYER_COLORS_CSS[p.index]}` : undefined,
            borderRight: p.index % 2 === 1 ? `4px solid ${PLAYER_COLORS_CSS[p.index]}` : undefined,
            padding: '2px 8px',
          }}
        >
          <div style={{ fontSize: 16 }}>
            <span style={{ color: PLAYER_COLORS_CSS[p.index] }}>P{p.index + 1}</span> ❤️ {p.hp}/{p.maxHp} · Lv{' '}
            {p.level}
            {!p.alive && ' 💨'}
          </div>
          <div style={{ fontSize: 13 }}>
            ⚔️ {p.kills}
            {p.chests > 0 && <> 🧰 {p.chests}</>}
          </div>
        </div>
      ))}
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
          <div style={{ fontSize: 20 }}>
            {hud.endless ? '🌒 Endless' : `Act ${hud.act}`} · Wave {hud.wave} · 💰 {hud.gold}
          </div>
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
      {hud?.boss && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(620px, 70vw)',
            textAlign: 'center',
            fontFamily: 'system-ui',
            pointerEvents: 'none',
          }}
          data-boss-bar
        >
          <div style={{ color: '#fff4d6', fontWeight: 800, textShadow: '0 1px 3px #000c', marginBottom: 4 }}>
            {hud.boss.name}
          </div>
          <div style={{ position: 'relative', height: 16, background: '#2b2140cc', borderRadius: 8, border: '2px solid #b88ae0' }}>
            <div
              style={{
                position: 'absolute',
                inset: 2,
                width: `${hud.boss.hpFrac * 100}%`,
                background: 'linear-gradient(90deg,#b88ae0,#8a5fc0)',
                borderRadius: 6,
                transition: 'width 0.2s',
              }}
            />
            {hud.boss.notches.map((n) => (
              <div
                key={n}
                style={{ position: 'absolute', left: `${n * 100}%`, top: 0, bottom: 0, width: 2, background: '#ffd97a' }}
              />
            ))}
          </div>
        </div>
      )}
      {hud && hud.toasts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            pointerEvents: 'none',
            zIndex: 15,
          }}
        >
          {hud.toasts.map((t) => (
            <div
              key={t.id}
              data-toast
              style={{
                background: 'rgba(43,33,64,0.92)',
                border: '2px solid #ffd97a',
                borderRadius: 10,
                color: '#fff4d6',
                fontFamily: 'system-ui',
                fontWeight: 800,
                padding: '8px 18px',
                textAlign: 'center',
              }}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
      {hud?.paused && engineRef.current && (
        <PauseOverlay
          engine={engineRef.current}
          playerCount={hud.players.length}
          disconnectedPads={hud.disconnectedPads}
          onQuit={onExit}
        />
      )}
      {hud && hud.runState !== 'playing' && engineRef.current && (
        <RunEndOverlay
          kind={hud.runState as 'gameOver' | 'victory'}
          engine={engineRef.current}
          act={hud.act}
          continueOption={hud.continueOption}
          onExit={onExit}
        />
      )}
      {hud?.runState === 'playing' && intermission && engineRef.current && (
        <IntermissionOverlay data={intermission} engine={engineRef.current} />
      )}
    </div>
  );
}
