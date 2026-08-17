# Boons & Feats (level-up rewards)

The brief describes two level-up reward layers; we name them **Boons** (every level)
and **Feats** (every 3rd level). [INTERPRETATION — confirm with user at a check-in:
brief items #3 and #5 read as two systems: per-level "choose a perk from 4 random"
and every-3-levels "perk that acts like an item".]

## Boons — every level

- On each level gained, the player picks **1 of 4** random boons (a rare item —
  Lucky Ribbon — makes it 5; Oracle class also gets 5).
- Boons are small, stackable, immediate: +2 max HP, +1 melee, +4% crit, +8% area,
  +5% move speed, +1 armor, +3% dodge (cap-aware), +1 fire damage, +10% burn duration,
  +5% pickup radius, +1 HP/s regen while stationary, etc.
- Pool is weighted by class + current build (mild smart-drop bias: owning fire items
  nudges fire boons from 1.0× to 1.3× weight — visible in codex, never exclusionary).
- Target pool: 60+ boons (`data/boons.json`).

## Feats — every 3rd level (class-modifiable cadence)

- A feat IS an item (category `perkItem`) that lives in a dedicated feats inventory —
  it cannot be dropped or salvaged, and acts exactly like a passive item for stats,
  triggers, and combat tracking attribution.
- Choice of **1 of 4** from the unlocked feat pool; class-tagged feats are weighted up
  for matching classes; some feats are fully generic.
- Jester's cadence perk example: feats every 2 levels, but one option is always a joke.
- Target pool: 40+ feats (`data/feats.json`). Feats carry the wild special effects:

| Feat | Effect |
|------|--------|
| Frostfire | Freezing a burning enemy detonates all remaining burn damage ×2 instantly. |
| Cinder | Enemies that die while burning explode (60% of their burn as fire AoE). |
| Golden Grind | Collecting gold grants +0.5% damage for 4s per coin (stacks to 30%). |
| Point Blank | +40% ranged damage within 3m. |
| Conductor | Your chains/bounces jump +1 time. |
| Grave Dividend | Your zombies drop 1 gold when they expire. Politely. |
| Static Charge | Standing still 1s: next attack stuns. |
| Glass Cannon | +30% damage, −25% max HP. |
| Tortoise Code | +2 armor per equipped shield; +1 block while stationary. |
| Second Course | Healing pickups: +25% and feed your pets too. |
| Overflow | Overkill damage on a kill splashes to the nearest enemy. |
| Long Fuse | Your explosions are 20% larger but detonate 0.4s later. |
| Homing Instinct | Projectiles curve gently toward enemies. |
| Bee Yourself | Gain a tiny bee. It's not much. It believes in you. (+1 pet, morale) |

## Unlocks

Boons are mostly available from the start; feats unlock like items (deeds, purchases
at Professor Lumen, discoveries) and show in the codex with hints. A feat must be
unlocked at the account level before it can appear in any run's 1-of-4.
