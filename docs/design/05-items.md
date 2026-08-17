# Items

All items live in `data/items/*.json` (one file per category). Launch target: 200+
items. This doc defines the SYSTEM completely and lists the anchor items every system
depends on; the full catalog is authored directly in data (the website renders it).

## Item anatomy

```jsonc
{
  "id": "fireball",              // stable slug, never renamed
  "name": "Fireball",
  "category": "weapon",          // weapon | shield | passive | perkItem (feats live in data/feats)
  "tags": ["spell", "magical", "fire"],
  "hands": 1,                    // 0 for passives
  "kind": "spell",               // attack | spell (what triggers/blocks treat it as)
  "delivery": { "type": "projectile", "speed": 8, "radius": 0.9, "cooldown": 1.4 },
  "damage": { "types": ["fire"], "multiplier": 1.0, "flat": [2, 4] },
  "grants": [{ "stat": "fireDamage", "flat": 3 }],
  "effects": [],                 // e.g. burn, stun — only if listed!
  "triggers": [],                // event rules: { on, chance, do }
  "unlock": { "type": "deed", "deed": "fire-kill-1" },
  "rarity": "common",            // common | uncommon | rare | epic | legendary
  "flavor": "Warm. Very warm. Okay, too warm."
}
```

## Quality tiers (every weapon/shield; passives too)

Rusty (×0.8) → Standard (×1.0) → Fine (×1.15) → Superb (×1.3) → Masterwork (×1.5).
Quality multiplies the item's multipliers/flat grants. Drop quality odds scale with
wave + act. **Tinkering:** between waves, spend Bits (from salvaging) to raise one
item's quality a tier (cost grows per tier).

## Variant rolls (independent small chances on any drop)

- **Corrupted** (3%): stat VALUES keep magnitude but map to different properties —
  a Corrupted Fireball might deal Ice damage; a Corrupted Shortsword might deal Fire
  damage and count as a spell. Deterministic per-item remap table, so corruptions are
  discoverable/collectible, not pure noise.
- **Cursed** (4%): one stat boosted +50%, another random stat gets a negative rider
  (+damage but −max HP). Not necessarily bad. Purple smoke visual.
- **Relic** (2%): 1–2 EXTRA affix stats beyond defaults. Ancient trim visual.
- **Holographic** (1.5%): visibly shiny/glowy in the arena and inventory; ×1.05 on all
  numeric grants. Pure delight + slight power. Stacks with any of the above (rare
  jackpot: a Holographic Cursed Relic).

## Affixes

Relics, some rarities, and Tinker rerolls draw from the affix pool
(`data/affixes.json`): flat stats, % stats, projectile behaviors (pierce/bounce/
split/chain), effect adders (burn/slow/stun chance), trigger riders ("on kill: 10%
drop bomb"). Affix pool targets 80+ at launch (breadth modeled on the predecessor's
affix system — see research notes).

## Anchor weapons (system-defining; full list in data)

| Item | Profile |
|------|---------|
| Shortsword | 1H melee, 100% melee, +3 melee. The baseline. |
| Javelin | 1H melee-at-range (thrown, melee damage type), 110%, slow. |
| Greatclub | 2H melee, 220%, big arc, slow. |
| Dagger | 1H melee, 70%, very fast, +5% crit. |
| Shortbow | 1H ranged, 90%, +3 ranged. |
| Scattershot Bow | 2H ranged, 5×40% cone — the shotgun-style multishot bow. |
| Rocket Launcher | 2H ranged explosive, 250% blast. Unlock: kill 5+ enemies in one explosion. |
| Wand | 1H spell, 75% magic (highest school), +3 magic all. |
| Fireball | 1H spell, 100% fire, +3 fire. Unlock: kill an enemy with fire damage. |
| Lightning Bolt | 1H spell, 90% lightning, listed stun 0.5s. |
| Frostbolt | 1H spell, 85% ice, listed slow. |
| Meteor | 2H spell, 300% fire blast at cursor, long cd. Unlock: kill 5+ enemies in one explosion where the explosion was fire damage. |
| Flamethrower | 2H ranged/fire cone beam, listed burn. Unlock: have 5 enemies ignited simultaneously. |
| Chain Lightning | 2H spell, 80% lightning, chains 4 (radius scales w/ Area). |
| Frying Pan | 1H melee, 95%, every 5th hit stuns 0.5s (Chef's signature, drops for anyone once unlocked). |
| Round Shield | off-hand, block 2 physical. |
| Tower Shield | off-hand, block 4 physical, −10% move. |
| Spellward Buckler | off-hand, block 1 physical + 2 spell. |
| Giant Shield "Doorleaf" | 2H shield, block 8, +15% resist all, you are the wall. |

## Anchor passives

| Item | Effect |
|------|--------|
| Lodestone Charm | +50% pickup radius. |
| Magpie's Eye | 10% chance to auto-collect any gold drop (personal, reacts to all drops). |
| Ice Bomb | Dealing ≥15 damage in one hit to a frozen enemy: explodes for 200% ice. |
| Powder Keg Belt | Enemies you kill: 8% chance to leave a fire pool. |
| Splitter Prism | Your projectiles split into 2 at first impact (−25% damage each). |
| Bouncy Castle Writ | Projectiles bounce twice off arena walls. |
| Magnet Crown | Your pets also collect pickups in their radius. |
| Coin-Operated Blade | Collecting gold: next attack +1% per coin (caps 50%). Gold-damage build anchor. |
| Second Wick | Once per run: survive a snuff at 1 HP. |
| Greedy Gauntlet | +30% gold, −10% XP. Cursed-adjacent by design. |
| Zombie Flute | Your kills: 5% rise as friendly zombie (anyone can dabble in necromancy). |
| Storm Anklet | Your MELEE hits: 15% chance to chain lightning 2 jumps (physical-AoE build anchor). |

## Evil items (opt-in difficulty, rare drops; stack across party)

| Item | Effect |
|------|--------|
| Evil Candle | +25% enemy spawn rate. Rewards: nothing directly — more enemies = more drops. |
| Evil Heart | Enemies spawn one difficulty grade higher, +40% XP & gold from them. |
| Evil Eye | Every wave spawns a miniboss; it drops an item chest or a gold+XP burst. |

## Build-enabler map (dream builds → required content)

| Dream build | Enablers |
|-------------|----------|
| Weaponless necromancer | Necromancer class, Zombie Flute, Bone Banner (zombie cap+), Marching Orders (zombie speed), graveyard feats |
| Chain-lightning horde mage | Chain Lightning, Storm Anklet, Conductor's Baton (chain +2 jumps), Area% stats |
| Shotgun-bow rogue | Scattershot Bow, Splitter Prism, point-blank feat (+damage close range) |
| Gold-pickup damage | Coin-Operated Blade, Magpie's Eye, Tycoon's Coin Toss, Golden Grind feat |
| Exploding-enemy fireball | Fireball, Powder Keg Belt, Cinder feat (burn victims explode), Meteor |
| Frostfire | Frostbolt/Frostwitch + any burn source + Frostfire feat |
| Void warlock | Warlock, void weapons (Umbral Coil, Null Rod), Void mark items |

Rule: every dream build's full kit must be obtainable by wave 20 in sim given
targeted play (the sim harness verifies reachability).

## Drops & salvage

- Chests drop mid-wave (from kills, elites, minibosses), collected on touch, opened
  after the wave. Chest types: exact-item chest, choice chest (pick 1 of 4; Oracle/
  rare item makes 5), gold chest, gem (Glimmer) chest.
- Reward screen: equip or salvage each item. Salvage → Bits (by rarity). Bits fuel
  Tinkering (quality upgrades) and rare reward-screen rerolls.
- Drop filtering: items you can't equip never appear (substituted at generation).
- Round-robin ownership per co-op rules.
