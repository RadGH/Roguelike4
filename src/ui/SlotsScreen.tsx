import { useRef, useState } from 'react';
import {
  exportProfile,
  freshProfile,
  importProfile,
  loadProfile,
  saveProfile,
  type Profile,
} from '@game/meta/profile';
import { GAME_TITLE } from '@game/branding';
import { cardBtnStyle, COLORS, panelStyle, screenStyle } from './theme';
import { useMenuNav } from './useMenuNav';

const SLOTS = [1, 2, 3];

export function SlotsScreen({ onPick, onBack }: { onPick: (slot: number) => void; onBack: () => void }) {
  const [, forceRender] = useState(0);
  const refresh = () => forceRender((n) => n + 1);
  const fileRef = useRef<HTMLInputElement>(null);
  const importSlotRef = useRef(1);

  const profiles: Profile[] = SLOTS.map((s) => loadProfile(window.localStorage, s));
  const isEmpty = (p: Profile) => p.lifetime.runs === 0 && p.glimmers === 0 && p.emberkeys === 0;

  const focus = useMenuNav({
    player: 'any',
    count: SLOTS.length,
    enabled: true,
    onConfirm: (i) => onPick(SLOTS[i]!),
    onBack,
  });

  const doExport = (p: Profile) => {
    const blob = new Blob([exportProfile(p)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `save-slot-${p.slot}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = (slot: number) => {
    importSlotRef.current = slot;
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const p = importProfile(await file.text(), importSlotRef.current);
      saveProfile(window.localStorage, p);
      refresh();
    } catch {
      alert('That file is not a valid save.');
    }
    e.target.value = '';
  };

  return (
    <div style={screenStyle} data-screen="slots">
      <div style={panelStyle}>
        <h1 style={{ margin: '0 0 2px', color: COLORS.gold }}>{GAME_TITLE}</h1>
        <p style={{ margin: '0 0 14px', opacity: 0.8, fontSize: 14 }}>Choose a save slot</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {profiles.map((p, i) => (
            <div
              key={p.slot}
              data-slot={p.slot}
              style={{
                border: `2px solid ${focus === i ? COLORS.gold : COLORS.panelBorder}`,
                borderRadius: 12,
                padding: '12px 16px',
                width: 190,
                background: '#2b2140aa',
              }}
            >
              <div style={{ fontWeight: 800, color: COLORS.gold }}>Slot {p.slot}</div>
              {isEmpty(p) ? (
                <div style={{ opacity: 0.6, fontSize: 13, margin: '10px 0' }}>A fresh wick, unlit.</div>
              ) : (
                <div style={{ fontSize: 12.5, margin: '8px 0', lineHeight: 1.6, textAlign: 'left' }}>
                  🔑 {p.emberkeys} emberkeys · ✨ {p.glimmers}
                  <br />
                  🏁 {p.lifetime.wins} wins / {p.lifetime.runs} runs
                  <br />
                  🌊 deepest wave {p.lifetime.deepestWave}
                </div>
              )}
              <button data-action={`play-slot-${p.slot}`} onClick={() => onPick(p.slot)} style={cardBtnStyle(focus === i)}>
                {isEmpty(p) ? 'New adventure' : 'Continue'}
              </button>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                <button
                  onClick={() => doExport(p)}
                  style={{ ...miniBtn, opacity: isEmpty(p) ? 0.4 : 1 }}
                  disabled={isEmpty(p)}
                >
                  export
                </button>
                <button onClick={() => doImport(p.slot)} style={miniBtn}>
                  import
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Snuff out slot ${p.slot} forever?`)) {
                      saveProfile(window.localStorage, freshProfile(p.slot));
                      refresh();
                    }
                  }}
                  style={{ ...miniBtn, color: '#ff9ad5', opacity: isEmpty(p) ? 0.4 : 1 }}
                  disabled={isEmpty(p)}
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onFile} />
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#b88ae0',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  textDecoration: 'underline',
};
