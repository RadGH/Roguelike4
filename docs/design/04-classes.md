# Classes

Classes are frameworks: they set equip rules, weapon capacity ("hand points"),
base stat modifiers, a signature mechanic, guaranteed level-up item choices, and a
weighted perk pool. All class data lives in `data/classes/*.json`.

## Hand points & equip rules

Weapon capacity is measured in hand points: 1H weapon = 1, 2H weapon = 2. Shields are
weapons that fit only the off-hand (giant shields take a 2H slot). A class lists hand
points plus allow/deny tags. Drops are filtered: you never see an item you can't equip —
the drop table substitutes an equivalent-rarity item you CAN use.

Item tags used by equip rules: `melee1h, melee2h, ranged1h, ranged2h, spell, shield,
giantShield, physical, magical, exclusive:<class>`.

## Unlock model

Classes unlock by **deed** (a tracked gameplay requirement), by **discovery** (rescue an
NPC mid-run), or by **Glimmer purchase** at Grandmaster Flick (some deeds ALSO have a
purchase shortcut at a steep price). The codex lists every class with its unlock hint.

## The 24 launch classes

Format: **Name** — vibe. Hands/equip. Mods. Mechanic. Level-up items. Unlock.

### Core four

1. **Hero** — the everyperson with a bedroll and big dreams. 2 pts, all non-exclusive
   items. No modifiers. Mechanic: none (that's the point). Level-up items: none
   guaranteed. Unlock: available from the start.
2. **Fighter** — proud wall of muscle. 4 pts, weapons + shields ONLY (no spell-type,
   no passive-slot magic trinkets — deny tag `spell`). +4 max HP, +2 melee. Mechanic:
   *Ironhide* — armor also applies at 25% vs spells. Level-up items: lvl 2 choose 1 of
   Shortsword / Javelin / Round Shield. Unlock: deal 1,000 total melee damage (account).
3. **Rogue** — grinning pockets-full-of-knives type. 2 pts, anything EXCEPT 2H melee
   and shields. +5% dodge, +5% crit. Mechanic: *Backspin* — dashing through an enemy
   guarantees your next hit crits. Level-up items: lvl 2 choose Dagger / Shortbow /
   Smoke Vial. Unlock: dodge 25 attacks (account).
4. **Mage** — bookish, flammable. 2 pts, NO physical weapons (deny `physical`).
   +2 magic (all schools), −2 max HP. Mechanic: *Attunement* — +10% damage for your
   most-used school this wave. Level-up items: lvl 2 choose Fireball / Lightning Bolt /
   Frostbolt. Unlock: deal 500 total magic damage (account).

### Deed unlocks

5. **Paladin** — sworn to the Everflame, glows faintly. 4 pts, weapons + shields +
   holy spells; may hold shields in ANY slot (two shields = fortress). +2 HP, +3 armor.
   Mechanic: *Aegis* — blocking heals nearby allies 1 HP (2s cooldown). Unlock: block
   500 damage.
6. **Berserker** — angry, shirtless, delighted. 4 pts, weapons only, no shields.
   +2 melee. Mechanic: *Redline* — +1% damage per 1% missing HP; cannot be healed above
   80% HP. Unlock: clear a wave while below 25% HP.
7. **Hunter** — practical, smells like wet dog. 2 pts, ranged + melee1h. +2 ranged.
   Mechanic: starts with **Dog** pet (bite = Pet/Melee); +15% pet damage. Unlock: kill
   50 enemies with ranged damage.
8. **Engineer** — safety goggles, zero safety. 2 pts, ranged + gadgets; no spells.
   +1 ranged, +2 pet. Mechanic: starts with **Turret Kit** (deployable turret,
   Pet/Ranged); salvaging grants +1 Bit. Unlock: salvage 25 items.
9. **Monk** — owns one robe, needs nothing. 0 pts (CANNOT equip weapons; passives ok).
   +2 HP, +10% move speed. Mechanic: *Hundred Palms* — bare fists are a scaling
   melee weapon (grows every 3 levels); dodge-dash strikes enemies passed through.
   Unlock: complete any wave with no weapons equipped.
10. **Vampire** — velvet cape, sunscreen everywhere. 2 pts, melee + spells. Mechanic:
    *Red Thirst* — +8% physical & magical lifesteal, healing pickups 50% less
    effective. Unlock: lifesteal 1,000 HP total.
11. **Ninja** — you never saw them unlock. 3 pts, 1H weapons only (any kind). +10%
    move, +5% dodge, −2 HP. Mechanic: *Afterimage* — dash leaves a decoy that taunts
    briefly (4s cooldown). Unlock: clear a wave taking 0 damage.
12. **Tycoon** — top hat, monocle, coin-counting machine heart. 2 pts, any 1H. Mechanic:
    *Gold Standard* — gold pickups +25%; gains *Coin Toss* pseudo-weapon: every 15 gold
    collected fires a coin (Ranged, scales with gold held). Unlock: hold 5,000 gold in
    a single run.
13. **Pyromancer** — eyebrows long gone. 2 pts, spells + ranged; fire school +3.
    Mechanic: *Kindling* — your burns tick 33% faster. Unlock: kill 100 enemies with
    burn damage.
14. **Stormcaller** — hair permanently vertical. 2 pts, spells only. Lightning +3.
    Mechanic: *Static* — every 8th hit chains to a nearby enemy. Unlock: stun 100
    enemies.
15. **Frostwitch** — brings her own weather. 2 pts, spells only. Ice +3. Mechanic:
    *Wintry Aura* — enemies within 2m are slowed 15%. Unlock: freeze 100 enemies.
16. **Alchemist** — licensed in three counties, banned in two. 2 pts, thrown weapons +
    spells. Poison +3. Mechanic: *Spillage* — 15% chance enemies you kill leave an acid
    pool. Unlock: kill 100 enemies with poison damage.
17. **Warlock** — signed a very reasonable contract. 2 pts, spells only. Void +2.
    Mechanic: *Pact* — 10% of your damage in any school is converted to Void; −1 HP
    per wave (the contract's fine print). Unlock: defeat 13 possessed chests.
18. **Bard** — armed with three chords and confidence. 1 pt, any 1H. Mechanic: *Anthem*
    auras — auto-cycling songs buff all allies (+damage / +speed / +regen); Bard's aura
    counts as their "weapon" for tracking. Unlock: complete a wave without dealing
    damage yourself (pets/allies may).
19. **Jester** — chaos with bells on. 2 pts, any. Mechanic: *Wheel of Whee* — random
    boon each wave (from a curated silly pool); rewards offer 5 boon choices but one is
    always a joke. Unlock: get snuffed 10 times (account).
20. **Snail Knight** — a knight. Who is a snail. 2 pts, melee + shields. −35% move
    speed, +10 armor, +4 HP. Mechanic: *Trail* — leaves a slime ribbon that damages
    (Poison) and slows enemies; shell grants +50% block while stationary. Unlock: take
    10,000 total damage (account).

### Discovery unlocks (rescue the NPC during a run, then purchase with Glimmers)

21. **Necromancer** — sweet old soul, terrible hobbies. 0 pts (no weapons; passives
    ok). +3 pet. Mechanic: *Rise and Shine* — slain enemies have a 20% chance to rise
    as friendly zombies (Pet/Melee, 20s); zombie cap grows with level. Designed to beat
    the game weaponless. Discovery: rescue **Gravekeeper Mortimer** (Act 2 event),
    then 40 Glimmers.
22. **Beekeeper** — calm in a way that unsettles the bees' enemies. 1 pt, any 1H.
    Mechanic: starts with **Bee Swarm** pet (Pet/Ranged, many tiny hits); taking a hit
    angers the swarm (+damage 5s). Discovery: rescue **Beekeeper Bumble** (Act 1
    event), then 25 Glimmers.
23. **Chef** — the pan is both weapon and instrument. 2 pts, melee + thrown. Mechanic:
    *Mise en Place* — healing pickups drop 50% more often and can overheal to +25% max
    HP; starts with Frying Pan (melee, brief stun on 5th hit). Discovery: rescue
    **Chef Basil** (Act 3 event), then 25 Glimmers.
24. **Oracle** — sees next Tuesday clearly, today only dimly. 2 pts, spells only.
    Arcane +3. Mechanic: *Foresight* — reward chests show their contents before
    choosing which to open; 1-of-4 choices become 1-of-5. Discovery: rescue **Madame
    Wobble** (Act 4 event), then 40 Glimmers.

## Balance guardrails

- Every class must clear Act 1 solo with random drops in simulation ≥60% of the time
  at launch tuning (sim harness gates this).
- Novelty classes (Jester, Snail Knight, Chef) may be weaker but never unplayable
  (≥40% Act 1 sim clear).
- Classes never lock a dream build behind themselves exclusively — e.g. gold-damage
  builds are best on Tycoon but possible on anyone via items.
