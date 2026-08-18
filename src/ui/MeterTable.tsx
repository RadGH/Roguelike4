import { useState } from 'react';
import type { Engine } from '@game/shell/engine';

type Meters = ReturnType<Engine['meters']>;

export function MeterTable({ meters }: { meters: Meters }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div data-meter-table style={{ textAlign: 'left', fontSize: 13, marginTop: 10 }}>
      {meters.rows.map((r) => (
        <div key={r.itemId} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [r.itemId]: !o[r.itemId] }))}
                data-meter-expand={r.itemId}
                aria-label={`details for ${r.name}`}
                style={{
                  background: 'transparent',
                  color: '#b88ae0',
                  border: '1px solid #b88ae055',
                  borderRadius: 4,
                  width: 18,
                  height: 18,
                  lineHeight: '14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {open[r.itemId] ? '−' : '+'}
              </button>
              {r.name}
            </span>
            <span>
              <b>{r.total}</b> <span style={{ opacity: 0.6 }}>total dmg</span>
            </span>
          </div>
          <div style={{ height: 6, background: '#2b2140', borderRadius: 3 }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(2, r.share * 100)}%`,
                background: 'linear-gradient(90deg,#ffd97a,#e8a020)',
                borderRadius: 3,
              }}
            />
          </div>
          {open[r.itemId] && (
            <div
              data-meter-detail={r.itemId}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '2px 14px',
                fontSize: 11.5,
                opacity: 0.9,
                padding: '4px 2px 2px 24px',
              }}
            >
              <span>hits: <b>{r.hits}</b></span>
              <span>avg hit: <b>{r.avg}</b></span>
              <span>max hit: <b>{r.max}</b></span>
              <span>min hit: <b>{r.min}</b></span>
              <span>crits: <b>{r.crits}</b></span>
              <span>overkill: <b>{r.overkill}</b></span>
              <span>share: <b>{Math.round(r.share * 100)}%</b></span>
            </div>
          )}
        </div>
      ))}
      <div style={{ opacity: 0.85, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>💔 {meters.damageTaken} taken</span>
        <span>💨 {meters.dodgeSaves} dodged</span>
        <span>⚔️ {meters.kills} kills</span>
      </div>
    </div>
  );
}
