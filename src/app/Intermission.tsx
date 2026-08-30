import { useState } from 'react'
import type { Run } from '../sim/run/run'
import { TIER_NAMES } from '../sim/data/types'

/**
 * Intermission overlays. Personal screens are designed quarter-screen-first;
 * with one player they simply get the whole panel. Gamepad 2-button menu
 * navigation lands with the co-op milestone — mouse/keyboard for now.
 */

const ATTRIBUTE_LABEL: Record<string, string> = {
  maxHealth: 'Max Health',
  regen: 'Recovery',
  armor: 'Armor',
  dodge: 'Dodge',
  flatReduction: 'Damage Reduction',
  resist: 'Resistance',
  lifesteal: 'Lifesteal',
  moveSpeed: 'Move Speed',
  pickupRadius: 'Pickup Radius',
  meleePct: 'Melee Damage',
  rangedPct: 'Ranged Damage',
  magicPct: 'Magic Damage',
  allPct: 'All Damage',
  cooldownPct: 'Attack Speed',
  goldPct: 'Gold Gain',
  xpPct: 'Experience Gain',
}

export function Recap({ run, onContinue }: { run: Run; onContinue: () => void }): React.JSX.Element {
  const wave = run.sim.state.wave.number
  return (
    <div className="overlay">
      <div className="panel" data-testid="recap">
        <h2>Wave {wave} clear</h2>
        {run.sim.state.players.map((p) => {
          const s = run.sim.tracker.waveSummary(p.id, wave)
          return (
            <div className="recap-row" key={p.id}>
              <span>Player {p.id + 1}</span>
              <span>{s.kills} kills</span>
              <span>{Math.round(s.dealt)} dealt</span>
              <span>{Math.round(s.taken)} taken</span>
            </div>
          )
        })}
        <div className="toolbar">
          <button autoFocus onClick={onContinue} data-testid="recap-continue">Continue</button>
        </div>
      </div>
    </div>
  )
}

export function Intermission({ run, onChange }: { run: Run; onChange: () => void }): React.JSX.Element {
  // Per-player equip prompt: which shop entry is waiting for a slot choice.
  const [replacing, setReplacing] = useState<Record<number, number | null>>({})
  return (
    <div className="overlay">
      {run.sim.state.players.map((p) => {
        const screen = run.personal.get(p.id)
        if (!screen) return null
        if (screen.done) {
          return (
            <div className="panel" key={p.id} data-testid={`personal-${p.id}`}>
              <h2>Player {p.id + 1}</h2>
              <div className="panel-ready">
                Ready — waiting on {run.sim.state.players
                  .filter((o) => !run.personal.get(o.id)?.done)
                  .map((o) => `P${o.id + 1}`)
                  .join(', ') || '…'}
              </div>
            </div>
          )
        }
        return (
          <div className="panel" key={p.id} data-testid={`personal-${p.id}`}>
            <h2>Player {p.id + 1} <span className="gold-display">{p.gold} gold</span></h2>

            {screen.draft ? (
              <>
                <h3>Level up — choose a perk ({p.pendingDrafts} left)</h3>
                <div className="cards">
                  {screen.draft.map((offer, i) => {
                    const def = run.perkDef(offer.perkId)
                    const amount = def.amount * [1, 2, 3, 4][offer.tier]
                    return (
                      <button
                        className="card"
                        key={i}
                        data-testid={`draft-${i}`}
                        onClick={() => { run.pickPerk(p.id, i); onChange() }}
                      >
                        <span>
                          <span className={`name tier-${offer.tier}`}>{def.name}</span>
                          <span className="hint"> · {TIER_NAMES[offer.tier]}</span>
                          <div className="desc">+{amount} {ATTRIBUTE_LABEL[def.attribute] ?? def.attribute}</div>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <h3>Shop</h3>
                <div className="cards">
                  {screen.shop.map((entry, i) => {
                    const def = run.registry.weapon(entry.weaponId)
                    const full = p.weapons.length >= run.weaponSlots(p.id)
                    return (
                      <button
                        className="card"
                        key={i}
                        disabled={entry.sold || p.gold < entry.price}
                        data-testid={`shop-${i}`}
                        onClick={() => {
                          if (full) {
                            setReplacing((r) => ({ ...r, [p.id]: i }))
                          } else {
                            run.buyWeapon(p.id, i)
                          }
                          onChange()
                        }}
                      >
                        <span>
                          <span className="name">{def.name}</span>
                          <div className="desc">
                            {def.damageType} · {def.damage} dmg · {def.tags.join(', ')}
                          </div>
                        </span>
                        <span className="price">{entry.sold ? 'Sold' : `${entry.price}g`}</span>
                      </button>
                    )
                  })}
                </div>

                {replacing[p.id] != null && !screen.shop[replacing[p.id] as number]?.sold && (
                  <>
                    <h3>Slots are full — replace which weapon?</h3>
                    <div className="cards">
                      {p.weapons.map((w, slot) => {
                        const def = run.registry.weapon(w.defId)
                        return (
                          <button
                            className="card"
                            key={slot}
                            data-testid={`replace-${slot}`}
                            onClick={() => {
                              run.buyReplacing(p.id, replacing[p.id] as number, slot)
                              setReplacing((r) => ({ ...r, [p.id]: null }))
                              onChange()
                            }}
                          >
                            <span className="name">{def.name}</span>
                            <span className="price">sold for {Math.round(def.price / 2)}g</span>
                          </button>
                        )
                      })}
                      <button
                        className="card"
                        onClick={() => { setReplacing((r) => ({ ...r, [p.id]: null })); onChange() }}
                      >
                        <span className="name">Keep what I have</span>
                      </button>
                    </div>
                  </>
                )}

                <h3>Your weapons {p.weapons.length}/{run.weaponSlots(p.id)} — sell for half</h3>
                <div className="cards">
                  {p.weapons.map((w, i) => {
                    const def = run.registry.weapon(w.defId)
                    return (
                      <button
                        className="card"
                        key={i}
                        data-testid={`sell-${i}`}
                        onClick={() => { run.sellWeapon(p.id, i); onChange() }}
                      >
                        <span className="name">{def.name}</span>
                        <span className="price">sell {Math.round(def.price / 2)}g</span>
                      </button>
                    )
                  })}
                </div>

                <div className="toolbar">
                  <button
                    disabled={p.gold < screen.rerollPrice}
                    onClick={() => { run.reroll(p.id); onChange() }}
                  >
                    Reroll {screen.rerollPrice}g
                  </button>
                  <button
                    autoFocus
                    data-testid="ready"
                    onClick={() => { run.setReady(p.id); onChange() }}
                  >
                    Ready — next wave
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function RunEnd({ run, onRestart }: { run: Run; onRestart: () => void }): React.JSX.Element {
  const won = run.phase === 'victory'
  return (
    <div className="overlay">
      <div className="panel" data-testid="run-end">
        <h2>{won ? 'Act complete!' : 'The run is over'}</h2>
        {run.sim.state.players.map((p) => {
          const total = run.sim.tracker.totalFor(p.id)
          const taken = run.sim.tracker.takenSummary(p.id)
          return (
            <div key={p.id}>
              <div className="recap-row">
                <span>Player {p.id + 1} — level {p.level}</span>
                <span>{Math.round(total)} damage dealt</span>
              </div>
              <h3>Damage by source</h3>
              {[...run.sim.tracker.bySource(p.id).entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([source, amount]) => (
                  <div className="recap-row" key={source}>
                    <span>{source}</span>
                    <span>
                      {Math.round(amount)} ({total > 0 ? Math.round((amount / total) * 100) : 0}%)
                    </span>
                  </div>
                ))}
              <div className="recap-row">
                <span className="hint">Damage taken {Math.round(taken.taken)}</span>
                <span className="hint">Mitigated {Math.round(taken.mitigated)} · Dodged {taken.dodges}</span>
              </div>
            </div>
          )
        })}
        <div className="toolbar">
          <button autoFocus onClick={onRestart} data-testid="restart">Back to title</button>
        </div>
      </div>
    </div>
  )
}
