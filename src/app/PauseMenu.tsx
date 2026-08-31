import { useState } from 'react'
import { PadPanel } from './padNav'
import { classBaseline } from '../sim/systems/stats'
import { TagRow } from './TagRow'
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

  // Colour shows deviation from the class baseline: what the build has
  // actually done to this character, without comparing remembered numbers.
  const base = classBaseline(p.classId, run.registry)
  const stats: [string, string | number, number, number][] = [
    ['Health', `${Math.ceil(p.health)} / ${p.maxHealth}`, p.maxHealth, base.maxHealth],
    ['Recovery', Math.round(p.regen * 10), p.regen, base.regen],
    ['Move Speed', Math.round((p.moveSpeed / 5) * 100), p.moveSpeed, base.moveSpeed],
    ['Armor', Math.round(p.defenses.armor), p.defenses.armor, base.defenses.armor],
    ['Dodge', pct(p.defenses.dodge), p.defenses.dodge, base.defenses.dodge],
    ['Resistance', pct(p.defenses.resist), p.defenses.resist, base.defenses.resist],
    ['Damage Reduction', Math.round(p.defenses.flatReduction), p.defenses.flatReduction, base.defenses.flatReduction],
    ['Lifesteal', pct(p.lifesteal), p.lifesteal, base.lifesteal],
    ['Melee Damage', 100 + p.meleePct + p.allPct, p.meleePct + p.allPct, base.meleePct + base.allPct],
    ['Ranged Damage', 100 + p.rangedPct + p.allPct, p.rangedPct + p.allPct, base.rangedPct + base.allPct],
    ['Magic Damage', 100 + p.magicPct + p.allPct, p.magicPct + p.allPct, base.magicPct + base.allPct],
    ['Attack Speed', 100 + p.cooldownPct, p.cooldownPct, base.cooldownPct],
    ['Gold Gain', 100 + p.goldPct, p.goldPct, base.goldPct],
    ['Experience Gain', 100 + p.xpPct, p.xpPct, base.xpPct],
    ['Pickup Radius', Math.round((p.pickupRadius / 1.5) * 100), p.pickupRadius, base.pickupRadius],
  ]

  return (
    <div className="overlay">
      <PadPanel padIndex={-1} className="panel" data-testid="pause-menu" style={{ maxHeight: '88vh', minWidth: 380 }}>
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
              <span className="hint">{TIER_NAMES[w.tier]} · {def.damageType} <TagRow tags={def.tags} /></span>
            </div>
          )
        })}

        <h3>Slots</h3>
        {([['A — Equipment', p.equipment], ['B — Movement', p.movement]] as const).map(([label, slot]) => (
          <div className="recap-row" key={label}>
            <span>{label}</span>
            <span className={slot ? 'name' : 'hint'}>
              {slot ? `${run.registry.active(slot.defId).name}${slot.cdLeft > 0 ? ` (${Math.ceil(slot.cdLeft)}s)` : ''}` : 'empty'}
            </span>
          </div>
        ))}

        <h3>Items</h3>
        {p.items.length === 0 && <div className="hint">None yet.</div>}
        {[...new Set(p.items)].map((itemId) => {
          const def = run.itemDef(itemId)
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
        {stats.map(([label, value, now, baseline]) => (
          <div className="recap-row" key={label}>
            <span>{label}</span>
            <span className={now > baseline + 0.001 ? 'stat-up' : now < baseline - 0.001 ? 'stat-down' : undefined}>
              {value}
            </span>
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
          {run.sim.state.players.length < 4 && (
            <button
              data-testid="hot-join"
              onClick={() => { run.joinPlayer('student'); onResume() }}
            >
              Add player ({run.sim.state.players.length + 1}P)
            </button>
          )}
        </div>
        {run.sim.state.players.length < 4 && (
          <div className="hint">
            A new player joins beside player 1 as a Student, at half health.
            Player 1 uses the keyboard; other players use gamepads in order.
          </div>
        )}
      </PadPanel>
    </div>
  )
}
