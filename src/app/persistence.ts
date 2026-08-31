import { isRunSave, type RunSave } from '../sim/run/save'
import type { RunRecord } from '../sim/meta/history'

/**
 * Browser-side persistence. The sim stays clock-free and storage-free;
 * everything that touches localStorage or Date lives here.
 */

const SAVE_KEY = 'run-save'
const HISTORY_KEY = 'run-history'
const HISTORY_LIMIT = 50

/**
 * A stored run: the full RunRecord (build + complete damage attribution).
 * Entries written by older builds may lack the newer fields — the history
 * screen treats everything beyond the basics as optional.
 */
export type HistoryEntry = RunRecord

export function loadSave(): RunSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isRunSave(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function storeSave(save: RunSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY)
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Backfill fields that pre-upgrade entries did not store.
    return (parsed as Partial<HistoryEntry>[]).map((e) => ({
      date: e.date ?? '',
      actId: e.actId ?? 'act1',
      endless: e.endless ?? false,
      result: e.result ?? 'defeat',
      waveReached: e.waveReached ?? 0,
      players: (e.players ?? []).map((pl) => ({
        id: pl.id ?? 0,
        classId: pl.classId ?? 'student',
        level: pl.level ?? 1,
        kills: pl.kills ?? 0,
        dealt: pl.dealt ?? 0,
        taken: pl.taken ?? 0,
        weapons: pl.weapons ?? [],
        items: pl.items ?? [],
        perks: pl.perks ?? [],
        sources: pl.sources ?? (pl as { topSources?: [string, number][] }).topSources ?? [],
      })),
    }))
  } catch {
    return []
  }
}

export function appendHistory(entry: HistoryEntry): void {
  const history = loadHistory()
  history.unshift(entry)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)))
}

/** Download the current save as a JSON file the player can keep or share. */
export function exportSave(save: RunSave): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'run-save.json'
  a.click()
  URL.revokeObjectURL(url)
}

export function importSaveFile(file: File): Promise<RunSave | null> {
  return file.text().then((text) => {
    try {
      const parsed: unknown = JSON.parse(text)
      return isRunSave(parsed) ? parsed : null
    } catch {
      return null
    }
  })
}
