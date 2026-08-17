import { GAME_TITLE, GAME_TAGLINE, GAME_VERSION } from '@game/branding';

// Placeholder shell — replaced by the real screen router as systems land.
export function App() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>{GAME_TITLE}</h1>
        <p>{GAME_TAGLINE}</p>
        <p style={{ opacity: 0.5 }}>pre-production build v{GAME_VERSION}</p>
      </div>
    </main>
  );
}
