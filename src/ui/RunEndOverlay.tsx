import type { Engine } from '@game/shell/engine';
import { MeterTable } from './MeterTable';
import { useMenuNav } from './useMenuNav';

export function RunEndOverlay({
  kind,
  engine,
  onExit,
}: {
  kind: 'gameOver' | 'victory';
  engine: Engine;
  onExit: () => void;
}) {
  const meters = engine.meters();
  const victory = kind === 'victory';
  useMenuNav({ player: 'any', count: 1, enabled: true, onConfirm: onExit });
  return (
    <div
      data-screen={victory ? 'victory' : 'game-over'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: victory ? 'rgba(43,33,64,0.82)' : 'rgba(20,14,34,0.88)',
        fontFamily: 'system-ui',
        color: '#fff4d6',
      }}
    >
      <div
        style={{
          background: 'rgba(43,33,64,0.96)',
          border: `3px solid ${victory ? '#ffd97a' : '#8a5fc0'}`,
          borderRadius: 16,
          padding: '22px 30px',
          maxWidth: 'min(480px, 92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          textAlign: 'center',
          boxShadow: '0 8px 40px #000a',
        }}
      >
        {victory ? (
          <>
            <h1 style={{ margin: 0, color: '#ffd97a' }}>🔥 The Meadow is Relit! 🔥</h1>
            <p style={{ opacity: 0.9 }}>
              Mopsy has been un-glomped. Act 1 complete — the Emberkey is yours!
              <br />
              <span style={{ fontSize: 12, opacity: 0.7 }}>(Acts 2–4 and the town are on the way.)</span>
            </p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, color: '#b88ae0' }}>Snuffed Out</h1>
            <p style={{ opacity: 0.9 }}>
              The dark got a little too cozy. The Everflame remembers your light.
            </p>
          </>
        )}
        <MeterTable meters={meters} />
        <button
          onClick={onExit}
          data-action="exit-to-title"
          style={{
            marginTop: 16,
            background: '#ffd97a',
            color: '#2b2140',
            border: 'none',
            borderRadius: 10,
            padding: '10px 26px',
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Back to title
        </button>
      </div>
    </div>
  );
}
