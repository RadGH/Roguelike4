import { useEffect, useState } from 'react';
import { GAME_TITLE, GAME_TAGLINE, GAME_VERSION } from '@game/branding';
import { GameView } from './GameView';

type Screen = { name: 'title' } | { name: 'arena'; seed: number };

export function App() {
  const debug = new URLSearchParams(window.location.search).has('debug');
  const [screen, setScreen] = useState<Screen>(
    debug ? { name: 'arena', seed: 12345 } : { name: 'title' },
  );

  useEffect(() => {
    if (screen.name !== 'title') return;
    const start = () => setScreen({ name: 'arena', seed: (Date.now() % 100000) + 1 });
    const onKey = () => start();
    const onPad = () => start();
    window.addEventListener('keydown', onKey);
    window.addEventListener('gamepadconnected', onPad);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('gamepadconnected', onPad);
    };
  }, [screen.name]);

  if (screen.name === 'arena') return <GameView seed={screen.seed} />;

  return (
    <main
      data-screen="title"
      onPointerDown={() => setScreen({ name: 'arena', seed: (Date.now() % 100000) + 1 })}
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% 40%, #3b2f57, #211a35)',
        color: '#fff4d6',
        fontFamily: 'system-ui',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', margin: 0, textShadow: '0 0 24px #ffb34788' }}>{GAME_TITLE}</h1>
        <p style={{ opacity: 0.85 }}>{GAME_TAGLINE}</p>
        <p style={{ marginTop: '3rem', animation: 'pulse 1.6s infinite' }}>Press any button</p>
        <p style={{ opacity: 0.4, fontSize: '0.8rem' }}>pre-production v{GAME_VERSION}</p>
      </div>
    </main>
  );
}
