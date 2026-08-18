import { useEffect } from 'react';
import type { Engine } from '@game/shell/engine';

type IntermissionData = NonNullable<ReturnType<Engine['intermission']>>;

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'rgba(43, 33, 64, 0.94)',
  border: '3px solid #ffd97a',
  borderRadius: 16,
  color: '#fff4d6',
  fontFamily: 'system-ui',
  padding: '20px 28px',
  minWidth: 320,
  maxWidth: '90vw',
  textAlign: 'center',
  boxShadow: '0 8px 40px #0008',
};

export function IntermissionOverlay({
  data,
  engine,
}: {
  data: IntermissionData;
  engine: Engine;
}) {
  const choices = data.boonChoices;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (choices) {
        const n = Number(e.key);
        if (n >= 1 && n <= choices.length) engine.chooseBoon(choices[n - 1]!.id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        engine.continueToNextWave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, engine]);

  return (
    <div style={panelStyle} data-screen="intermission">
      <h2 style={{ margin: '0 0 4px', color: '#ffd97a' }}>Wave {data.wave} cleared! ✨</h2>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', opacity: 0.9, fontSize: 14, marginBottom: 12 }}>
        <span>⚔️ {data.recap.kills} kills</span>
        <span>💥 {data.recap.damageDealt} dealt</span>
        <span>💔 {data.recap.damageTaken} taken</span>
        <span>⭐ Lv {data.recap.level}</span>
      </div>
      {data.chest ? (
        data.chest.pendingEquip ? (
          <>
            <p style={{ margin: '4px 0 10px', fontWeight: 700 }}>
              Equip <span style={{ color: '#ffd97a' }}>{data.chest.pendingEquip.name}</span> — replace which weapon?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {data.chest.currentWeapons.map((w) => (
                <button
                  key={w.slot}
                  onClick={() => engine.equipReplace(w.slot)}
                  data-replace-slot={w.slot}
                  style={{
                    background: '#57302f',
                    color: '#fff4d6',
                    border: '2px solid #e8a020',
                    borderRadius: 10,
                    padding: '12px 14px',
                    width: 140,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{w.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>{w.desc}</div>
                </button>
              ))}
              <button
                onClick={() => engine.cancelEquip()}
                data-action="cancel-equip"
                style={{
                  background: 'transparent',
                  color: '#fff4d6',
                  border: '2px solid #666',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ← Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: '4px 0 10px', fontWeight: 700 }}>
              🧰 A chest creaks open {data.pendingChests > 1 ? `(${data.pendingChests} chests)` : ''} — take a weapon?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {data.chest.choices.map((c) => (
                <button
                  key={c.id}
                  onClick={() => engine.chooseChestWeapon(c.id)}
                  data-chest-weapon={c.id}
                  style={{
                    background: '#3d3260',
                    color: '#fff4d6',
                    border: '2px solid #ffd97a',
                    borderRadius: 10,
                    padding: '12px 14px',
                    width: 140,
                    minHeight: 84,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 6 }}>{c.desc}</div>
                </button>
              ))}
              <button
                onClick={() => engine.salvageChest()}
                data-action="salvage"
                style={{
                  background: 'transparent',
                  color: '#ffd97a',
                  border: '2px dashed #ffd97a88',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Salvage
                <div style={{ fontSize: 11, opacity: 0.8 }}>+15 gold</div>
              </button>
            </div>
          </>
        )
      ) : choices ? (
        <>
          <p style={{ margin: '4px 0 10px', fontWeight: 700 }}>
            Choose a boon {data.pendingBoons > 1 ? `(${data.pendingBoons} picks left)` : ''}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {choices.map((c, i) => (
              <button
                key={c.id}
                onClick={() => engine.chooseBoon(c.id)}
                data-boon={c.id}
                style={{
                  background: '#3b2f57',
                  color: '#fff4d6',
                  border: '2px solid #b88ae0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  width: 130,
                  minHeight: 84,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>{c.desc}</div>
                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>[{i + 1}]</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button
          onClick={() => engine.continueToNextWave()}
          data-action="continue"
          style={{
            background: '#ffd97a',
            color: '#2b2140',
            border: 'none',
            borderRadius: 10,
            padding: '10px 26px',
            fontWeight: 800,
            fontSize: 16,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {data.lastWaveOfAct ? 'Restart Act (more acts coming!)' : 'Next wave ▶'}
        </button>
      )}
    </div>
  );
}
