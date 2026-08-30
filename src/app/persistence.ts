import { isRunSave, type RunSave } from '../sim/run/save'

/**
 * Browser-side persistence. The sim stays clock-free and storage-free;
 * everything that touches localStorage or Date lives here.
 */

const SAVE_KEY = 'run-save'
const HISTORY_KEY = 'run-history'
const HISTORY_LIMIT = 50

export interface HistoryPlayer {
  id: number
  level: number
  kills: number
  dealt: number
  /** [sourceId, amount] sorted desc — the "what carried this build" list. */
  topSources: [string, number][]
}

export interface HistoryEntry {
  date: string
  result: 'victory' | 'defeat'
  waveReached: number
  players: HistoryPlayer[]
}

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
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
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
