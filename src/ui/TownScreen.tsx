import { useEffect, useState } from 'react';
import { loadProfile, saveProfile } from '@game/meta/profile';
import { buyClass, buyItem, buyUpgrade, SHOPS, upgradeLevel, upgradePrice } from '@game/meta/shop';
import { loadRegistry } from '@game/data/registry';
import { listRuns, type RunRecord } from '@game/meta/history';
import { GAME_TITLE } from '@game/branding';
import { PLAYER_COLORS_CSS } from '@game/shell/renderer';
import { cardBtnStyle, COLORS, panelStyle, screenStyle } from './theme';
import { CodexPanel } from './CodexPanel';
import { useMenuNav } from './useMenuNav';

const registry = loadRegistry();

type TownView = 'square' | 'bellhop' | 'codex' | 'chronicle' | 'tinker' | 'flick' | 'cinder' | 'mayor';

function connectedPads(): number {
  if (!navigator.getGamepads) return 0;
  return [...navigator.getGamepads()].filter(Boolean).length;
}

const NPCS: { id: TownView; icon: string; name: string; blurb: string }[] = [
  { id: 'bellhop', icon: '🔔', name: 'The Bellhop', blurb: 'Set out on a run' },
  { id: 'flick', icon: '🥋', name: 'Grandmaster Flick', blurb: 'Class training (glimmers)' },
  { id: 'cinder', icon: '🔥', name: 'Forgemaster Cinder', blurb: 'Unlock old arms (glimmers)' },
  { id: 'mayor', icon: '🕯️', name: 'Mayor Tallow', blurb: 'Town upgrades (glimmers)' },
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
  onStart: (opts: { act: number; players: number; classIds: string[] }) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<TownView>('square');
  const [runHistory, setRunHistory] = useState<RunRecord[] | null>(null);
  useEffect(() => {
    if (view !== 'chronicle') return;
    let alive = true;
    void listRuns(slot, 10).then((rows) => {
      if (alive) setRunHistory(rows.reverse()); // newest first
    });
    return () => {
      alive = false;
    };
  }, [view, slot]);
  const [selectedAct, setSelectedAct] = useState(1);
  const [, forceRender] = useState(0);
  const profile = loadProfile(window.localStorage, slot);
  const commit = () => {
    saveProfile(window.localStorage, profile);
    forceRender((n) => n + 1);
  };
  const unlockedActs = 1 + profile.actsCleared.filter((a) => a < 4).length; // acts 1..N playable
  const unlockedClasses = [...registry.classes.values()].filter((c) =>
    profile.unlockedClasses.includes(c.id),
  );
  const playerCount = Math.min(4, Math.max(1, connectedPads() || 1));

  const squareFocus = useMenuNav({
    player: 'any',
    count: NPCS.length,
    enabled: view === 'square',
    onConfirm: (i) => setView(NPCS[i]!.id),
    onBack,
  });

  // Class rows: pad/keyboard focus drives selection; mouse clicks set it directly.
  // Fixed hook count (max party of 4) — `enabled` gates the live ones.
  const [sel, setSel] = useState([0, 0, 0, 0]);
  const start = () =>
    onStart({
      act: selectedAct,
      players: playerCount,
      classIds: sel
        .slice(0, playerCount)
        .map((s) => unlockedClasses[Math.min(s, unlockedClasses.length - 1)]?.id ?? 'hero'),
    });
  const classFocus = [0, 1, 2, 3].map((i) =>
    // hooks in a fixed-length map: array length and order never change, so hook
    // order is stable across renders
    useMenuNav({
      player: i,
      count: unlockedClasses.length,
      enabled: view === 'bellhop' && i < playerCount,
      onConfirm: start, // A / Enter sets out at the selected act
      onBack: i === 0 ? () => setView('square') : undefined,
      keyboard: i === 0,
    }),
  );
  useEffect(() => {
    setSel((prev) => {
      const next = [...prev];
      let changed = false;
      classFocus.forEach((f, i) => {
        if (next[i] !== f) {
          next[i] = f;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [classFocus[0], classFocus[1], classFocus[2], classFocus[3]]);

  // Number keys pick the destination act
  useEffect(() => {
    if (view !== 'bellhop') return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= unlockedActs) setSelectedAct(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, unlockedActs]);

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
            </div>
            <button onClick={onBack} style={{ ...miniLink, marginTop: 14 }} data-action="back-to-slots">
              ← change save slot
            </button>
          </>
        )}

        {view === 'bellhop' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 10px' }}>🔔 Where to, Wicklighters?</h2>

            {Array.from({ length: playerCount }, (_, i) => (
              <div key={i} style={{ margin: '6px 0' }}>
                <span style={{ color: PLAYER_COLORS_CSS[i], fontWeight: 800, fontSize: 13, marginRight: 8 }}>
                  P{i + 1}
                </span>
                {unlockedClasses.map((c, ci) => {
                  const selected = sel[i] === ci;
                  return (
                    <button
                      key={c.id}
                      data-class-pick={`${i}-${c.id}`}
                      title={c.blurb}
                      onClick={() =>
                        setSel((prev) => {
                          const next = [...prev];
                          next[i] = ci;
                          return next;
                        })
                      }
                      style={{
                        ...cardBtnStyle(selected),
                        padding: '6px 12px',
                        fontSize: 13,
                        marginRight: 6,
                        borderColor: selected ? PLAYER_COLORS_CSS[i] : undefined,
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            ))}
            <p style={{ fontSize: 11.5, opacity: 0.65, margin: '4px 0 10px' }}>
              cycle class with ←/→ (stick or arrows) · more classes unlock through deeds — see the Codex
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((act) => {
                const open = act <= unlockedActs;
                return (
                  <button
                    key={act}
                    disabled={!open}
                    data-start-act={act}
                    onClick={() => setSelectedAct(act)}
                    style={{
                      ...cardBtnStyle(open && selectedAct === act),
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
            <button
              onClick={start}
              data-action="set-out"
              style={{ ...cardBtnStyle(true), marginTop: 12, fontSize: 16, padding: '10px 30px' }}
            >
              Set out ▶ (A / Enter)
            </button>
            <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
              {connectedPads() > 0
                ? `${Math.min(4, connectedPads())} controller(s) connected — the whole couch sets out together.`
                : 'Keyboard + mouse ready. Connect controllers before starting for couch co-op.'}
            </p>
            <button onClick={() => setView('square')} style={miniLink} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'flick' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 4px' }}>🥋 Grandmaster Flick</h2>
            <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 10px' }}>{SHOPS.flick.blurb}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {SHOPS.flick.classes.map((c) => {
                const cls = registry.classes.get(c.id);
                const owned = profile.unlockedClasses.includes(c.id);
                const afford = profile.glimmers >= c.price;
                return (
                  <div key={c.id} style={{ border: `2px solid ${owned ? COLORS.gold : COLORS.panelBorder}`, borderRadius: 10, padding: '10px 14px', width: 170 }}>
                    <div style={{ fontWeight: 800 }}>{cls?.name ?? c.id}</div>
                    <div style={{ fontSize: 11, opacity: 0.8, minHeight: 40 }}>{cls?.blurb}</div>
                    {owned ? (
                      <div style={{ fontSize: 12, color: COLORS.gold }}>trained ✓</div>
                    ) : (
                      <button
                        data-buy-class={c.id}
                        disabled={!afford}
                        onClick={() => {
                          if (buyClass(profile, c.id, c.price).ok) commit();
                        }}
                        style={{ ...cardBtnStyle(false), padding: '4px 12px', fontSize: 12, opacity: afford ? 1 : 0.45 }}
                      >
                        ✨ {c.price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Deeds unlock these too — the Codex shows how.</p>
            <button onClick={() => setView('square')} style={miniLink} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'cinder' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 4px' }}>🔥 Forgemaster Cinder</h2>
            <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 10px' }}>{SHOPS.cinder.blurb}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {SHOPS.cinder.items.map((it) => {
                const owned = profile.unlockedItems.includes(it.id);
                const afford = profile.glimmers >= it.price;
                const name = it.id
                  .split('-')
                  .map((s) => s[0]!.toUpperCase() + s.slice(1))
                  .join(' ');
                return (
                  <div key={it.id} style={{ border: `2px solid ${owned ? COLORS.gold : COLORS.panelBorder}`, borderRadius: 10, padding: '8px 12px', width: 150 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{name}</div>
                    {owned ? (
                      <div style={{ fontSize: 12, color: COLORS.gold }}>forged ✓</div>
                    ) : (
                      <button
                        data-buy-item={it.id}
                        disabled={!afford}
                        onClick={() => {
                          if (buyItem(profile, it.id, it.price).ok) commit();
                        }}
                        style={{ ...cardBtnStyle(false), padding: '3px 10px', fontSize: 12, opacity: afford ? 1 : 0.45 }}
                      >
                        ✨ {it.price}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setView('square')} style={{ ...miniLink, marginTop: 10 }} data-action="back-to-town">
              ← back to the square
            </button>
          </>
        )}

        {view === 'mayor' && (
          <>
            <h2 style={{ color: COLORS.gold, fontSize: 18, margin: '4px 0 4px' }}>🕯️ Mayor Tallow</h2>
            <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 10px' }}>{SHOPS.mayor.blurb}</p>
            <div style={{ display: 'grid', gap: 8, maxWidth: 440, margin: '0 auto' }}>
              {SHOPS.mayor.upgrades.map((u) => {
                const level = upgradeLevel(profile, u.id);
                const maxed = level >= u.maxLevel;
                const price = upgradePrice(u, level);
                const afford = profile.glimmers >= price;
                return (
                  <div key={u.id} style={{ border: `2px solid ${COLORS.panelBorder}`, borderRadius: 10, padding: '8px 12px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                          {u.name} <span style={{ opacity: 0.7 }}>({level}/{u.maxLevel})</span>
                        </div>
                        <div style={{ fontSize: 11.5, opacity: 0.8 }}>{u.desc}</div>
                      </div>
                      {maxed ? (
                        <span style={{ color: COLORS.gold, fontSize: 12 }}>max ✓</span>
                      ) : (
                        <button
                          data-buy-upgrade={u.id}
                          disabled={!afford}
                          onClick={() => {
                            if (buyUpgrade(profile, u).ok) commit();
                          }}
                          style={{ ...cardBtnStyle(false), padding: '4px 12px', fontSize: 12, opacity: afford ? 1 : 0.45 }}
                        >
                          ✨ {price}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setView('square')} style={{ ...miniLink, marginTop: 10 }} data-action="back-to-town">
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
            <h3 style={{ color: COLORS.gold, fontSize: 14, margin: '14px 0 6px' }}>Recent runs</h3>
            {runHistory === null ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>Soot flips through the pages…</div>
            ) : runHistory.length === 0 ? (
              <div style={{ opacity: 0.6, fontSize: 13 }}>No entries yet — every story starts with a first run.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
                {runHistory.map((r, i) => (
                  <details key={i} style={{ border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}>
                    <summary style={{ cursor: 'pointer' }}>
                      {r.won ? '🏆' : '🕯️'} {new Date(r.ts).toLocaleDateString()} — Act {r.actReached}, wave {r.waveReached} ·{' '}
                      {r.players.map((p) => p.classId).join(' + ')} · {r.durationSec >= 60 ? `${Math.floor(r.durationSec / 60)}m` : `${r.durationSec}s`}
                    </summary>
                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                      {r.players.map((p, pi) => (
                        <div key={pi}>
                          P{pi + 1} {p.classId} · Lv {p.level} · ⚔️ {p.kills} · {p.damage} dmg
                        </div>
                      ))}
                      {r.topItems.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <b>Top damage:</b>{' '}
                          {r.topItems
                            .slice(0, 5)
                            .map((t) => `${t.itemId} (${t.damage})`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
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
