// Run history: every finished run becomes a chronicle entry in IndexedDB
// (per design 09/11 — history is bigger than a save slot should carry).
// Falls back to an in-memory store where IndexedDB doesn't exist (tests, SSR),
// so callers never branch.

import { SAVE_SLUG } from '@game/branding';

export type RunRecord = {
  ts: number; // wall-clock when the run ended
  slot: number;
  won: boolean;
  actReached: number;
  waveReached: number;
  players: { classId: string; level: number; kills: number; damage: number }[];
  topItems: { itemId: string; damage: number }[]; // party-wide, best 8
  goldEarned: number;
  durationSec: number;
};

const DB_NAME = `${SAVE_SLUG}.history`;
const STORE = 'runs';
const KEEP_PER_SLOT = 50; // the chronicle remembers plenty, not everything

let memory: RunRecord[] = []; // fallback store

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex('bySlot', 'slot');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // storage denied → memory fallback
  });
}

export async function recordRun(rec: RunRecord): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.push(rec);
    if (memory.length > KEEP_PER_SLOT) memory = memory.slice(-KEEP_PER_SLOT);
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  // prune old entries for this slot beyond the keep limit
  const all = await listRuns(rec.slot, Number.MAX_SAFE_INTEGER);
  if (all.length > KEEP_PER_SLOT) {
    const cutoff = all[all.length - KEEP_PER_SLOT]!.ts;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const v = cursor.value as RunRecord;
        if (v.slot === rec.slot && v.ts < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  db.close();
}

/** Newest-last list of runs for a slot. */
export async function listRuns(slot: number, limit = 10): Promise<RunRecord[]> {
  const db = await openDb();
  if (!db) return memory.filter((r) => r.slot === slot).slice(-limit);
  const rows = await new Promise<RunRecord[]>((resolve) => {
    const out: RunRecord[] = [];
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('bySlot');
    const req = idx.openCursor(IDBKeyRange.only(slot));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push(cursor.value as RunRecord);
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => resolve(out);
  });
  db.close();
  rows.sort((a, b) => a.ts - b.ts);
  return rows.slice(-limit);
}

/** Test hook: reset the in-memory fallback. */
export function _clearMemoryHistory(): void {
  memory = [];
}
