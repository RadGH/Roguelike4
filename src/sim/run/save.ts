import type { OwnedPerk } from '../core/state'
import type { TrackerSnapshot } from '../systems/tracker'

/**
 * Run save format. Written after every wave clear so a closed tab or reload
 * costs at most one wave. Also the export/import format (a plain JSON blob).
 */
export interface RunSave {
  version: 1
  actId: string
  playerCount: number
  /** A fresh seed for the resumed portion of the run. */
  seed: number
  /** The next wave to play. */
  nextWave: number
  players: PlayerSave[]
  tracker: TrackerSnapshot
}

export interface PlayerSave {
  id: number
  classId: string
  gold: number
  xp: number
  level: number
  pendingDrafts: number
  health: number
  perks: OwnedPerk[]
  weapons: string[]
}

export function isRunSave(v: unknown): v is RunSave {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return o.version === 1 &&
    typeof o.actId === 'string' &&
    typeof o.nextWave === 'number' &&
    Array.isArray(o.players)
}
