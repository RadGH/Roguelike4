# Enemies

All enemies in `data/enemies/*.json`. Launch target: 30+ base types, 4 minibosses,
4 bosses, elite modifiers, possessed chests. Whimsical & colorful: every monster is
soft, round, or charming — menace comes from numbers and telegraphs, not gore.

## Behavior archetypes (engine primitives; enemies are data on top)

- **Chaser** — walks at you, melee bump/bite.
- **Skitterer** — chaser with erratic zig-zag.
- **Shooter** — keeps distance, fires projectiles.
- **Lobber** — arcs projectiles over obstacles, leaves puddles.
- **Charger** — telegraphed line dash (windup flash → charge).
- **Stomper** — telegraphed AoE slam (ring indicator).
- **Summoner** — spawns lesser enemies until popped.
- **Buffer** — auras that shield/hasten nearby enemies (kill first!).
- **Splitter** — splits into smaller copies on death.
- **Mimic** — the possessed chest (below).

## Roster by act (sample — the shape of the catalog)

**Act 1 — Guttering Meadows:** Snuffling (tiny chaser, swarms), Puffball (skitterer),
Dandelion Popper (splitter → seeds), Thistle Archer (shooter), Grumble Beetle
(charger), Mama Fluff (summoner of Snufflings), Sunshy Wisp (buffer).

**Act 2 — Sogbottom Marsh:** Soggun (damp chaser, slows you on contact), Bubblim
(lobber, acid puddles), Mudpuppy (charger), Croakswain (shooter, triple spit),
Bogboil (splitter), Drizzlecloud (flying buffer, rains haste).

**Act 3 — The Frosted Wick:** Snowball With Teeth (rolls faster over time), Icicle
Imp (shooter, slowing shots), Yodeler (summoner via echo), Frostbitten Knight
(stomper), Chatterjaw (skitterer), Draft Ghast (debuffer: chills your attack speed).

**Act 4 — The Snuffed Palace:** Pillowman (big chaser, absorbs first N hits),
Night-Light Snatcher (steals gold on touch — killing it refunds double), Velvet
Archer (shooter, void bolts), Duvet Golem (stomper), Candle-Snuffer (anti-pet
specialist), Hush (silences an area: no spell weapons inside).

## Scaling & modifiers

- Per-wave scaling curve on HP/damage/speed/count (`data/balance.json`), plus act
  multipliers, plus post-act-completion "stirred" variants (first act completion
  upgrades that act's pool with harder versions + new attacks).
- **Size rolls:** Enlarged (+HP, −speed... no wait: brief says size affects speed and
  max HP: Enlarged = +HP +size +speed-slightly-slower; Reduced = fast, tiny, VERY rare
  because it's annoying to aim at).
- **Resistances:** any enemy may roll 1–2 typed 50% absorbs (icons shown). Void ignores.
- **Elites:** named tint + modifier(s): Shielded, Hasty, Vampiric, Stormy (retaliate
  sparks), Anchored (immune to knockback), Gilded (double gold). Reduced stun/freeze
  durations.

## Minibosses (one per act + Evil Eye spawns)

Act 1 **Sir Fluffington III** (charger + summoner). Act 2 **The Damp** (aura of
soggy sadness, extinguishes burn effects). Act 3 **Avalanche Jr.** (grows while
rolling). Act 4 **The Understudy** (copies a random player's weapon, badly).

## Bosses (multi-phase, tiered health bars)

Health bar has tier notches; crossing a notch triggers the next phase (new attacks,
arena change, add waves). Stun/freeze heavily resisted (15% duration).

1. **Mopsy, the Enormous Gloomp** (wave 10) — a vast, apologetic shadow-rabbit.
   P1 hops + shockwaves → P2 summons Snuffling floods → P3 desperate bouncing frenzy.
2. **Sog King Ribbert** (wave 20) — froggy monarch of the marsh. P1 tongue-lash +
   lily hops → P2 rain (haste aura for enemies, puddles slow players) → P3 swallows
   a player (others must burst him to spit them out).
3. **Duchess Shiverina** (wave 30) — an elegant living cold-front. P1 waltzing ice
   beams → P2 blizzard walls sweep arena → P3 freeze-and-shatter combos, brittle gaze.
4. **The Grand Snuff** (wave 40) — the great soft dark itself, wearing a nightcap.
   P1 void zones + pillow golems → P2 lights-out (arena dark except player wicks) →
   P3 attempts to snuff the Everflame directly: survive escort/defense hybrid → P4
   final tantrum, everything at once. Defeat = WIN, roll credits, endless unlocked.

## Possessed Chest (mimic)

Looks ALMOST like a reward chest — tells: faint breathing wobble, tiny feet visible,
slightly wrong latch color; two variants telegraph their drop: **glinting latch** =
drops an item chest, **gilded seams** = drops a gold pile. Bites when approached,
then scurries. Killing it yields its drop; 13 kills unlock the Warlock.
