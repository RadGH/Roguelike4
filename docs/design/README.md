# Design docs

The foundation for the game. Read in order for the full picture; each doc stands
alone for its system. Bracketed [DECISION]/[INTERPRETATION] notes mark judgment
calls made during design that the user hasn't explicitly confirmed.

Revision 2 (2026-08-17): all 16 docs revised after an adversarial design review
(56 findings — starting loadouts, day-one unlock audit, shield/off-hand model,
rarity mechanics, determinism spec, staged milestones, and ~40 more fixes).

| Doc | Covers |
|-----|--------|
| [00-vision.md](00-vision.md) | Pillars, scope, tech stack, non-goals |
| [01-world.md](01-world.md) | Lore, acts, town, NPCs, naming glossary |
| [02-coop-controls.md](02-coop-controls.md) | Co-op rules, input, camera, responsive layout contract |
| [03-combat.md](03-combat.md) | Damage types, stats, defense math, statuses, combos |
| [04-classes.md](04-classes.md) | All 24 launch classes + unlocks |
| [05-items.md](05-items.md) | Item anatomy, quality, variants, affixes, anchor items, evil items, dream builds |
| [06-boons-feats.md](06-boons-feats.md) | Level-up rewards (per-level boons, every-3rd-level feats) |
| [07-enemies.md](07-enemies.md) | Archetypes, act rosters, elites, minibosses, bosses, mimics |
| [08-waves-acts.md](08-waves-acts.md) | Run structure, wave scripting, difficulty, endless |
| [09-economy-meta.md](09-economy-meta.md) | Currencies, shops, town upgrades, NPC rescues, saves |
| [10-unlocks-codex.md](10-unlocks-codex.md) | Deed engine, codex screen |
| [11-screens.md](11-screens.md) | Every screen: contents, actions, responsive rules |
| [12-tracking.md](12-tracking.md) | Combat tracking event model, meters |
| [13-simulation.md](13-simulation.md) | Headless run simulator, balance gates |
| [14-data-schemas.md](14-data-schemas.md) | JSON layout, validation, modding |
| [15-website.md](15-website.md) | The site manual generated from game data |
| [16-engine.md](16-engine.md) | One combat core, determinism, perf budgets, art pipeline, debug harness |
| [17-milestones.md](17-milestones.md) | Build order — visible staging, no silent shelving |
