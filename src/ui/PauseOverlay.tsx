import { useState } from 'react';
import type { Engine } from '@game/shell/engine';
import { PLAYER_COLORS_CSS } from '@game/shell/renderer';
import { MeterTable } from './MeterTable';
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
  const [muted, setMuted] = useState(engine.audio.muted);
  const [tab, setTab] = useState<'menu' | 'details' | 'damage'>('menu');
  const items = ['Resume', 'Details', 'Damage report', muted ? 'Sound: off' : 'Sound: on', 'Quit to title'];
  const activate = (i: number) => {
    if (i === 0) engine.togglePause();
    else if (i === 1) setTab(tab === 'details' ? 'menu' : 'details');
    else if (i === 2) setTab(tab === 'damage' ? 'menu' : 'damage');
    else if (i === 3) setMuted(engine.audio.toggleMuted());
    else onQuit();
  };
  const focus = useMenuNav({
    player: 'any',
    count: items.length,
    enabled: true,
    onConfirm: activate,
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
              onClick={() => activate(i)}
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

        {tab === 'details' && (() => {
          const d = engine.pauseDetails();
          return (
            <div data-pause-details style={{ marginTop: 10, textAlign: 'left', maxHeight: '46vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.9 }}>
                {d.endless ? '🌒 Endless' : `Act ${d.act}`} · Wave {d.wave} · 🪙 {d.gold} · ✨ {d.glimmers} glimmers ·
                📜 {d.deedsDone}/{d.deedsTotal} deeds
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {d.players.map((p) => (
                  <div
                    key={p.index}
                    style={{ border: `2px solid ${PLAYER_COLORS_CSS[p.index]}`, borderRadius: 10, padding: '8px 12px', minWidth: 230, flex: '1 1 230px' }}
                  >
                    <div style={{ color: PLAYER_COLORS_CSS[p.index], fontWeight: 800, fontSize: 13 }}>
                      P{p.index + 1} {p.className} · Lv {p.level} · {p.hp} HP · {p.boonCount} boons · 🔩 {p.bits}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <b>Weapons:</b>{' '}
                      {p.weapons.length ? p.weapons.map((w) => w.name).join(', ') : 'bare hands'}
                    </div>
                    {p.satchel.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <b>Satchel:</b> {p.satchel.map((w) => w.name).join(', ')}
                      </div>
                    )}
                    {p.passives.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <b>Items:</b> {p.passives.map((w) => w.name).join(', ')}
                      </div>
                    )}
                    {p.feats.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <b>Feats:</b> {p.feats.map((f) => f.name).join(', ')}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 10px', fontSize: 11.5, marginTop: 6, opacity: 0.92 }}>
                      {p.stats.map((st) => (
                        <div key={st.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ opacity: 0.75 }}>{st.label}</span>
                          <b>{st.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {tab === 'damage' && (
          <div data-pause-damage style={{ marginTop: 10, textAlign: 'left', maxHeight: '46vh', overflowY: 'auto' }}>
            {Array.from({ length: playerCount }, (_, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ color: PLAYER_COLORS_CSS[i], fontWeight: 800, fontSize: 13 }}>P{i + 1}</div>
                <MeterTable meters={engine.meters(i)} />
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }}>Esc / Start resumes · any player can act</div>
      </div>
    </div>
  );
}
