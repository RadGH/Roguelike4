import type { Registry } from '../sim/data/registry'
import { conditionProgress, type Profile } from '../sim/meta/unlocks'

/**
 * The codex: every piece of content, unlocked or not, with its condition
 * visible before it is met — a locked entry is something to pursue.
 */
export function Codex({ registry, profile, available, onClose }: {
  registry: Registry
  profile: Profile
  available: { classes: string[]; weapons: string[]; perks: string[] }
  onClose: () => void
}): React.JSX.Element {
  const lockedBy = new Map<string, string>() // "kind:id" -> unlock id
  for (const def of registry.unlocks.values()) {
    for (const r of def.rewards) lockedBy.set(`${r.kind}:${r.id}`, def.id)
  }
  const lockLine = (kind: string, id: string): string | null => {
    const unlockId = lockedBy.get(`${kind}:${id}`)
    if (!unlockId) return null
    const def = registry.unlocks.get(unlockId)
    if (!def) return null
    return `${def.description} (${conditionProgress(profile, def)})`
  }

  return (
    <div className="overlay">
      <div className="panel" data-testid="codex" style={{ maxHeight: '88vh' }}>
        <h2>Codex</h2>

        <h3>Classes</h3>
        {[...registry.classes.values()].map((c) => {
          const locked = !available.classes.includes(c.id)
          return (
            <div className="recap-row" key={c.id}>
              <span className={locked ? 'hint' : 'name'}>{locked ? '🔒 ' : ''}{c.name}</span>
              <span className="hint">{locked ? lockLine('class', c.id) : c.description}</span>
            </div>
          )
        })}

        <h3>Weapons</h3>
        {[...registry.weapons.values()].map((w) => {
          const locked = !available.weapons.includes(w.id)
          return (
            <div className="recap-row" key={w.id}>
              <span className={locked ? 'hint' : 'name'}>{locked ? '🔒 ' : ''}{w.name}</span>
              <span className="hint">
                {locked ? lockLine('weapon', w.id) : `${w.damageType} · ${w.damage} dmg · ${w.tags.join(', ')}`}
              </span>
            </div>
          )
        })}

        <h3>Perks</h3>
        {[...registry.perks.values()].map((perk) => {
          const locked = !available.perks.includes(perk.id)
          return (
            <div className="recap-row" key={perk.id}>
              <span className={locked ? 'hint' : 'name'}>{locked ? '🔒 ' : ''}{perk.name}</span>
              <span className="hint">{locked ? lockLine('perk', perk.id) : `+${perk.amount} per tier`}</span>
            </div>
          )
        })}

        <h3>Enemies</h3>
        {[...registry.enemies.values()]
          .filter((e) => !e.id.includes('-t') || e.id.endsWith('-t1'))
          .map((e) => (
            <div className="recap-row" key={e.id}>
              <span className="name">{e.name}</span>
              <span className="hint">{e.archetype}</span>
            </div>
          ))}

        <h3>Unlocks</h3>
        {[...registry.unlocks.values()].map((u) => {
          const done = profile.unlockedIds.includes(u.id)
          return (
            <div className="recap-row" key={u.id}>
              <span className={done ? 'name' : 'hint'}>{done ? '✓ ' : ''}{u.name}</span>
              <span className="hint">{u.description} — {conditionProgress(profile, u)}</span>
            </div>
          )
        })}

        <div className="toolbar">
          <button autoFocus onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/** Pre-run class picker: one column per player, locked classes show conditions. */
export function ClassSelect({ registry, available, playerCount, chosen, onChoose, onStart, onBack, lockLineFor }: {
  registry: Registry
  available: string[]
  playerCount: number
  chosen: string[]
  onChoose: (playerIndex: number, classId: string) => void
  onStart: () => void
  onBack: () => void
  lockLineFor: (classId: string) => string | null
}): React.JSX.Element {
  return (
    <div className="overlay">
      {Array.from({ length: playerCount }, (_, pi) => (
        <div className="panel" key={pi} data-testid={`class-select-${pi}`}>
          <h2>Player {pi + 1} — choose a class</h2>
          <div className="cards">
            {[...registry.classes.values()].map((c) => {
              const locked = !available.includes(c.id)
              return (
                <button
                  className="card"
                  key={c.id}
                  disabled={locked}
                  data-testid={`class-${pi}-${c.id}`}
                  style={chosen[pi] === c.id ? { borderColor: 'var(--accent)' } : undefined}
                  onClick={() => onChoose(pi, c.id)}
                >
                  <span>
                    <span className="name">{locked ? '🔒 ' : ''}{c.name}</span>
                    <div className="desc">
                      {locked ? lockLineFor(c.id) : c.description}
                      {!locked && ` · ${c.weaponSlots} weapon slots`}
                    </div>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="panel">
        <div className="toolbar">
          <button onClick={onBack}>Back</button>
          <button
            autoFocus
            onClick={onStart}
            disabled={chosen.some((c) => !available.includes(c))}
            data-testid="begin-run"
          >
            Begin
          </button>
        </div>
      </div>
    </div>
  )
}
