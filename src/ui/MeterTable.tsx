import type { Engine } from '@game/shell/engine';

type Meters = ReturnType<Engine['meters']>;

export function MeterTable({ meters }: { meters: Meters }) {
  return (
    <div data-meter-table style={{ textAlign: 'left', fontSize: 13, marginTop: 10 }}>
      {meters.rows.map((r) => (
        <div key={r.itemId} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontWeight: 700 }}>{r.name}</span>
            <span>
              {r.total} <span style={{ opacity: 0.6 }}>({r.hits} hits{r.crits > 0 ? `, ${r.crits} crit` : ''}, max {r.max})</span>
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
