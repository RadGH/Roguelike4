# Vision & Pillars

> Internal design doc. The game's display title lives in ONE place:
> `data/branding.json` (code reads it via a typed accessor — the string itself exists
> nowhere else). Docs refer to it as "the game" where possible.

## What the game is

A **couch co-op, wave-based arena roguelite** for 1–4 players on one shared screen.
Players pick a class, fight escalating waves of whimsical monsters across four acts,
collect loot mid-wave, make build decisions between waves, and either die gloriously
or ring the victory bell at wave 40. Runs feed a persistent town hub where permanent
unlocks (classes, items, perks, town upgrades) accumulate across runs.

Twin-stick controls: move with one stick, aim with the other; equipped weapons fire
automatically on their own cooldowns in the aimed direction (nearest-enemy auto-aim
when not aiming). Keyboard + mouse fully supported for player 1.

## Pillars

1. **Co-op native.** One camera zooms to fit all players. Loot is dealt round-robin;
   gold is mirrored to every player. Every per-player screen works at quarter-screen size.
2. **Builds are the game.** Classes are frameworks; items, perks, and feats combine into
   absurd, discoverable machines. Every "dream build" in `05-items.md` ("Build-enabler
   map" section) must be reachable and fun.
3. **Everything is data.** Classes, items, perks, enemies, waves, unlocks, lore text —
   all JSON with strict schemas. Adding content or modding never requires engine changes.
4. **Track everything.** Every point of damage, healing, and mitigation is an attributed
   event: which player, which item, which perk on that item, which target. Summary →
   drill-down UI in-game; same event stream powers the simulator and the website.
5. **Unlocks everywhere.** Most content starts locked behind gameplay feats ("kill an
   enemy with fire damage"). The codex shows what's unlocked, what isn't, and hints.
6. **Whimsical & colorful.** Bright, saturated, cute. Danger is real but the darkness
   is cartoonish. Serious mechanics, silly world.

## Scope (first release)

- 24 playable classes (4 core + 20 unlockable)
- 200+ items (weapons, shields, passives, uniques, evil items) with quality tiers and
  corrupted/cursed/relic/holographic variants
- 60+ boons, 40+ feats (level-up perk items)
- 30+ enemy types, 4 acts, 4 minibosses, 4 multi-phase bosses, elites, possessed chests
- Town hub with NPCs, shops, keystone progression, endless mode
- Full combat tracking with drill-down meters; headless simulation mode
- In-game codex; public website manual generated from the live game data
- Local saves (multiple slots) + export/import

## Tech

- Vite + React + TypeScript; PixiJS (WebGL) renders the arena; React renders all menus/screens
- Fixed-tick deterministic simulation with seeded RNG streams (`16-engine.md`) —
  this is what makes sim parity, replay, and future netcode possible
- SVG art (authored in-repo, rasterized to texture atlases at fixed scales — pipeline
  in `16-engine.md`); "squish" locomotion animation
- Procedural Web Audio for SFX; music is staged (simple generative loops first,
  real composition later — see `17-milestones.md`)
- Touch gameplay for solo mobile: floating dual-stick scheme specced in `02-coop-controls.md`
- Gamepad API (4 pads) + keyboard/mouse; hot-join
- GitHub Pages hosting; no backend. Online co-op is out of scope for v1 but the
  game loop keeps deterministic, input-driven state transitions so netcode can be added later.
- UI components sync to Claude Design for design iteration (`.design-sync/`)

Build order is explicitly staged in `17-milestones.md` — anything that slips a
milestone is visibly re-staged there, never silently dropped.

## Non-goals (v1)

- Online multiplayer, accounts, cloud saves
- Level/dungeon exploration — combat happens in themed arenas
- Localization (structure strings for it, ship English)
