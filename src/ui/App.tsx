import { useEffect, useState } from 'react';
import { GAME_TITLE, GAME_TAGLINE, GAME_VERSION } from '@game/branding';
import { GameView } from './GameView';
import { SlotsScreen } from './SlotsScreen';
import { TownScreen } from './TownScreen';

type Screen =
  | { name: 'title' }
  | { name: 'slots' }
  | { name: 'town'; slot: number }
  | { name: 'arena'; seed: number; players: number; slot: number; act: number; classIds: string[] };

export function App() {
  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const forcedPlayers = Number(params.get('players')) || 0;
  const [screen, setScreen] = useState<Screen>(
    debug
      ? {
          name: 'arena',
          seed: 12345,
          players: Math.min(4, Math.max(1, forcedPlayers || 1)),
          slot: 1,
          act: Number(params.get('act')) || 1,
          classIds: (params.get('classes') ?? '').split(',').filter(Boolean),
        }
      : { name: 'title' },
  );

  useEffect(() => {
    if (screen.name !== 'title') return;
    const start = () => setScreen({ name: 'slots' });
    window.addEventListener('keydown', start);
    return () => window.removeEventListener('keydown', start);
  }, [screen.name]);

  if (screen.name === 'arena') {
    return (
      <GameView
        seed={screen.seed}
        playerCount={screen.players}
        slot={screen.slot}
        startAct={screen.act}
        classIds={screen.classIds}
        onExit={() => setScreen(debug ? { name: 'title' } : { name: 'town', slot: screen.slot })}
      />
    );
  }

  if (screen.name === 'slots') {
    return (
      <SlotsScreen
        onPick={(slot) => setScreen({ name: 'town', slot })}
        onBack={() => setScreen({ name: 'title' })}
      />
    );
  }

  if (screen.name === 'town') {
    return (
      <TownScreen
        slot={screen.slot}
        onStart={({ act, players, classIds }) =>
          setScreen({
            name: 'arena',
            seed: (Date.now() % 1000000) + 1,
            players,
            slot: screen.slot,
            act,
            classIds,
          })
        }
        onBack={() => setScreen({ name: 'slots' })}
      />
    );
  }

  return (
    <main
      data-screen="title"
      onPointerDown={() => setScreen({ name: 'slots' })}
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
        <p style={{ marginTop: '3rem' }}>Press any key to light your wick</p>
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          couch co-op: connect up to 4 controllers before setting out — or join between waves
        </p>
        <p style={{ opacity: 0.4, fontSize: '0.8rem' }}>v{GAME_VERSION}</p>
        <p style={{ fontSize: '0.85rem' }}>
          {/* stopPropagation: following a link must not also start the game */}
          <a
            href="guide/index.html"
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ color: '#ffd97a', opacity: 0.75, marginRight: '1.25rem' }}
          >
            Player Guide
          </a>
          <a
            href="manual/index.html"
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ color: '#ffd97a', opacity: 0.75 }}
          >
            Manual
          </a>
        </p>
      </div>
    </main>
  );
}
