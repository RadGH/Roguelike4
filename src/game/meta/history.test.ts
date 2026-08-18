import { describe, it, expect, beforeEach } from 'vitest';
import { recordRun, listRuns, _clearMemoryHistory, type RunRecord } from './history';

function rec(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ts: 1000,
    slot: 1,
    won: false,
    actReached: 1,
    waveReached: 5,
    players: [{ classId: 'hero', level: 7, kills: 40, damage: 500 }],
    topItems: [{ itemId: 'shortsword', damage: 300 }],
    goldEarned: 55,
    durationSec: 240,
    ...overrides,
  };
}

describe('run history (memory fallback path)', () => {
  beforeEach(() => _clearMemoryHistory());

  it('records and lists runs per slot, newest last', async () => {
    await recordRun(rec({ ts: 1, waveReached: 3 }));
    await recordRun(rec({ ts: 2, waveReached: 8 }));
    await recordRun(rec({ ts: 3, slot: 2, waveReached: 10 }));
    const slot1 = await listRuns(1, 10);
    expect(slot1.length).toBe(2);
    expect(slot1[1]!.waveReached).toBe(8);
    const slot2 = await listRuns(2, 10);
    expect(slot2.length).toBe(1);
    expect(slot2[0]!.waveReached).toBe(10);
  });

  it('honors the list limit', async () => {
    for (let i = 0; i < 15; i++) await recordRun(rec({ ts: i }));
    const rows = await listRuns(1, 10);
    expect(rows.length).toBe(10);
    expect(rows[rows.length - 1]!.ts).toBe(14);
  });
});
