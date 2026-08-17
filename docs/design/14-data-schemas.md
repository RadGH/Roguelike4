# Data Schemas & Modding

Everything the game knows is JSON under `data/`, validated by Zod schemas in
`src/game/data/schemas/` (single source of truth; JSON Schema files are exported
from Zod for editor autocomplete and modders).

## Directory map

```
data/
  balance.json          # global curves, caps, co-op scaling, variant odds
  branding.json         # THE game title + tagline (rename = edit here)
  classes/*.json        # one file per class
  items/
    weapons.json  shields.json  passives.json  uniques.json  evil.json
  affixes.json
  boons.json
  feats.json
  enemies/
    act1.json ... act4.json  elites.json  minibosses.json  bosses.json  mimic.json
  waves/act1.json ... act4.json  endless.json
  deeds.json            # unlock requirements
  shops.json            # town shop inventories & prices
  town-upgrades.json
  npcs.json             # town + discoverable NPCs, dialogue keys
  lore/*.json           # world text, flavor, codex lore pages
  sim-profiles.json     # simulation encounter distributions
  strings/en.json       # ALL player-facing strings (localization-ready)
```

## Schema principles

- **Stable slugs** (`id`) everywhere; renames are display-only (`name` in strings).
- **No behavior in data** — data references engine capabilities by name (delivery
  types, trigger events, effect kinds); the engine documents the full vocabulary in
  `docs/dev/engine-vocabulary.md`. Unknown names fail validation loudly at load.
- **Versioned:** every file carries `schemaVersion`; loaders migrate old versions
  (needed for save-file forward-compat too).
- **Additive-friendly:** arrays of entities, no cross-file positional coupling;
  content packs can be concatenated (mod support = load extra JSON files that pass
  the same validation, from a local folder or pasted text).
- **Balance-sweepable:** all tunables in `balance.json` or entity-local numbers;
  the sim can override any numeric leaf via patch files for tuning experiments.
- **Strings:** entity JSON stores string KEYS (`item.fireball.name`); display text and
  flavor live in `strings/en.json`. Nothing player-facing is inline in entity data.

## Balance hygiene (policy, from predecessor scar tissue)

- Every tunable change records a `note` (why) next to the value.
- Balance snapshots are archived per milestone for A/B diffing; sweep results are
  never aggregated across versions.
- Tune per-entity curves, not global multipliers — a global knob that has been
  changed three times is a design smell, not a fix.

## Mod support (v1: quiet but real)

- Load order: base data → enabled content packs (JSON) → validation → registry.
- A content pack can add classes/items/enemies/waves/boons/feats/deeds and override
  balance patches. No script execution — data only, referencing engine vocabulary.
- Settings → "Content packs" screen: add/enable/disable, with validation errors
  shown plainly. Website documents the schemas for modders (generated from Zod).
