import { useState } from 'react';
import { loadRegistry } from '@game/data/registry';
import type { Profile } from '@game/meta/profile';
import { COLORS } from './theme';

const reg = loadRegistry();

function prettify(id: string): string {
  return id
    .split('-')
    .map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : s))
    .join(' ');
}

type Tab = 'deeds' | 'weapons' | 'enemies';

export function CodexPanel({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('deeds');
  const done = new Set(profile.deedsCompleted);
  const unlocked = new Set(profile.unlockedItems);

  return (
    <div data-codex style={{ textAlign: 'left', maxWidth: 560 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
        {(['deeds', 'weapons', 'enemies'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-codex-tab={t}
            style={{
              background: tab === t ? COLORS.gold : 'transparent',
              color: tab === t ? '#2b2140' : COLORS.text,
              border: `2px solid ${tab === t ? COLORS.gold : COLORS.panelBorder}`,
              borderRadius: 8,
              padding: '4px 14px',
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'deeds' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {[...reg.deeds.values()].map((d) => {
            const complete = done.has(d.id);
            const progress = Math.min(d.target, profile.deedProgress[d.id] ?? 0);
            return (
              <div
                key={d.id}
                data-deed={d.id}
                style={{
                  border: `2px solid ${complete ? COLORS.gold : COLORS.panelBorder}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  opacity: complete ? 1 : 0.9,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span style={{ fontWeight: 800 }}>
                    {complete ? '✅' : '⬜'} {d.desc}
                  </span>
                  <span style={{ opacity: 0.8 }}>
                    {complete ? 'done!' : `${Math.floor(progress)}/${d.target}`}
                  </span>
                </div>
                {!complete && (
                  <div style={{ height: 5, background: '#2b2140', borderRadius: 3, margin: '5px 0' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(progress / d.target) * 100}%`,
                        background: COLORS.gold,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                )}
                <div style={{ fontSize: 11.5, opacity: 0.7, fontStyle: 'italic' }}>
                  {complete
                    ? `Unlocked: ${d.unlocks.map((u) => prettify(u.id)).join(', ')}`
                    : d.hint}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'weapons' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {[...reg.passives.values()].map((p) => {
            const isUnlocked = !p.unlockDeed || unlocked.has(p.id);
            const deed = p.unlockDeed ? reg.deeds.get(p.unlockDeed) : null;
            return (
              <div
                key={p.id}
                style={{
                  border: `2px solid ${isUnlocked ? '#9be8ff' : '#555'}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                  opacity: isUnlocked ? 1 : 0.65,
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 800 }}>💠 {isUnlocked ? prettify(p.id) : '???'}</div>
                <div style={{ opacity: 0.8, fontStyle: isUnlocked ? 'normal' : 'italic' }}>
                  {isUnlocked ? p.desc : `🔒 ${deed?.hint ?? 'A deed will reveal it.'}`}
                </div>
              </div>
            );
          })}
          {[...reg.weapons.values()].map((w) => {
            const isUnlocked = !w.unlockDeed || unlocked.has(w.id);
            const deed = w.unlockDeed ? reg.deeds.get(w.unlockDeed) : null;
            return (
              <div
                key={w.id}
                style={{
                  border: `2px solid ${isUnlocked ? COLORS.gold : '#555'}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                  opacity: isUnlocked ? 1 : 0.65,
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 800 }}>{isUnlocked ? prettify(w.id) : '???'}</div>
                {isUnlocked ? (
                  <div style={{ opacity: 0.8 }}>
                    {w.hands}H {w.kind} · {Math.round(w.damage.multiplier * 100)}% {w.damage.types.join('/')}
                  </div>
                ) : (
                  <div style={{ opacity: 0.8, fontStyle: 'italic' }}>🔒 {deed?.hint ?? 'A deed will reveal it.'}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'enemies' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {[...reg.enemies.values()].map((e) => (
            <div
              key={e.id}
              style={{ border: `2px solid ${COLORS.panelBorder}`, borderRadius: 10, padding: '8px 10px', fontSize: 12.5 }}
            >
              <div style={{ fontWeight: 800 }}>{e.name ?? prettify(e.id)}</div>
              <div style={{ opacity: 0.8 }}>
                {e.archetype} · ❤️ {e.maxHp} · 💥 {e.damage}
                {e.armor ? ` · 🛡 ${e.armor}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
