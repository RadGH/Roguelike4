import type { Engine } from '@game/shell/engine';
import { MeterTable } from './MeterTable';
import { useMenuNav } from './useMenuNav';

export function RunEndOverlay({
  kind,
  engine,
  act,
  continueOption,
  onExit,
}: {
  kind: 'gameOver' | 'victory';
  engine: Engine;
  act: number;
  continueOption: 'nextAct' | 'endless' | null;
  onExit: () => void;
}) {
  const meters = engine.meters();
  const victory = kind === 'victory';
  const exit = () => {
    engine.finishRun();
    onExit();
  };
  const items = continueOption ? 2 : 1;
  const focus = useMenuNav({
    player: 'any',
    count: items,
    enabled: true,
    onConfirm: (i) => {
      if (continueOption && i === 0) engine.continueRun();
      else exit();
    },
  });
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
            <h1 style={{ margin: 0, color: '#ffd97a' }}>
              {act >= 4 ? '🔥 The Everflame Roars! 🔥' : `🔥 Act ${act} Relit! 🔥`}
            </h1>
            <p style={{ opacity: 0.9 }}>
              {act >= 4
                ? 'The Grand Snuff has been tucked back into bed. Flickermoor is saved!'
                : `The beacon burns again. ${continueOption ? 'Press on, or carry the light home.' : 'Your Emberkey unlocks the next act for future runs.'}`}
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          {continueOption && (
            <button
              onClick={() => engine.continueRun()}
              data-action="continue-run"
              style={{
                background: focus === 0 ? '#ffd97a' : '#3b2f57',
                color: focus === 0 ? '#2b2140' : '#fff4d6',
                border: '2px solid #ffd97a',
                borderRadius: 10,
                padding: '10px 26px',
                fontWeight: 800,
                fontSize: 16,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {continueOption === 'nextAct' ? `Press on to Act ${act + 1} ▶` : 'Into the endless dark 🌒'}
            </button>
          )}
          <button
            onClick={exit}
            data-action="exit-to-title"
            style={{
              background: focus === items - 1 ? '#ffd97a' : '#3b2f57',
              color: focus === items - 1 ? '#2b2140' : '#fff4d6',
              border: '2px solid #b88ae0',
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
    </div>
  );
}
