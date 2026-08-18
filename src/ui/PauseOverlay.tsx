import type { Engine } from '@game/shell/engine';
import { PLAYER_COLORS_CSS } from '@game/shell/renderer';
import { useMenuNav } from './useMenuNav';

export function PauseOverlay({
  engine,
  playerCount,
  disconnectedPads,
  onQuit,
}: {
  engine: Engine;
  playerCount: number;
  disconnectedPads: number[];
  onQuit: () => void;
}) {
  const items = ['Resume', 'Quit to title'];
  const focus = useMenuNav({
    player: 'any',
    count: items.length,
    enabled: true,
    onConfirm: (i) => {
      if (i === 0) engine.togglePause();
      else onQuit();
    },
    onBack: () => engine.togglePause(),
  });

  return (
    <div
      data-screen="pause"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(20,14,34,0.75)',
        fontFamily: 'system-ui',
        color: '#fff4d6',
        zIndex: 20,
      }}
    >
      <div
        style={{
          background: 'rgba(43,33,64,0.96)',
          border: '3px solid #b88ae0',
          borderRadius: 16,
          padding: '22px 34px',
          textAlign: 'center',
          minWidth: 280,
          boxShadow: '0 8px 40px #000a',
        }}
      >
        <h2 style={{ margin: '0 0 4px', color: '#ffd97a' }}>Paused</h2>
        {disconnectedPads.length > 0 && (
          <p style={{ color: '#ff9ad5', fontWeight: 700, fontSize: 14 }} data-warning="controller-lost">
            🎮 Controller lost for{' '}
            {disconnectedPads.map((i) => `P${i + 1}`).join(', ')} — reconnect it, then resume.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {items.map((label, i) => (
            <button
              key={label}
              onClick={() => (i === 0 ? engine.togglePause() : onQuit())}
              data-pause-item={i}
              style={{
                background: focus === i ? '#ffd97a' : '#3b2f57',
                color: focus === i ? '#2b2140' : '#fff4d6',
                border: `2px solid ${focus === i ? '#ffd97a' : '#b88ae0'}`,
                borderRadius: 10,
                padding: '10px 22px',
                fontWeight: 800,
                fontSize: 15,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8 }}>
          {Array.from({ length: playerCount }, (_, i) => (
            <span key={i} style={{ color: PLAYER_COLORS_CSS[i], marginRight: 10 }}>
              P{i + 1}: {i === 0 ? 'keyboard / pad 1' : `pad ${i + 1}`}
              {disconnectedPads.includes(i) ? ' ⚠️' : ''}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }}>Esc / Start resumes · any player can act</div>
      </div>
    </div>
  );
}
