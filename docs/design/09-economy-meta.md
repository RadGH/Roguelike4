# Economy, Town Meta & Progression

## Currencies

| Currency | Scope | Sources | Sinks |
|----------|-------|---------|-------|
| **Gold** | run-only, mirrored to all non-retired players (incl. snuffed) | kills, chests, gilded elites | Wandering Peddler purchases; reward-screen reroll fees. (Gold sinks are gold-only.) |
| **Bits** | run-only, per player | salvaging items | Tinkering (quality upgrades) ONLY |
| **Glimmers** | PERSISTENT (per save slot) | boss kills, act completions, gem chests, first-time deed bonuses (select deeds award 1–5 Glimmers) | town shops: unlock classes/items/feats, town upgrades, starting-stat upgrades |
| **Emberkeys** | persistent, one per act | first completion of each act | relight Beacon Pillars (act unlocks; the ceremony animation) |

## Town shops (all prices in Glimmers; all inventories data-driven)

- **Grandmaster Flick (classes):** purchasable class unlocks + purchase shortcuts for
  deed classes at premium prices. Shows each class's kit preview.
- **Forgemaster Cinder (items):** unlock item lines so they join drop pools (e.g.
  "Storm cache: Storm Anklet + Conductor's Baton"). Also permanent +1 starting Bits.
- **Professor Lumen (feats/boons):** unlock feats; upgrade boon quality (unlock the
  rare tier of boons).
- **Mayor Tallow (town upgrades):** persistent account power & convenience:
  +starting HP/damage tiers, +1 reward chest choice, start runs with a Standard-
  quality weapon of choice, Bellhop act-start packages, cosmetic town growth
  (each upgrade visibly builds the town — banners, lamps, gardens).

## Glimmer budget (launch targets — tunable in balance.json, gated by sim economy sweep)

| Source | Glimmers |
|--------|----------|
| Failed Act 1 run (typical) | 3–6 |
| First clear of an act (Emberkey run) | 15 + boss drops |
| Repeat act clear | 8–12 per act reached |
| First-time deed bonuses (total across all deeds) | ~120 |
| **Total sink cost** (all classes + item lines + feats + town upgrades) | **~600** |
| Target: full town from zero | 15–20 runs of improving quality |

## Starting-stat upgrade track (Mayor)

Small, capped, visible: +1 max HP ×10, +1 base damage (choose stat) ×5, +5% pickup
radius ×4, +1 starting boon pick ×1. Caps keep runs skill-forward, town assists.
(The Mayor's "starting weapon of choice" upgrade lets you PICK your starting weapon
from unlocked items — every class already starts armed by default; see 04-classes.)

## Discoverable NPCs

Rescue events are mid-run encounters (caged/stuck NPC guarded by a script burst;
freeing them completes the event):

| NPC | Where | Town service after rescue |
|-----|-------|---------------------------|
| Beekeeper Bumble | Act 1, waves 6–9 chance | Beekeeper class purchase; honey heals stock (run-start consumable) |
| Gravekeeper Mortimer | Act 2, waves 13–19 chance | Necromancer class purchase; graveyard lore codex section |
| Chef Basil | Act 3, waves 23–29 chance | Chef class purchase; picnic buff (first wave +regen) |
| Madame Wobble | Act 4, waves 33–39 chance | Oracle class purchase; peek tomorrow's shop rotation |

## The keystone ceremony

Entering town holding a new Emberkey: short non-interactive animation (skippable) —
the key floats to its Beacon Pillar, the pillar ignites in act colors, town brightens
one notch (town scene has 5 lighting states: 0–4 keys + post-win Everflame blaze).

## Save slots & profile

- A save slot = one town + unlock state + run history + profile. (Terminology:
  "save slot" everywhere — there is no account. The couch shares a slot's unlocks.)
- 3+ slots, export/import as JSON file (versioned, forward-migratable).
- Deed/unlock progress tracked per slot (e.g. "burn kills: 73/100" visible in codex).
- Run history is capped (50 runs + pinned favorites) and lives in IndexedDB; unlocks
  and settings live in localStorage, all keys namespaced by the branding slug.
- **Domain-move caveat**: browser saves are per-origin. A future move to a custom
  domain requires export/import — the release notes must prompt users to export first.
