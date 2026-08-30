import { GAME_TITLE } from '../branding'
import { loadContent } from '../sim/data/loadContent'
import { TIER_NAMES } from '../sim/data/types'
import '../app/app.css'
import './manual.css'

/**
 * The companion manual. It reads the exact same content JSON the game runs
 * on — one source of truth — so every number and unlock condition here is
 * the live value, never a copy that can drift.
 */
const registry = loadContent()

const ATTRIBUTE_LABEL: Record<string, string> = {
  maxHealth: 'Max Health', regen: 'Recovery', armor: 'Armor', dodge: 'Dodge',
  flatReduction: 'Damage Reduction', resist: 'Resistance', lifesteal: 'Lifesteal',
  moveSpeed: 'Move Speed', pickupRadius: 'Pickup Radius', meleePct: 'Melee Damage',
  rangedPct: 'Ranged Damage', magicPct: 'Magic Damage', petPct: 'Pet Damage',
  allPct: 'All Damage', cooldownPct: 'Attack Speed', goldPct: 'Gold Gain',
  xpPct: 'Experience Gain',
}

export function Manual(): React.JSX.Element {
  const lockedBy = new Map<string, string>()
  for (const u of registry.unlocks.values()) {
    for (const r of u.rewards) lockedBy.set(`${r.kind}:${r.id}`, u.description)
  }
  const unlockNote = (kind: string, id: string): string | null =>
    lockedBy.get(`${kind}:${id}`) ?? null

  return (
    <div className="manual">
      <header>
        <h1>{GAME_TITLE}</h1>
        <p className="hint">
          The complete manual. Everything on this page is read from the same
          data files the game itself runs on.
        </p>
        <nav>
          {['How to play', 'Classes', 'Weapons', 'Items', 'Slot items', 'Companions', 'Perks', 'Enemies', 'Unlocks'].map((s) => (
            <a key={s} href={`#${s.toLowerCase().replace(/ /g, '-')}`}>{s}</a>
          ))}
          <a href="./">Play the game</a>
        </nav>
      </header>

      <section id="how-to-play">
        <h2>How to play</h2>
        <p>
          Your weapons fire themselves. Your whole job is <strong>where you
          stand</strong>: dodge what is telegraphed, funnel the crowd, collect
          what drops, and keep your teammates alive.
        </p>
        <ul>
          <li><strong>Move</strong> — WASD, arrow keys, a gamepad stick, or drag on a touch screen.</li>
          <li><strong>A</strong> (Space / pad button / on-screen A) — use your equipment item.</li>
          <li><strong>B</strong> (Shift / pad button / on-screen B) — use your movement item.</li>
          <li><strong>Esc or Start</strong> — pause. That is every control in the game.</li>
        </ul>
        <p>
          A run is one act: ten waves ending in a boss, roughly a
          quarter-hour solo. Between waves you open what you found, draft a
          perk when you level, and spend gold at the shop — weapons are only
          ever bought, never dropped. Up to four players share one screen;
          the camera zooms out to keep everyone framed, gold and experience
          are counted in full for every player, and items rotate fairly.
          If you fall, a teammate can stand beside you to get you back up —
          the run only ends when nobody is left standing.
        </p>
        <p>
          Losing still counts: every unlock condition keeps its progress,
          win or lose, and starting power never changes — what grows is what
          <em> can</em> appear.
        </p>
      </section>

      <section id="classes">
        <h2>Classes</h2>
        {[...registry.classes.values()].map((c) => (
          <div className="entry" key={c.id}>
            <h3>{c.name}</h3>
            <p>{c.description}</p>
            <p className="hint">
              {c.weaponSlots} weapon slots
              {c.startingWeapons.length > 0 && ` · starts with ${c.startingWeapons.map((w) => registry.weapon(w).name).join(', ')}`}
              {c.startingEquipment && ` · equipment: ${registry.active(c.startingEquipment).name}`}
              {c.startingMovement && ` · movement: ${registry.active(c.startingMovement).name}`}
              {unlockNote('class', c.id) && ` · unlock: ${unlockNote('class', c.id)}`}
            </p>
          </div>
        ))}
      </section>

      <section id="weapons">
        <h2>Weapons</h2>
        <p className="hint">
          Weapons never drop — the shop is the only source. Quality tiers
          ({TIER_NAMES.join(' → ')}) multiply damage.
        </p>
        <table>
          <thead>
            <tr><th>Weapon</th><th>Type</th><th>Damage</th><th>Speed</th><th>Range</th><th>Tags</th><th>Unlock</th></tr>
          </thead>
          <tbody>
            {[...registry.weapons.values()].map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td>{w.damageType}</td>
                <td>{w.damage}{(w.projectileCount ?? 1) > 1 ? ` ×${w.projectileCount}` : ''}</td>
                <td>{w.cooldown}s</td>
                <td>{w.range}</td>
                <td className="hint">{w.tags.join(', ')}</td>
                <td className="hint">{unlockNote('weapon', w.id) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="items">
        <h2>Items</h2>
        <p className="hint">
          Found in chests during waves (never more than two a wave), opened at
          the rewards screen, kept or sold. Copies stack.
        </p>
        {[...registry.items.values()].map((item) => (
          <div className="entry-row" key={item.id}>
            <span className="name">{item.name}</span>
            <span>{item.description}</span>
            <span className="hint">{item.tags.join(', ')}</span>
          </div>
        ))}
      </section>

      <section id="slot-items">
        <h2>Slot items</h2>
        <p className="hint">
          One equipment slot (A) and one movement slot (B). Exclusive — taking
          a new one means giving up what you carry.
        </p>
        {[...registry.actives.values()].map((a) => (
          <div className="entry-row" key={a.id}>
            <span className="name">{a.name}</span>
            <span>{a.description}</span>
            <span className="hint">{a.slot === 'equipment' ? 'A' : 'B'} · {a.cooldown}s cooldown</span>
          </div>
        ))}
      </section>

      <section id="companions">
        <h2>Companions and structures</h2>
        <p className="hint">
          They fight for you without being steered. Structures and small
          creatures cannot be hurt; larger companions can fall in battle and
          return moments later.
        </p>
        {[...registry.pets.values()].map((pet) => (
          <div className="entry-row" key={pet.id}>
            <span className="name">{pet.name}</span>
            <span>{pet.kind === 'structure' ? 'Structure' : 'Companion'} · {pet.mortal ? `mortal, returns in ${pet.respawn}s` : 'indestructible'}</span>
            <span className="hint">{pet.damage} damage every {pet.cooldown}s</span>
          </div>
        ))}
      </section>

      <section id="perks">
        <h2>Perks</h2>
        <p className="hint">
          Offered when you level up, three at a time, each at a rolled quality
          tier. Perks are pure numbers; items are effects.
        </p>
        {[...registry.perks.values()].map((perk) => (
          <div className="entry-row" key={perk.id}>
            <span className="name">{perk.name}</span>
            <span>+{perk.amount} {ATTRIBUTE_LABEL[perk.attribute] ?? perk.attribute} per tier</span>
            <span className="hint">{perk.tags.join(', ')}</span>
          </div>
        ))}
      </section>

      <section id="enemies">
        <h2>Enemies</h2>
        <p className="hint">
          Colour tells you what a thing does, not what it is — every chaser
          shares a hue, every lobber another. Learn the colours once and every
          later act reads instantly.
        </p>
        <table>
          <thead>
            <tr><th>Enemy</th><th>Behavior</th><th>Health</th><th>Damage</th></tr>
          </thead>
          <tbody>
            {[...registry.enemies.values()]
              .filter((e) => !e.id.startsWith('kingslime') || e.id === 'kingslime-t1')
              .map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="hint">{e.archetype}</td>
                  <td>{e.health}</td>
                  <td>{e.damage}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section id="unlocks">
        <h2>Unlocks</h2>
        <p className="hint">
          Every condition is visible before it is met — read one, go chase it.
          Progress counts from every run, won or lost.
        </p>
        {[...registry.unlocks.values()].map((u) => (
          <div className="entry-row" key={u.id}>
            <span className="name">{u.name}</span>
            <span>{u.description}</span>
            <span className="hint">
              {u.rewards.map((r) => {
                const reg = r.kind === 'class' ? registry.classes : r.kind === 'weapon' ? registry.weapons : registry.perks
                return reg.get(r.id)?.name ?? r.id
              }).join(', ')}
            </span>
          </div>
        ))}
      </section>

      <footer className="hint">
        Made by Radley Sustaire. This manual always matches the build it ships with.
      </footer>
    </div>
  )
}
