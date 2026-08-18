import { useState } from 'react';
import { loadProfile } from '@game/meta/profile';
import { GAME_TITLE } from '@game/branding';
import { cardBtnStyle, COLORS, panelStyle, screenStyle } from './theme';
import { CodexPanel } from './CodexPanel';
import { useMenuNav } from './useMenuNav';

type TownView = 'square' | 'bellhop' | 'codex' | 'chronicle' | 'tinker';

function connectedPads(): number {
  if (!navigator.getGamepads) return 0;
  return [...navigator.getGamepads()].filter(Boolean).length;
}

const NPCS: { id: TownView; icon: string; name: string; blurb: string }[] = [
  { id: 'bellhop', icon: '🔔', name: 'The Bellhop', blurb: 'Set out on a run' },
  { id: 'codex', icon: '📖', name: 'Archivist Glow', blurb: 'The Codex — deeds, weapons, foes' },
  { id: 'chronicle', icon: '🦋', name: 'Chronicler Soot', blurb: 'Your story so far' },
  { id: 'tinker', icon: '🔧', name: 'Fizzwick', blurb: 'Settings & save tools' },
];

export function TownScreen({
  slot,
  onStart,
  onBack,
}: {
  slot: number;
  onStart: (opts: { act: number; players: number }) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<TownView>('square');
  const profile = loadProfile(window.localStorage, slot);
  const unlockedActs = 1 + profile.actsCleared.filter((a) => a < 4).length; // acts 1..N playable

  const squareFocus = useMenuNav({
    player: 'any',
    count: NPCS.length,
    enabled: view === 'square',
    onConfirm: (i) => setView(NPCS[i]!.id),
    onBack,
  });

  const actFocus = useMenuNav({
    player: 'any',
    count: unlockedActs,
    enabled: view === 'bellhop',
    onConfirm: (i) => onStart({ act: i + 1, players: Math.min(4, Math.max(1, connectedPads() || 1)) }),
    onBack: () => setView('square'),
  });

  return (
    <div style={screenStyle} data-screen="town">
      <div style={{ ...panelStyle, minWidth: 'min(680px, 92vw)' }}>
        <h1 style={{ margin: '0 0 2px', color: COLORS.gold, fontSize: 26 }}>Wickburrow</h1>
        <p style={{ margin: '0 0 4px', opacity: 0.8, fontSize: 13 }}>
          The little town beneath the Everflame · {GAME_TITLE}
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13 }}>
          🔑 {profile.emberkeys} · ✨ {profile.glimmers} glimmers · 🏁 {profile.lifetime.wins} wins
        </p>

        {view === 'square' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {NPCS.map((npc, i) => (
                <button
                  key={npc.id}
                  data-npc={npc.id}
                  onClick={() => setView(npc.id)}
                  style={{ ...cardBtnStyle(squareFocus === i), textAlign: 'left', padding: '14px 16px' }}
                >
                  <div style={{ fontSize: 20 }}>
                    {npc.icon} {npc.name}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>{npc.blurb}</div>
                </button>
              ))}
              <button
                disabled
                title="Opens in a future update"
                style={{ ...cardBtnStyle(false), opacity: 0.45, cursor: 'default', textAlign: 'left', padding: '14px 16px' }}
              >
                <div style={{ fontSize: 20 }}>🥋 Grandmaster Flick</div>
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>Class training — coming with the class update</div>
              </button>
              <button
                disabled
                title="Opens in a future update"
                style={{ ...cardBtnStyle(false), opacity: 0.45, cursor: 'default', textAlign: 'left', padding: '14px 16px' }}
              >
                <div style={{ fontSize: 20 }}>🔥 Forgemaster Cinder</div>
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>Item shop — coming with the glimmer shops</div>
              </button>
            </div>
            <button onClick={onBack} style={{ ...miniLink, marginTop: 14 }} data-action="back-to-slots">
              ← change save slot
            </button>
          </>
        )}

        {view === 'bellhop' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 10px' }}>🔔 Where to, Wicklighter?</h2>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((act) => {
                const open = act <= unlockedActs;
                return (
                  <button
                    key={act}
                    disabled={!open}
                    data-start-act={act}
                    onClick={() => onStart({ act, players: Math.min(4, Math.max(1, connectedPads() || 1)) })}
                    style={{
                      ...cardBtnStyle(open && actFocus === act - 1),
                      opacity: open ? 1 : 0.4,
                      cursor: open ? 'pointer' : 'default',
                      width: 130,
                    }}
                  >
                    <div>Act {act}</div>
                    <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
                      {['Guttering Meadows', 'Sogbottom Marsh', 'The Frosted Wick', 'The Snuffed Palace'][act - 1]}
                    </div>
                    {!open && <div style={{ fontSize: 11 }}>🔒 needs {act - 1} emberkey{act > 2 ? 's' : ''}</div>}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
              {connectedPads() > 0
                ? `${Math.min(4, connectedPads())} controller(s) connected — the whole couch sets out together.`
                : 'Keyboard + mouse ready. Connect controllers before starting for couch co-op.'}
            </p>
            <button onClick={() => setView('square')} style={miniLink} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'codex' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 10px' }}>📖 The Codex</h2>
            <CodexPanel profile={profile} />
            <button onClick={() => setView('square')} style={miniLink} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'chronicle' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 10px' }}>🦋 The story so far</h2>
            <div style={{ fontSize: 14, lineHeight: 2 }}>
              Runs set out: <b>{profile.lifetime.runs}</b> · Victories: <b>{profile.lifetime.wins}</b>
              <br />
              Foes snuffed: <b>{profile.lifetime.kills}</b> · Deepest wave: <b>{profile.lifetime.deepestWave}</b>
              <br />
              Emberkeys: <b>{profile.emberkeys}</b> · Acts relit:{' '}
              <b>{profile.actsCleared.length ? profile.actsCleared.sort().join(', ') : 'none yet'}</b>
              {profile.endlessUnlocked && (
                <>
                  <br />
                  🌒 <i>The endless dark is open to you.</i>
                </>
              )}
            </div>
            <button onClick={() => setView('square')} style={{ ...miniLink, marginTop: 12 }} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'tinker' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 10px' }}>🔧 Fizzwick's workbench</h2>
            <p style={{ fontSize: 13, opacity: 0.85 }}>
              Save tools live on the slot screen (export / import / delete).
              <br />
              Video, audio, and control settings arrive with the polish pass.
            </p>
            <button onClick={() => setView('square')} style={miniLink} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const miniLink: React.CSSProperties = {
  background: 'transparent',
  color: '#b88ae0',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  textDecoration: 'underline',
};
