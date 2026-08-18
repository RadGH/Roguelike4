import { useEffect, useState } from 'react';
import { loadProfile, saveProfile } from '@game/meta/profile';
import { buyClass, buyItem, buyUpgrade, SHOPS, upgradeLevel, upgradePrice } from '@game/meta/shop';
import { loadRegistry } from '@game/data/registry';
import { listRuns, type RunRecord } from '@game/meta/history';
import { loadRunSave } from '@game/meta/runsave';
import { GAME_TITLE, SAVE_SLUG } from '@game/branding';
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
  onStart: (opts: { act: number; players: number; classIds: string[]; resume?: boolean }) => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<TownView>('square');
  const [runHistory, setRunHistory] = useState<RunRecord[] | null>(null);
  const [unlockInfo, setUnlockInfo] = useState<string | null>(null); // classId being inspected
  const [soundMuted, setSoundMuted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`${SAVE_SLUG}.audio`) ?? '{}').muted === true;
    } catch {
      return false;
    }
  });
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

  const [, forceRender] = useState(0);
  const profile = loadProfile(window.localStorage, slot);
  const commit = () => {
    saveProfile(window.localStorage, profile);
    forceRender((n) => n + 1);
  };
  // Runs always start at wave 1 and flow through every act — the pillar shows
  // which act's beacon is next to relight
  const nextObjectiveAct = [1, 2, 3, 4].find((a) => !profile.actsCleared.includes(a)) ?? null;
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
  const [ready, setReady] = useState([false, false, false, false]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const start = () =>
    onStart({
      act: 1,
      players: playerCount,
      classIds: sel
        .slice(0, playerCount)
        .map((s) => unlockedClasses[Math.min(s, unlockedClasses.length - 1)]?.id ?? 'hero'),
    });
  const toggleReady = (i: number) =>
    setReady((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  // All present players ready → a 3-2-1 countdown, cancelled if anyone unreadies
  useEffect(() => {
    const allReady = view === 'bellhop' && ready.slice(0, playerCount).every(Boolean);
    if (!allReady) {
      setCountdown(null);
      return;
    }
    setCountdown(3);
    const t0 = setInterval(() => {
      setCountdown((c) => (c === null ? null : c - 1));
    }, 1000);
    return () => clearInterval(t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, playerCount, ready.slice(0, playerCount).every(Boolean)]);
  useEffect(() => {
    if (countdown === 0) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);
  const classFocus = [0, 1, 2, 3].map((i) =>
    // hooks in a fixed-length map: array length and order never change, so hook
    // order is stable across renders
    useMenuNav({
      player: i,
      count: unlockedClasses.length,
      enabled: view === 'bellhop' && i < playerCount && !ready[i], // ready locks the pick
      onConfirm: () => toggleReady(i), // A / Enter readies up (again to cancel)
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
            {(() => {
              const rs = loadRunSave(localStorage, slot);
              if (!rs) return null;
              return (
                <button
                  data-action="resume-run"
                  onClick={() => onStart({ act: rs.act, players: rs.players.length, classIds: rs.players.map((p) => p.classId), resume: true })}
                  style={{
                    ...cardBtnStyle(false),
                    width: '100%',
                    marginBottom: 12,
                    border: '2px solid #8ce68c',
                    textAlign: 'left',
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ fontSize: 18, color: '#8ce68c' }}>▶ Resume run — Act {rs.act}, wave {rs.wave}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>
                    {rs.players.map((p) => `${p.classId} Lv${p.level}`).join(' + ')} · the candle never went out
                  </div>
                </button>
              );
            })()}
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

            {/* Player columns: each seat shows its pick and ready state */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {Array.from({ length: playerCount }, (_, i) => {
                const cls = unlockedClasses[Math.min(sel[i]!, unlockedClasses.length - 1)];
                return (
                  <div
                    key={i}
                    data-player-column={i}
                    style={{
                      border: `2px solid ${ready[i] ? '#8ce68c' : PLAYER_COLORS_CSS[i]}`,
                      borderRadius: 12,
                      padding: '10px 16px',
                      minWidth: 140,
                      background: ready[i] ? 'rgba(140,230,140,0.08)' : 'transparent',
                    }}
                  >
                    <div style={{ color: PLAYER_COLORS_CSS[i], fontWeight: 800, fontSize: 13 }}>P{i + 1}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, margin: '2px 0' }}>{cls?.name ?? 'Hero'}</div>
                    <div style={{ fontSize: 10.5, opacity: 0.75, minHeight: 28 }}>{cls?.blurb}</div>
                    <button
                      onClick={() => toggleReady(i)}
                      data-ready={i}
                      style={{
                        ...cardBtnStyle(!!ready[i]),
                        padding: '5px 14px',
                        fontSize: 13,
                        marginTop: 6,
                        borderColor: ready[i] ? '#8ce68c' : undefined,
                      }}
                    >
                      {ready[i] ? '✓ Ready' : 'Ready up'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Shared class grid: clicks assign to the first un-ready seat; pads use their stick */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 640, margin: '0 auto' }}>
              {unlockedClasses.map((c, ci) => {
                const pickedBy = sel
                  .slice(0, playerCount)
                  .map((s, i) => (Math.min(s, unlockedClasses.length - 1) === ci ? i : -1))
                  .filter((i) => i >= 0);
                return (
                  <button
                    key={c.id}
                    data-class-pick={c.id}
                    title={c.blurb}
                    onClick={() =>
                      setSel((prev) => {
                        const seat = ready.slice(0, playerCount).findIndex((r) => !r);
                        if (seat < 0) return prev;
                        const next = [...prev];
                        next[seat] = ci;
                        return next;
                      })
                    }
                    style={{
                      ...cardBtnStyle(pickedBy.length > 0),
                      padding: '6px 10px',
                      fontSize: 12.5,
                      borderColor: pickedBy.length > 0 ? PLAYER_COLORS_CSS[pickedBy[0]!] : undefined,
                    }}
                  >
                    {c.name}
                    {pickedBy.length > 0 && (
                      <span style={{ fontSize: 10, marginLeft: 4 }}>
                        {pickedBy.map((i) => `P${i + 1}`).join(' ')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, opacity: 0.65, margin: '6px 0 10px' }}>
              stick/arrows browse · A / Enter to ready up (again to cancel) · everyone ready → 3-2-1
            </p>
            {countdown !== null && countdown > 0 && (
              <div data-countdown style={{ fontSize: 34, fontWeight: 800, color: '#8ce68c', margin: '4px 0' }}>
                Setting out in {countdown}…
              </div>
            )}

            <div
              data-objective
              style={{
                border: `2px solid ${COLORS.panelBorder}`,
                borderRadius: 12,
                padding: '10px 18px',
                margin: '6px auto',
                maxWidth: 420,
                fontSize: 14,
              }}
            >
              {nextObjectiveAct !== null ? (
                <>
                  🎯 <b>Next objective:</b> relight the Act {nextObjectiveAct} beacon —{' '}
                  <i>{['Guttering Meadows', 'Sogbottom Marsh', 'The Frosted Wick', 'The Snuffed Palace'][nextObjectiveAct - 1]}</i>
                  <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>
                    Every run starts at wave 1 and presses through each act in turn — the upgrades
                    along the way are the whole point.
                  </div>
                </>
              ) : (
                <>
                  🌒 <b>All four beacons burn.</b> The endless dark awaits past wave 40.
                </>
              )}
            </div>

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
                // Discovery classes need their NPC rescued out in the wilds first
                const discovery = [...registry.discoveries.values()].find((d) => d.classId === c.id);
                const undiscovered = !!discovery && !profile.discoveries.includes(discovery.id);
                return (
                  <div key={c.id} style={{ border: `2px solid ${owned ? COLORS.gold : COLORS.panelBorder}`, borderRadius: 10, padding: '10px 14px', width: 170 }}>
                    <div style={{ fontWeight: 800 }}>{undiscovered ? '❓ A missing someone' : (cls?.name ?? c.id)}</div>
                    <div style={{ fontSize: 11, opacity: 0.8, minHeight: 40 }}>
                      {undiscovered
                        ? `Rumor places them somewhere in Act ${discovery.act}. Caged, probably. Rescue first.`
                        : cls?.blurb}
                    </div>
                    {undiscovered ? (
                      <button
                        onClick={() => setUnlockInfo(c.id)}
                        data-unlock-info={c.id}
                        style={{ background: 'transparent', border: 'none', color: '#b88ae0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}
                      >
                        🔒 not yet met — how?
                      </button>
                    ) : owned ? (
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
                    {!owned && cls?.unlock.type === 'deed' && (
                      <button
                        onClick={() => setUnlockInfo(c.id)}
                        data-unlock-info={c.id}
                        style={{ background: 'transparent', border: 'none', color: '#b88ae0', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', padding: 0, display: 'block', marginTop: 2 }}
                      >
                        or earn it free — how?
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Deeds unlock these too — the Codex shows how.</p>
            {unlockInfo && (() => {
              const cls = registry.classes.get(unlockInfo);
              const discovery = [...registry.discoveries.values()].find((d) => d.classId === unlockInfo);
              const deed = cls?.unlock.type === 'deed' ? registry.deeds.get(cls.unlock.deedId) : null;
              const progress = deed ? (profile.deedProgress[deed.id] ?? 0) : 0;
              return (
                <div
                  data-unlock-popup
                  onClick={() => setUnlockInfo(null)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(20,14,34,0.8)', display: 'grid', placeItems: 'center', zIndex: 50 }}
                >
                  <div style={{ ...panelStyle, maxWidth: 380, padding: '18px 24px', textAlign: 'left' }}>
                    <h3 style={{ margin: '0 0 8px', color: COLORS.gold }}>How to unlock {cls?.name ?? unlockInfo}</h3>
                    {discovery && !profile.discoveries.includes(discovery.id) && (
                      <p style={{ fontSize: 13 }}>
                        🕊️ <b>Rescue someone first.</b> Rumor places a caged soul somewhere in{' '}
                        <b>Act {discovery.act}</b>, on the middle waves. Stand close and hold interact to
                        free them — then Flick will happily take your glimmers.
                      </p>
                    )}
                    {deed && (
                      <p style={{ fontSize: 13 }}>
                        📜 <b>{deed.desc}</b>
                        {deed.hint && <><br /><i style={{ opacity: 0.8 }}>{deed.hint}</i></>}
                        <br />
                        <span style={{ opacity: 0.8 }}>Progress: {Math.min(progress, deed.target)} / {deed.target}</span>
                      </p>
                    )}
                    {!deed && !discovery && <p style={{ fontSize: 13 }}>Sold for glimmers right here — no deed required.</p>}
                    <p style={{ fontSize: 11, opacity: 0.6 }}>(click anywhere to close)</p>
                  </div>
                </div>
              );
            })()}
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
            <div style={{ fontSize: 14, marginBottom: 12 }}>
              <button
                onClick={() => {
                  const key = `${SAVE_SLUG}.audio`;
                  let muted = false;
                  try {
                    muted = JSON.parse(localStorage.getItem(key) ?? '{}').muted === true;
                  } catch {
                    /* fresh */
                  }
                  localStorage.setItem(key, JSON.stringify({ muted: !muted }));
                  setSoundMuted(!muted);
                }}
                data-action="toggle-sound"
                style={{ ...cardBtnStyle(false), minWidth: 180 }}
              >
                {soundMuted ? '🔇 Sound: off' : '🔊 Sound: on'}
              </button>
            </div>
            <p style={{ fontSize: 13, opacity: 0.85 }}>
              Save tools live on the slot screen (export / import / delete).
              <br />
              All sound is synthesized live — nothing to download, only to enjoy or silence.
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
