# Combat Model

All numbers here are launch defaults, stored in `data/balance.json` — never hardcoded.
Engine determinism/perf rules live in `16-engine.md`.

## Damage types

- **Melee** (physical) — swung or thrown-with-muscle. Some melee weapons have long reach
  (Javelin: melee damage at range).
- **Ranged** (physical) — bows, launchers, thrown gadgets.
- **Magic**: **Fire / Lightning / Ice / Poison / Arcane** (five schools).
- **Void** — special: ignores % resistance AND enemy typed 50% absorbs. Flat # reduction,
  block, armor (for void attacks), and dodge (for void attacks) still apply, so Void is
  strong vs resistant enemies, not strictly best-in-slot.
- **Pet** — a damage type that SCALES from the owner's Pet Damage stat. Normally dealt by
  pets/structures; a few oddball player weapons deal it too (Engineer Hammer: "30% Pet
  Damage, +3 Pet damage"). A pet's attack also carries a sub-type (dog bite = Pet/Melee)
  for resistances and tracking.

Every attack is tagged: `kind` (attack | spell) + `types` (one or more damage types) +
`deliveryTag` (projectile | melee | explosion | pool | chain | beam | pet | trail | pickup).
Projectiles/spells with a blast radius produce `explosion`-tagged impact damage — this is
what explosion-multikill deeds match. "Counts as a spell" matters for on-spell triggers,
spell block, and class restrictions.

## Player stats

Base starting character (before class modifiers and starting gear):

| Stat | Base |
|------|------|
| Max HP | 10 |
| HP regen | 0/s |
| Melee / Ranged / Pet damage | 0 |
| Magic damage (per school: Fire/Lightning/Ice/Poison/Arcane/Void) | 0 |
| Crit chance | 0% |
| Crit damage | +50% (crit multiplier = 1 + critDamage → ×1.5 base) |
| Armor | 0 |
| Dodge | 0% |
| Move speed | 100% (= 6.8 units/s; dash = 18.75 units/s) |
| Pickup radius | 1.5 units |
| Lifesteal (physical / magical) | 0% |
| Cooldown rate, Area, Projectile speed, Duration | 100% |

- Every class has **starting gear** (see `04-classes.md`) — nobody enters wave 1 unarmed.
- "Magic damage +X (all schools)" adds X to every school. Fire-only bonuses add to fire.
- Weapons deal `weaponMultiplier% × (matching stat) + weapon flat roll`, e.g.
  Shortsword "Deals 100% Melee Damage" with the player at 12 melee → 12 base hit.
  Wand "75% Magic" uses the player's highest school; **ties resolve to Fire** (a fresh
  character's all-zero schools tie → Wands start as fire weapons — deliberate: it seeds
  the fire-unlock chain).
- **Stat stacking**: flat adds sum first, then % increases sum additively into one
  multiplier, then rare "×" multipliers multiply. (`(base + Σflat) × (1 + Σ%) × Π×`)
- Buffs/auras are **recomputed from current state every tick**, never incrementally
  added/removed (predecessor bug: recast double-apply).

## Movement & dash (core verbs; tuned values from the predecessor, proven feel)

- Move: 6.8 units/s base (≈220 px/s at reference zoom). Modified by move speed %.
- **Dash**: 18.75 units/s for 0.18s (≈3.4 units), **i-frames for the first 0.15s**,
  cooldown 0.9s (affected by cooldown rate). Dashing passes through enemies (not walls).
  Dash direction = movement input, else facing. Class mechanics may key off
  "dashed through an enemy" (Rogue, Monk) — that's a tracked event.
- Knockback exists (some weapons/enemies); elites may be Anchored (immune).

## Combo streaks (whimsical meter candy, real XP value)

Party-wide kill streak: each kill adds +1; decays after 3s without a kill. Bonus XP
per kill: +5% per streak count, capped at ×3. Escalating shout tiers with colors and a
scale-punch animation: 5 "COMBO!", 10 "TASTY!", 15 "SIZZLING!", 20 "GLORIOUS!!",
25 "UNSNUFFABLE!!!". Streak break shows a gentle "phew." In co-op the streak is shared
(everyone's kills feed it) — it's a party hype meter.

## Defense math (applied in this order)

1. **Dodge** (vs `kind: attack` only, spells can't be dodged): roll `dodge%`, cap 60%.
   Dodged = 0 damage, logged as avoided (tracker credits the granting item/perk).
2. **Block** (shields): flat `#` subtracted — physical block vs attacks, spell block
   vs spells. Multiple shields sum.
3. **Armor** (vs `kind: attack` only — spells ignore armor; Fighter's Ironhide applies
   25% of armor vs spells as its class perk): % reduction with diminishing returns:
   `reduction = armor / (armor + 25 + 5×wave)`. Cap 85%.
4. **% resistance** by type (or "all"): additive per type, cap 75%. **Void skips this
   step entirely** (and skips enemy typed absorbs).
5. **Flat # damage reduction** by type (or overall): subtracted last; a hit that
   connects always deals ≥1 (chip damage).

Enemies use the same pipeline (and the tracker logs enemy-side mitigation too — offensive
tuning must be able to ask "how much did Pillowman's armor absorb"). Enemy "specific
resistance" = 50% absorb of 1–2 types (icons over elites); Void ignores it.

## Crits

`critChance` rolls per hit; damage × `(1 + critDamage)` — base ×1.5. Spells can crit
unless flagged `noCrit`. Enemy attacks don't crit by default.

## Status effects (only from sources that list them)

| Effect | Rule |
|--------|------|
| **Burn** | DoT: the listed burn amount is dealt over 3s in 0.5s ticks (fire type). Reapply while burning: remaining pool += 50% of the new burn's total; duration refreshes. "Faster ticks" modifiers shorten tick interval — same total, delivered sooner. |
| **Stun** | Target can't act for the listed duration. Generic status — ANY source that lists it (lightning spells, frying pans). Diminishing: each re-stun within 6s is 50% shorter. Elites 50% duration, bosses 15%. (Pan stuns count toward stun deeds — working as intended.) |
| **Slow / Freeze** | Slow: −% move/attack speed. Freeze: full stop (elites/bosses: heavy slow instead). Same diminishing rules as stun. |
| **Poison** | DoT, longer + cheaper per point than burn; stacks fully but each stack is weak. 1s ticks. |
| **Void mark** | Rare; marked target takes +% void damage. |

Effects are DATA: a source lists `effects: [...]` with magnitudes. Fire damage does NOT
burn unless the source says so. Statuses tick on the global sim tick (one shared system).

## Combo rules (item-granted, examples)

- **Ice Bomb** (item): dealing ≥X damage in one hit to a *frozen* enemy detonates it:
  Y ice damage in radius (explosion-tagged).
- **Frostfire** (feat): freezing a *burning* enemy instantly deals all remaining burn
  pool ×2.
- Combos are event-triggered rules (`on: hitFrozenTarget`, etc.) — new combos are data.

## Attack delivery

- Weapons auto-fire on individual cooldowns, in aim direction (or nearest enemy).
- Projectile behaviors are composable flags: `pierce (n)`, `bounce (n)`, `split (n)`,
  `chain (n, radius)` — items add these to matching weapons.
- Delivery primitives: melee arcs, projectiles (± blast radius → explosion), thrown,
  beams (cones), ground pools, orbitals, trails, pet/turret delivery, pickup-triggered.
  All engine primitives referenced from data by name + parameters (`16-engine.md`
  vocabulary); unknown names fail validation loudly.

## Death & revival

Player at 0 HP → snuffed (ghost-wisp follows party). Each player can BE revived once
per wave (alive player holds Interact 3s near the wisp); automatic revive at wave end.
All players snuffed = run over. On-death triggers fire before the state change.
Solo snuff = run over → recap → town.
