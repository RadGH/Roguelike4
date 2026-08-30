import type { Registry } from '../data/registry'
import type { UnlockDef } from '../data/types'

/**
 * The unlock engine. Progression is variety, not strength: unlocks widen what
 * a run can contain and never raise starting numbers. Conditions are
 * behavioral, visible before they are met, and progress accrues from every
 * run, won or lost.
 */

/** Lifetime profile counters, accumulated across all runs. */
export interface Profile {
  unlockedIds: string[]
  totalKills: number
  runsCompleted: number
  /** Class ids that have finished a run (win or lose). */
  classesRun: string[]
  actsWon: string[]
  bestWaveReached: number
  bestKillsInOneWave: number
}

export function emptyProfile(): Profile {
  return {
    unlockedIds: [],
    totalKills: 0,
    runsCompleted: 0,
    classesRun: [],
    actsWon: [],
    bestWaveReached: 0,
    bestKillsInOneWave: 0,
  }
}

/** What one finished run contributes to the profile. */
export interface RunResult {
  actId: string
  won: boolean
  waveReached: number
  players: { classId: string; kills: number }[]
  /** Highest team kill total in any single wave of this run. */
  bestKillsInOneWave: number
}

/** Fold a finished run into the profile (pure — returns a new profile). */
export function applyRunResult(profile: Profile, result: RunResult): Profile {
  const next: Profile = {
    ...profile,
    unlockedIds: [...profile.unlockedIds],
    classesRun: [...profile.classesRun],
    actsWon: [...profile.actsWon],
  }
  next.runsCompleted++
  next.totalKills += result.players.reduce((a, p) => a + p.kills, 0)
  next.bestWaveReached = Math.max(next.bestWaveReached, result.waveReached)
  next.bestKillsInOneWave = Math.max(next.bestKillsInOneWave, result.bestKillsInOneWave)
  for (const p of result.players) {
    if (!next.classesRun.includes(p.classId)) next.classesRun.push(p.classId)
  }
  if (result.won && !next.actsWon.includes(result.actId)) next.actsWon.push(result.actId)
  return next
}

export function conditionMet(profile: Profile, def: UnlockDef): boolean {
  const c = def.condition
  switch (c.type) {
    case 'run-as-class': return profile.classesRun.includes(c.classId)
    case 'win-act': return profile.actsWon.includes(c.actId)
    case 'reach-wave': return profile.bestWaveReached >= c.wave
    case 'total-kills': return profile.totalKills >= c.count
    case 'kills-in-one-wave': return profile.bestKillsInOneWave >= c.count
  }
}

/** Human-readable progress toward a condition, for the codex. */
export function conditionProgress(profile: Profile, def: UnlockDef): string {
  const c = def.condition
  switch (c.type) {
    case 'run-as-class': return profile.classesRun.includes(c.classId) ? 'done' : 'not yet'
    case 'win-act': return profile.actsWon.includes(c.actId) ? 'done' : 'not yet'
    case 'reach-wave': return `${Math.min(profile.bestWaveReached, c.wave)}/${c.wave}`
    case 'total-kills': return `${Math.min(profile.totalKills, c.count)}/${c.count}`
    case 'kills-in-one-wave': return `${Math.min(profile.bestKillsInOneWave, c.count)}/${c.count}`
  }
}

/** Evaluate all unmet unlocks; returns the newly earned ones (pure). */
export function evaluateUnlocks(profile: Profile, registry: Registry): UnlockDef[] {
  const earned: UnlockDef[] = []
  for (const def of registry.unlocks.values()) {
    if (profile.unlockedIds.includes(def.id)) continue
    if (conditionMet(profile, def)) earned.push(def)
  }
  return earned
}

/** Everything available to a new run under this profile. */
export function availableContent(profile: Profile, registry: Registry): {
  classes: string[]
  weapons: string[]
  perks: string[]
} {
  // Anything that is a reward of some unlock is gated; everything else is base.
  const gated = { class: new Set<string>(), weapon: new Set<string>(), perk: new Set<string>() }
  const granted = new Set<string>()
  for (const def of registry.unlocks.values()) {
    for (const r of def.rewards) {
      gated[r.kind].add(r.id)
      if (profile.unlockedIds.includes(def.id)) granted.add(`${r.kind}:${r.id}`)
    }
  }
  const open = (kind: 'class' | 'weapon' | 'perk', id: string): boolean =>
    !gated[kind].has(id) || granted.has(`${kind}:${id}`)

  return {
    classes: [...registry.classes.keys()].filter((id) => open('class', id)),
    weapons: [...registry.weapons.keys()].filter((id) => open('weapon', id)),
    perks: [...registry.perks.keys()].filter((id) => open('perk', id)),
  }
}
