# Classes

Classes are frameworks: they set equip rules, weapon capacity ("hand points"), starting
gear, base stat modifiers, a signature mechanic, guaranteed level-up item choices, and a
weighted perk pool. All class data lives in `data/classes/*.json`.

## Hand points, the off-hand, and shields (THE slot model)

- Weapon capacity is measured in **hand points**: 1H weapon = 1 point, 2H = 2 points.
- Every class additionally has exactly **one off-hand slot** (a flag, not a point).
- A **shield** consumes 1 hand point AND the off-hand slot → max one shield, regardless
  of points. A **giant shield** consumes 2 hand points AND the off-hand slot.
- **Paladin's exception** (class perk): shields don't require the off-hand slot for
  them — max shields = hand points.
- Passive items don't use hand points; every class has unlimited passive capacity
  (drops are still budgeted).
- Drops are filtered: you never see an item you can't equip — the drop table substitutes
  an equivalent-rarity item you CAN use (per the item's OWNER in round-robin).

Item tags used by equip rules: `melee1h, melee2h, ranged1h, ranged2h, spell, shield,
giantShield, physical, magical, exclusive:<class>`.

## Inventory management

Between waves (reward screen), players may freely equip, **unequip to their run satchel**,
salvage, or tinker. The satchel is per-player, run-scoped, unlimited. Equipping over full
hand points prompts what to displace (displaced item goes to the satchel, not auto-salvage).
An empty-hands state is always reachable (Monk's unlock depends on it).

## Unlock model

The **Hero is the only class unlocked on a fresh save slot** (per the brief). All others
unlock by **deed** (tracked gameplay requirement), by **discovery** (rescue an NPC
mid-run), or by **Glimmer purchase** at Grandmaster Flick (deed classes also get a
pricey purchase shortcut). Deeds are tracked per save slot; each deed is annotated
**[per-player]** (one player must do the whole thing) or **[party]** (pooled across the
couch). Unlocks pop mid-run and are playable from the next run. Fighter/Rogue/Mage
deeds are tuned to complete within the first run or two.

## The 24 launch classes

Format: **Name** — vibe. Hands/equip. Starting gear. Mods. Mechanic. Level-up items. Unlock.

### Starter + the quick three

1. **Hero** — the everyperson with a bedroll and big dreams. 2 pts, all non-exclusive
   items. Starts: Rusty Shortsword + Rusty Sling (1H ranged). No stat modifiers.
   Mechanic: none (that's the point). Unlock: fresh-save default.
2. **Fighter** — proud wall of muscle. 4 pts, weapon/shield items only for HANDS; all
   passives allowed; denies `spell`-kind weapons. Starts: Rusty Shortsword + Rusty Round
   Shield. +4 max HP, +2 melee. Mechanic: *Ironhide* — 25% of armor also applies vs
   spells. Level-up items: lvl 2 choose Javelin / Hatchet / Tower Shield. Unlock: deal
   1,000 total melee damage [party].
3. **Rogue** — grinning pockets-full-of-knives type. 2 pts, anything EXCEPT 2H melee
   and shields. Starts: Rusty Dagger ×2. +5% dodge, +5% crit. Mechanic: *Backspin* —
   dashing through an enemy guarantees your next hit crits. Level-up items: lvl 2 choose
   Dagger / Shortbow / Smoke Vial. Unlock: dash through 25 enemies [party].
4. **Mage** — bookish, flammable. 2 pts, NO physical weapons (denies `physical`).
   Starts: Rusty Wand (fire by default — ties→fire rule). +2 magic (all schools), −2 max
   HP. Mechanic: *Attunement* — +10% damage for your most-used school (carries over
   between waves; defaults to your highest school). Level-up items: lvl 2 choose
   Fireball / Lightning Bolt / Frostbolt (class grants bypass account locks — and
   USING them progresses the matching deeds for everyone). Unlock: deal 500 total magic
   damage [party] (Wands drop in the day-one pool, so any class can progress this).

### Deed unlocks

5. **Paladin** — sworn to the Everflame, glows faintly. 4 pts, weapons + shields +
   arcane "radiance" spells. Starts: Rusty Mace + Rusty Round Shield. +2 HP, +3 armor.
   Mechanic: *Aegis* — shields ignore the off-hand limit (shields = as many as points
   allow); blocking heals nearby allies 1 HP (2s cooldown). Unlock: block 500 damage
   [party].
6. **Berserker** — angry, shirtless, delighted. 4 pts, weapons only, no shields.
   Starts: Rusty Hatchet ×2. +2 melee. Mechanic: *Redline* — +1% damage per 1% missing
   HP; cannot be healed above 80% max HP. Unlock: clear a wave while below 25% HP
   [per-player].
7. **Hunter** — practical, smells like wet dog. 2 pts, ranged + melee1h. Starts: Rusty
   Shortbow + **Dog** pet. +2 ranged, +15% pet damage. Unlock: kill 50 enemies with
   ranged damage [party].
8. **Engineer** — safety goggles, zero safety. 2 pts, ranged + gadgets; no spells.
   Starts: **Engineer Hammer** (melee swing dealing 30% Pet Damage, +3 pet) + **Turret
   Kit**. +1 ranged, +2 pet. Salvaging grants +1 Bit. Unlock: salvage 25 items [party].
9. **Monk** — owns one robe, needs nothing. 0 pts (CANNOT equip weapons; passives ok).
   Starts: fists (see mechanic) + Rusty Prayer Beads (passive: +1 HP regen while
   stationary). +2 HP, +10% move speed. Mechanic: *Hundred Palms* — bare fists are a
   scaling melee weapon (grows every 3 levels); dash-through strikes enemies passed.
   Unlock: complete any wave with no weapons equipped [per-player] (unequip to satchel
   makes this a deliberate choice, not a trap).
10. **Vampire** — velvet cape, sunscreen everywhere. 2 pts, melee + spells. Starts:
    Rusty Dagger + Rusty Wand. Mechanic: *Red Thirst* — +8% physical & magical
    lifesteal; healing pickups 50% less effective. Unlock: lifesteal 1,000 HP total
    [party].
11. **Ninja** — you never saw them unlock. 3 pts, 1H weapons only (any kind). Starts:
    Rusty Dagger + Rusty Throwing Knives. +10% move, +5% dodge, −2 HP. Mechanic:
    *Afterimage* — dash leaves a decoy that taunts briefly (4s cooldown). Unlock: clear
    a wave taking 0 damage [per-player].
12. **Tycoon** — top hat, monocle, coin-counting machine heart. 2 pts, any 1H. Starts:
    Rusty Cane (melee) + Rusty Coin Pouch (passive: +10% gold). Mechanic: *Gold
    Standard* — gold pickups +25%; gains *Coin Toss* pseudo-weapon: every 15 gold
    collected fires a coin (Ranged, scales with gold held). Unlock: hold 5,000 gold in
    a single run [per-player].
13. **Pyromancer** — eyebrows long gone. 2 pts, spells + ranged. Starts: Rusty
    Candlestick (melee-range fire spell with listed burn). Fire +3. Mechanic:
    *Kindling* — your burn ticks are 25% faster (same total, sooner). Unlock: kill 100
    enemies with burn damage [party].
14. **Stormcaller** — hair permanently vertical. 2 pts, spells only. Starts: Rusty
    Sparkrod (lightning bolt spell). Lightning +3. Mechanic: *Static* — every 8th hit
    chains to a nearby enemy. Unlock: stun 100 enemies [party].
15. **Frostwitch** — brings her own weather. 2 pts, spells only. Starts: Rusty Icicle
    (ice bolt, listed slow). Ice +3. Mechanic: *Wintry Aura* — enemies within 2 units
    slowed 15%. Unlock: freeze 100 enemies [party].
16. **Alchemist** — licensed in three counties, banned in two. 2 pts, thrown + spells.
    Starts: Rusty Flask (thrown, poison pool). Poison +3. Mechanic: *Spillage* — 15%
    chance your kills leave an acid pool. Unlock: kill 100 enemies with poison damage
    [party].
17. **Warlock** — signed a very reasonable contract. 2 pts, spells only. Starts: Rusty
    Umbral Coil (void bolt). Void +2. Mechanic: *Pact* — 10% of your damage in any
    school converts to Void; at each wave start, the contract collects 1 unblockable
    void damage (cannot reduce you below 1 HP — the fine print has fine print).
    Unlock: defeat 13 possessed chests [party].
18. **Bard** — armed with three chords and confidence. 1 pt, any 1H. Starts: Rusty Lute
    (melee swipe) + *Anthem* auras. Mechanic: auto-cycling songs buff all allies
    (+damage / +speed / +regen); the aura is a tracked damage/heal source. Unlock:
    complete a wave without dealing damage yourself [per-player] (pets/allies may).
19. **Jester** — chaos with bells on. 2 pts, any. Starts: Rusty Juggling Balls (ranged,
    bounce 2). Mechanic: *Wheel of Whee* — a random bonus boon each wave; all boon
    picks offer 5 options but one is always a joke. Unlock: get snuffed 10 times
    [party].
20. **Snail Knight** — a knight. Who is a snail. 2 pts, melee + shields. Starts: Rusty
    Mace + Rusty Round Shield. −35% move speed (party camera never leashes them — see
    02), +10 armor, +4 HP. Mechanic: *Trail* — slime ribbon damages (Poison) and slows
    enemies; +50% block while stationary. Unlock: take 10,000 total damage [party].

### Discovery unlocks (rescue the NPC during a run, then purchase with Glimmers)

21. **Necromancer** — sweet old soul, terrible hobbies. 0 pts (no weapons; passives
    ok). Starts: Rusty Bone Charm (passive: +1 zombie cap). +3 pet. Mechanic: *Rise and
    Shine* — slain enemies have a 20% chance to rise as friendly zombies (Pet/Melee,
    20s); zombie cap grows with level. Designed to beat the game weaponless. Discovery:
    rescue **Gravekeeper Mortimer** (Act 2 event), then 40 Glimmers.
22. **Beekeeper** — calm in a way that unsettles the bees' enemies. 1 pt, any 1H.
    Starts: Rusty Smoker (cone, slow) + **Bee Swarm** pet. Mechanic: taking a hit
    angers the swarm (+damage 5s). Discovery: rescue **Beekeeper Bumble** (Act 1
    event), then 25 Glimmers.
23. **Chef** — the pan is both weapon and instrument. 2 pts, melee + thrown. Starts:
    **Frying Pan**. Mechanic: *Mise en Place* — healing pickups drop 50% more often and
    can overheal to +25% max HP. Discovery: rescue **Chef Basil** (Act 3 event), then
    25 Glimmers.
24. **Oracle** — sees next Tuesday clearly, today only dimly. 2 pts, spells only.
    Starts: Rusty Crystal Ball (arcane orbit). Arcane +3. Mechanic: *Foresight* —
    choice CHESTS show contents before you pick which to open, and offer 1-of-5
    instead of 1-of-4. (Boon picks are unaffected — that's Lucky Ribbon's job.)
    Discovery: rescue **Madame Wobble** (Act 4 event), then 40 Glimmers.

## Balance guardrails

- Every class must clear Act 1 solo with random drops in simulation ≥60% of the time
  at launch tuning (novelty classes ≥40%) — sim harness gates this (see calibration
  caveats in `13-simulation.md`).
- Rarity power must be monotonic (higher rarity never strictly worse) — sim/test gate.
- Classes never lock a dream build behind themselves exclusively — e.g. gold-damage
  builds are best on Tycoon but possible on anyone via items.
