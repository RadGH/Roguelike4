# Architecture

How this codebase is put together, for whoever works on it next (including future
sessions of the agent that built it).

## The one rule that shapes everything

**The simulation is pure and deterministic.** `src/sim/` never touches rendering, real
time, storage, `Math.random()`, or trig functions with engine-defined results
(`sin`/`cos`/`atan2`). A run is exactly reproducible from its seed. This is enforced by
an ESLint restricted-import rule and is what makes the headless balance simulator the
same code as the live game.

## Layers

| Layer | Path | Role |
|---|---|---|
| Content | `src/content/*.json` | Everything the game contains: enemies, waves, weapons, items, slot items, pets, perks, classes, unlocks. Data only; adding content means adding JSON. |
| Registry | `src/sim/data/` | Types + loader. One `loadContent()` call, one source of truth — shared by the game, the simulator, and the manual page. |
| Simulation | `src/sim/core/`, `src/sim/systems/` | Fixed 30-tick arena sim: `Sim` (entities, combat, pets, hazards), damage pipeline, stat recompute, attribution tracker. |
| Run control | `src/sim/run/` | `Run`: phases (arena → recap → intermission → next wave), drafts, grants, rewards, shop, saves. Headless-capable. |
| Meta | `src/sim/meta/` | Profile/unlock engine (pure), policy players, batch simulator. |
| Rendering | `src/render/`, `src/app/Arena.tsx` | PixiJS isometric view. Reads sim state, writes nothing. Sprite pool over SVG textures from `art/critical/`. |
| UI | `src/app/` | React screens: title, class select, intermission panels, pause, codex, persistence glue (localStorage lives here, never in the sim). |
| Site | `src/site/`, `manual.html` | The companion manual, rendered from the same registries. |

## Key mechanics and where they live

- **Stat recompute** (`systems/stats.ts`): player stats are always rebuilt from scratch
  (base → class → items → perks → weapons) — nothing increments in place, so nothing
  drifts. Call `recomputePlayer` after any build change.
- **Damage** (`systems/damage.ts`): dodge (attacks only) → block → diminishing armor →
  flat reduction → percent resist; Void skips resist; lifesteal is universal.
- **Attribution** (`systems/tracker.ts`): every point of damage dealt/taken is recorded
  with its source id. Aggregates are incremental and savable; raw events are capped and
  session-only. This powers recaps, the pause menu, run summaries, and history.
- **Enemy behavior** (`core/sim.ts` `behave()`): archetype state machines (charge, dive,
  burrow, spawn, web, slam). Elite modifiers scale at spawn.
- **Telegraphs**: floor-plane zones; window length ∝ payload (light/heavy/extreme).
- **Pets**: rebuilt from carried summon items at every wave start — no pet state in saves.
- **Determinism helpers**: `core/rng.ts` (seeded, fork per system), `core/hash.ts`
  (state hash for tests), `core/math.ts` (trig-free vectors).

## Achievements vs unlocks (design decision, 2026-08-30)

Both watch the same behavioral conditions, but they are different things:

- **Unlocks** gate content and are the entire meta progression. Conditions visible
  before they are met; rewards are always sidegrades.
- **Achievements** (not yet built) are pure record-keeping — badges with no rewards, so
  they can be numerous and silly-hard without distorting balance. When built, they should
  reuse the `Profile` counters and the condition types in `meta/unlocks.ts`, adding only
  a separate definition list with `rewards: []` semantics.

## Tooling

- `npm run dev` — LAN dev server · `npm test` — Vitest · `npm run e2e` — Playwright
- `npm run simulate -- --runs 40 --players 1 --skill 0.6 --class student` — batch balance
- `npm run stress` — worst-case sim benchmark (fails if a tick exceeds 4ms)
- `node scripts/screenshot-live.mjs out.png` — capture a live-play still for art review
- Readability debug views in the arena: F1 normal, F2 markers-only, F3 silhouette
