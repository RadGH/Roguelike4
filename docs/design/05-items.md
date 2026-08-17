# Items

All items live in `data/items/*.json`. Launch target: 200+ items. This doc defines the
SYSTEM completely and lists the anchor items every system depends on; the full catalog
is authored directly in data (the website renders it). **Rule inherited from the
predecessors: no item lands in data without being live in drop pools the same commit.**

## Item anatomy

```jsonc
{
  "id": "fireball",              // stable slug, never renamed
  "name": "item.fireball.name",  // string key (strings/en.json holds display text + flavor)
  "category": "weapon",          // weapon | shield | passive | perkItem (feats)
  "tags": ["spell", "magical", "fire"],
  "hands": 1,                    // 0 for passives; shields also set "offhand": true
  "kind": "spell",               // attack | spell
  "delivery": { "type": "projectile", "speed": 8, "blastRadius": 0.9, "cooldown": 1.4 },
  "damage": { "types": ["fire"], "multiplier": 1.0, "flat": [2, 4] },
  "grants": [{ "stat": "fireDamage", "flat": 3 }],
  "effects": [],                 // e.g. burn, stun — only if listed!
  "triggers": [],                // event rules: { on, chance, do }
  "unlock": { "type": "deed", "deed": "fire-kill-1" },  // omit = day-one pool
  "rarity": "common",
  "flavor": "item.fireball.flavor"
}
```
Items with `blastRadius` deal `explosion`-tagged damage (feeds explosion deeds).

## Rarity (mechanics, not paint)

| Rarity | Drop weight | Affixes | Stat budget | Guarantee |
|--------|------------|---------|-------------|-----------|
| Common | 55 | 0 | ×1.0 | — |
| Uncommon | 27 | 1 | ×1.1 | — |
| Rare | 12 | 2 | ×1.2 | — |
| Epic | 5 | 3 | ×1.35 | — |
| Legendary | 1 | 2 | ×1.35 | + one DISTINCT hook effect (a real behavior, not stats) |

- Weights shift with wave/act (later = richer). Budget multiplies numeric grants.
- **Monotonicity is a test gate**: a higher-rarity roll of the same item is never
  strictly worse (predecessor shipped a rarest-is-worst bug).
- Legendary hook effects come from a registry of DISTINCT behaviors (predecessor lesson:
  12 effects across 48 legendaries collapsed build variety — we budget 1 hook : 1-2
  legendaries, 30+ hooks at launch).

## Quality tiers (orthogonal to rarity; every item)

Rusty (×0.8) → Standard (×1.0) → Fine (×1.15) → Superb (×1.3) → Masterwork (×1.5),
multiplying the item's multipliers/flat grants. Drop quality odds scale with wave + act.
**Tinkering:** between waves, spend Bits (from salvaging) to raise one item's quality a
tier (cost grows per tier). Bits do ONLY tinkering; reward-screen rerolls cost gold.

## Variant rolls (independent chances on any drop — all can co-occur; a Holographic
Cursed Relic is a jackpot story)

- **Corrupted** (3%): stat VALUES keep magnitude but map to different properties via a
  deterministic per-item remap table (a Corrupted Fireball deals Ice; a Corrupted
  Shortsword deals Fire and counts as a spell) — discoverable/collectible, not noise.
- **Cursed** (4%): one stat +50%, another random stat gets a negative rider. Not
  necessarily bad. Purple smoke visual.
- **Relic** (2%): 1–2 EXTRA affix stats beyond defaults. Ancient trim visual.
- **Holographic** (1.5%): visibly shiny/glowy in arena and inventory; ×1.05 all grants.

## Affixes

Uncommon+ rolls draw from the affix pool (`data/affixes.json`): flat stats, % stats,
projectile behaviors (pierce/bounce/split/chain), effect adders (burn/slow/stun chance),
trigger riders ("on kill: 10% drop bomb"). Pool targets 80+ at launch. Every affix stat
key must exist in the stat registry — **unknown keys fail loudly at load** (the
predecessor silently dropped 37 authored affixes for years).

## Day-one pool (fresh save) — weapons/passives with no unlock deed

Starting-gear items (Rusty Shortsword/Sling/Dagger/Wand/etc. — see classes) PLUS these
drops: Shortsword, Sling, Dagger, Hatchet, Javelin, Shortbow, Wand (fire on fresh
characters via ties→fire), **Candlestick** (melee-range fire swipe with listed burn —
the day-one burn source), **Firecracker** (thrown, small blast — the day-one explosion
source), Round Shield, Tower Shield, Lodestone Charm, Magpie's Eye, Smoke Vial, and
~25 more commons/uncommons. This pool guarantees every unlock chain has a reachable
first link (audited in `10-unlocks-codex.md#day-one-audit`).

## Anchor weapons (system-defining; full list in data)

| Item | Profile |
|------|---------|
| Shortsword | 1H melee, 100% melee, +3 melee. The baseline. |
| Sling | 1H ranged, 80% ranged, +2 ranged. Humble. Reliable. |
| Javelin | 1H melee-at-range (thrown, melee type), 110%, slow. |
| Hatchet | 1H melee, 90%, fast. |
| Greatclub | 2H melee, 220%, big arc, slow. |
| Dagger | 1H melee, 70%, very fast, +5% crit. |
| Shortbow | 1H ranged, 90%, +3 ranged. |
| Scattershot Bow | 2H ranged, 5×40% cone — the shotgun-style multishot bow. |
| Rocket Launcher | 2H ranged explosive, 250% blast. Unlock: 5+ kills in one explosion. |
| Firecracker | 1H thrown, 70% ranged, small blast. Day-one explosion seed. |
| Candlestick | 1H fire spell (melee arc), 90% fire, listed burn. Day-one fire+burn seed. |
| Wand | 1H spell, 75% highest school (ties→fire), +3 magic all. |
| Fireball | 1H spell projectile w/ blast, 100% fire, +3 fire. Unlock: kill an enemy with fire damage. |
| Lightning Bolt | 1H spell, 90% lightning, listed stun 0.5s. |
| Frostbolt | 1H spell, 85% ice, listed slow. |
| Meteor | 2H spell, 300% fire blast at cursor, long cd. Unlock: 5+ kills in one FIRE explosion. |
| Flamethrower | 2H fire cone beam, listed burn. Unlock: 5 enemies ignited simultaneously. |
| Chain Lightning | 2H spell, 80% lightning, chains 4 (radius scales w/ Area). |
| Frying Pan | 1H melee, 95%, every 5th hit stuns 0.5s. |
| Engineer Hammer | 1H melee swing dealing 30% PET damage, +3 pet. The pet-scaling oddball (per the brief). |
| Round Shield | shield (1 pt + off-hand), block 2 physical. |
| Tower Shield | shield, block 4 physical, −10% move. |
| Spellward Buckler | shield, block 1 physical + 2 spell. |
| Giant Shield "Doorleaf" | 2H shield (2 pts + off-hand), block 8, +15% resist all. |

## Anchor passives

| Item | Effect |
|------|--------|
| Lodestone Charm | +50% pickup radius. |
| Magpie's Eye | 10% chance to auto-collect any gold drop (personal, reacts to all drops). |
| Ice Bomb | ≥15 damage in one hit to a frozen enemy: explodes for 200% ice (explosion-tagged). |
| Powder Keg Belt | Enemies you kill: 8% chance to leave a fire pool. |
| Splitter Prism | Projectiles split into 2 at first impact (−25% damage each). |
| Bouncy Castle Writ | Projectiles bounce twice off arena walls. |
| Magnet Crown | Your pets also collect pickups in their radius. |
| Coin-Operated Blade | Collecting gold: next attack +1% per coin (caps 50%). Gold-build anchor. |
| Second Wick | Once per run: survive a snuff at 1 HP. |
| Greedy Gauntlet | +30% gold, −10% XP. |
| Zombie Flute | Your kills: 5% rise as friendly zombie. |
| Storm Anklet | Your MELEE hits: 15% chance to chain lightning 2 jumps. |
| Lucky Ribbon | Boon picks offer 5 choices instead of 4 (boons ONLY — chest choices are Oracle's Foresight). |

## Evil items (opt-in difficulty, rare drops; stack across party — the brief's "% enemy
count/health/damage/speed" niche items)

| Item | Effect |
|------|--------|
| Evil Candle | +25% enemy spawn rate. |
| Evil Heart | Enemies spawn one difficulty grade higher; +40% XP & gold from them. |
| Evil Eye | Every wave spawns a miniboss; it drops an item chest or a gold+XP burst. |
| Evil Bellows | +20% enemy move speed; +15% gold. |
| Evil Drum | +30% enemy max HP; +20% XP. |
| Evil Fist | +15% enemy damage; +1 chest per wave. |

## Build-enabler map (dream builds → required content)

| Dream build | Enablers |
|-------------|----------|
| Weaponless necromancer | Necromancer class, Zombie Flute, Bone Banner (zombie cap+), Marching Orders (zombie speed), graveyard feats |
| Chain-lightning horde mage | Chain Lightning, Storm Anklet, Conductor feat, Area% stats |
| Shotgun-bow rogue | Scattershot Bow, Splitter Prism, Point Blank feat |
| Gold-pickup damage | Coin-Operated Blade, Magpie's Eye, Tycoon's Coin Toss, Golden Grind feat |
| Exploding-enemy fireball | Fireball, Powder Keg Belt, Cinder feat, Meteor |
| Frostfire | Frostbolt/Frostwitch + any burn source + Frostfire feat |
| Void warlock | Warlock, void weapons (Umbral Coil, Null Rod), Void mark items |

Rule: every dream build's full kit must be obtainable by wave 20 in sim given targeted
play (sim harness verifies reachability — see calibration caveats).

## Drops, salvage & the peddler

- Chests drop mid-wave (kills, elites, minibosses), collected on touch, opened after
  the wave. Types: exact-item, choice (1 of 4; Oracle makes chests 5), gold, Glimmer.
- Round-robin ownership per co-op rules; if the owner retires before opening, their
  unopened chests pass to the next player in rotation and re-roll contents through the
  new owner's equip filter at the same rarity.
- Reward screen: equip / satchel / salvage each item, with a **three-panel diff
  tooltip** (new item, currently equipped, stat delta in green/red). Salvage → Bits by
  rarity. Satchel items can be equipped or salvaged any later wave.
- **Wandering Peddler** (the in-run gold sink): visits the reward screen after waves
  3, 6, 9 of each act (data-driven schedule). Stock: 3 items rolled for each player's
  filter + 1 consumable, prices scale with act. Gold is mirrored, so prices are flat
  per player. Reward-screen rerolls also cost gold.
