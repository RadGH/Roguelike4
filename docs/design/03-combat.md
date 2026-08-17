# Combat Model

All numbers here are launch defaults, stored in `data/balance.json` — never hardcoded.

## Damage types

- **Melee** (physical) — swung or thrown-with-muscle. Some melee weapons have long reach
  (Javelin: melee damage at range).
- **Ranged** (physical) — bows, launchers, thrown gadgets.
- **Magic**: **Fire / Lightning / Ice / Poison / Arcane** (five schools).
- **Void** — special: cannot be resisted or reduced by % resistance (armor and flat
  reduction DO apply unless the source says otherwise; see stacking order).
  [DECISION: "un-resistable" = ignores % resistance AND enemy 50% absorbs; flat # and
  armor still count so Void isn't strictly best-in-slot everywhere.]
- **Pet** — dealt only by pets/structures. Pet-type damage scales from the OWNER's
  Pet Damage stat. A pet's attacks also carry a sub-type (e.g. dog bite = Pet/Melee)
  for resistances and tracking.

Every attack is tagged: `kind` (attack | spell) + `types` (one or more damage types).
"Counts as a spell" matters for on-spell triggers, spell block, and class restrictions.

## Player stats

Base starting character (before class modifiers):

| Stat | Base |
|------|------|
| Max HP | 10 |
| HP regen | 0/s |
| Melee / Ranged / Pet damage | 0 |
| Magic damage (per school: Fire/Lightning/Ice/Poison/Arcane/Void) | 0 |
| Crit chance / Crit damage | 0% / +50% |
| Armor | 0 |
| Dodge | 0% |
| Move speed | 100% |
| Pickup radius | 1.5m |
| Lifesteal (physical / magical) | 0% |
| Cooldown rate, Area, Projectile speed, Duration | 100% |

- "Magic damage +X (all types)" adds X to every school. Fire-only bonuses add to fire.
- Weapons deal `weaponMultiplier% × (matching stat) + weapon flat roll`, e.g.
  Shortsword "Deals 100% Melee Damage" with the player at 12 melee → 12 base hit.
  Wand "75% Magic" uses the highest school unless the wand specifies one.
- **Stat stacking**: flat adds sum first, then % increases sum additively into one
  multiplier, then rare "×" multipliers multiply. (`(base + Σflat) × (1 + Σ%) × Π×`)

## Defense math (applied in this order)

1. **Dodge** (attacks only, not spells): roll `dodge%`, capped 60%. Dodged = 0 damage,
   logged as avoided (tracker credits the item/perk granting the dodge).
2. **Block** (shields): flat `#` subtracted — physical block vs attacks, spell block
   vs spells. Multiple shields sum. Blocks can't reduce below 1 before other steps.
3. **Armor** (% reduction, diminishing): `reduction = armor / (armor + 25 + 5×wave)`.
   Wave scaling keeps armor from trivializing late waves. Cap 85%.
4. **% resistance** by type (or "all"): additive per type, cap 75%. Void ignores this step.
5. **Flat # damage reduction** by type (or overall): subtracted last, can't reduce a
   hit below 1 (chip damage always lands).

Enemies use the same pipeline. Enemy "specific resistance" = 50% absorb of 1–2 types
(shown as icons over elites); Void ignores it.

## Crits

`crit chance` rolls per hit; crit multiplies final damage by `1.5 + critDamage%`.
Spells can crit unless flagged `noCrit`. Enemy attacks don't crit by default.

## Status effects (only from sources that list them)

| Effect | Rule |
|--------|------|
| **Burn** | DoT: listed burn damage over 3s, stacks refresh + add 50% of new stack (diminishing stack value). Fire-type damage ticks. |
| **Stun** (Lightning) | Target can't act, listed duration. Diminishing: each re-stun within 6s is 50% shorter. Elites 50% duration, bosses 15% duration. |
| **Slow / Freeze** (Ice) | Slow: −% move/attack speed. Freeze: full stop (elites/bosses: heavy slow instead). Same diminishing rules as stun. |
| **Poison** | DoT, longer + cheaper per point than burn; stacks fully but each stack is weak. |
| **Void mark** | Rare; marked target takes +% void damage. |

Effects are DATA: an item lists `effects: [...]` with magnitudes. Fire damage does NOT
burn unless the source says so.

## Combo rules (item-granted, examples)

- **Ice Bomb** (item): dealing ≥X damage in one hit to a *frozen* enemy detonates it:
  Y ice damage in radius.
- **Frostfire** (feat): freezing a *burning* enemy instantly deals all remaining burn
  damage ×2.
- Combos are implemented as event-triggered rules (`on: hitFrozenTarget`, etc.) so
  new combos are pure data.

## Attack delivery

- Weapons auto-fire on individual cooldowns, in aim direction (or nearest enemy).
- Projectile behaviors are composable flags: `pierce (n)`, `bounce (n)`, `split (n at
  impact or range)`, `chain (n, radius)` — items add these to matching weapons.
- Melee arcs, thrown weapons, beams (flamethrower cone), ground pools (fire/acid),
  orbiting projectiles, and turret/pet delivery are all engine primitives that items
  reference by name with parameters.

## Death & revival

Player at 0 HP → snuffed (see co-op doc). Solo snuff = run over → recap → town.
On-death item triggers (e.g. "explode on snuff") fire before the state change.
