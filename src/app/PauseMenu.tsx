import { useState } from 'react'
import type { Run } from '../sim/run/run'
import { TIER_NAMES } from '../sim/data/types'

/**
 * Global pause menu — the whole display, everyone frozen. This is where the
 * depth of a run becomes visible: items, stats, and the live damage
 * breakdown. Default view is one player, the others one click away.
 * Every stat shown is a whole number.
 */
export function PauseMenu({ run, onResume }: { run: Run; onResume: () => void }): React.JSX.Element {
  const [tab, setTab] = useState(0)
  const p = run.sim.state.players[Math.min(tab, run.sim.state.players.length - 1)]
  const cls = run.registry.class(p.classId)
  const total = run.sim.tracker.totalFor(p.id)
  const taken = run.sim.tracker.takenSummary(p.id)
  const pct = (v: number): number => Math.round(v * 100)

  const stats: [string, string | number][] = [
    ['Health', `${Math.ceil(p.health)} / ${p.maxHealth}`],
    ['Recovery', Math.round(p.regen * 10)],
    ['Move Speed', Math.round((p.moveSpeed / 5) * 100)],
    ['Armor', Math.round(p.defenses.armor)],
    ['Dodge', pct(p.defenses.dodge)],
    ['Resistance', pct(p.defenses.resist)],
    ['Damage Reduction', Math.round(p.defenses.flatReduction)],
    ['Lifesteal', pct(p.lifesteal)],
    ['Melee Damage', 100 + p.meleePct + p.allPct],
    ['Ranged Damage', 100 + p.rangedPct + p.allPct],
    ['Magic Damage', 100 + p.magicPct + p.allPct],
    ['Attack Speed', 100 + p.cooldownPct],
    ['Gold Gain', 100 + p.goldPct],
    ['Experience Gain', 100 + p.xpPct],
    ['Pickup Radius', Math.round((p.pickupRadius / 1.5) * 100)],
  ]

  return (
    <div className="overlay">
      <div className="panel" data-testid="pause-menu" style={{ maxHeight: '88vh', minWidth: 380 }}>
        <h2>Paused</h2>
        <div className="toolbar">
          {run.sim.state.players.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setTab(pl.id)}
              style={pl.id === p.id ? { borderColor: 'var(--accent)' } : undefined}
            >
              P{pl.id + 1}
            </button>
          ))}
        </div>

        <h3>{cls.name} — level {p.level} · {p.gold} gold</h3>

        <h3>Weapons</h3>
        {p.weapons.map((w, i) => {
          const def = run.registry.weapon(w.defId)
          return (
            <div className="recap-row" key={i}>
              <span className={`name tier-${w.tier}`}>{def.name}</span>
              <span className="hint">{TIER_NAMES[w.tier]} · {def.damageType} · {def.tags.join(', ')}</span>
            </div>
          )
        })}

        <h3>Items</h3>
        {p.items.length === 0 && <div className="hint">None yet.</div>}
        {[...new Set(p.items)].map((itemId) => {
          const def = run.registry.item(itemId)
          const count = p.items.filter((i) => i === itemId).length
          return (
            <div className="recap-row" key={itemId}>
              <span className="name">{def.name}{count > 1 ? ` ×${count}` : ''}</span>
              <span className="hint">{def.description}</span>
            </div>
          )
        })}

        <h3>Perks</h3>
        {p.perks.length === 0 && <div className="hint">None yet.</div>}
        {p.perks.map((owned, i) => {
          const def = run.registry.perk(owned.perkId)
          return (
            <div className="recap-row" key={i}>
              <span className={`name tier-${owned.tier}`}>{def.name}</span>
              <span className="hint">{TIER_NAMES[owned.tier]}</span>
            </div>
          )
        })}

        <h3>Stats</h3>
        {stats.map(([label, value]) => (
          <div className="recap-row" key={label}>
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}

        <h3>Damage breakdown</h3>
        {[...run.sim.tracker.bySource(p.id).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([source, amount]) => (
            <div className="recap-row" key={source}>
              <span>{source}</span>
              <span>{Math.round(amount)} ({total > 0 ? Math.round((amount / total) * 100) : 0})</span>
            </div>
          ))}
        <div className="recap-row">
          <span className="hint">Taken {Math.round(taken.taken)}</span>
          <span className="hint">Mitigated {Math.round(taken.mitigated)} · Dodged {taken.dodges}</span>
        </div>

        <div className="toolbar">
          <button autoFocus onClick={onResume} data-testid="resume">Resume</button>
        </div>
      </div>
    </div>
  )
}
