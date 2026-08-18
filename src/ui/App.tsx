import { useEffect, useState } from 'react';
import { GAME_TITLE, GAME_TAGLINE, GAME_VERSION } from '@game/branding';
import { GameView } from './GameView';

type Screen = { name: 'title' } | { name: 'arena'; seed: number; players: number };

function connectedPads(): number {
  if (!navigator.getGamepads) return 0;
  return [...navigator.getGamepads()].filter(Boolean).length;
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const forcedPlayers = Number(params.get('players')) || 0;
  const [screen, setScreen] = useState<Screen>(
    debug
      ? { name: 'arena', seed: 12345, players: Math.min(4, Math.max(1, forcedPlayers || 1)) }
      : { name: 'title' },
  );

  useEffect(() => {
    if (screen.name !== 'title') return;
    const start = () =>
      setScreen({
        name: 'arena',
        seed: (Date.now() % 100000) + 1,
        // Party size: every connected pad joins; keyboard guarantees P1.
        players: Math.min(4, Math.max(1, forcedPlayers || connectedPads() || 1)),
      });
    const onKey = () => start();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [screen.name, forcedPlayers]);

  if (screen.name === 'arena')
    return (
      <GameView
        seed={screen.seed}
        playerCount={screen.players}
        onExit={() => setScreen({ name: 'title' })}
      />
    );

  return (
    <main
      data-screen="title"
      onPointerDown={() =>
        setScreen({
          name: 'arena',
          seed: (Date.now() % 100000) + 1,
          players: Math.min(4, Math.max(1, forcedPlayers || connectedPads() || 1)),
        })
      }
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
        <p style={{ marginTop: '3rem', animation: 'pulse 1.6s infinite' }}>Press any key to light your wick</p>
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          couch co-op: connect up to 4 controllers before starting — or join between waves
        </p>
        <p style={{ opacity: 0.4, fontSize: '0.8rem' }}>pre-production v{GAME_VERSION}</p>
      </div>
    </main>
  );
}
