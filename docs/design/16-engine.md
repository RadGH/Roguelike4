# Engine: Determinism, Performance, Art Pipeline, Debug Harness

The architectural decisions that cannot be retrofitted. These exist because both
predecessors paid for their absence.

## One combat core (the prime directive)

There is exactly ONE implementation of game rules — `src/game/core/` — pure TypeScript,
no PixiJS, no DOM, no React. The live game, the simulator, and the unit tests all call
this same code. Nothing ever reimplements a formula "for testing." (The predecessor
had four divergent combat implementations and its own audit called the result
critical.)

## Determinism

- **Fixed simulation tick: 30 Hz** (accumulator loop; rendering interpolates between
  ticks at display refresh). All gameplay math happens on ticks. Render dt never
  touches game state.
- **Named seeded RNG streams** (mulberry32): `rng.combat`, `rng.drops`, `rng.waves`,
  `rng.variants`, `rng.cosmetic`. A run seed derives all stream seeds. Cosmetic
  effects (particles) use `rng.cosmetic` so visual flair never perturbs gameplay rolls.
- No gameplay reads of wall-clock time, `Math.random`, or float-unsafe reductions.
- Inputs are sampled per tick into a compact input frame per player. A run =
  (seed, data version, input frames) → identical outcome. This is what makes sim
  parity, human-trace replay, and future netcode possible.
- Replay hooks: the game can record input frames per run (small); debug mode can play
  them back.

## Performance budget

Target: 60 fps render / 30 Hz sim on a mid-range laptop and a TV browser, with
**300 enemies + 4 players + heavy effects**.

Mandatory disciplines (all predecessor scars):
- Pools for enemies, projectiles, damage numbers, particles, pickups. No per-frame
  allocation in the hot path; no `add`/`destroy` churn.
- Dead entities leave their arrays immediately (swap-remove).
- HUD/React UI updates are event-driven and throttled (meters at 4 Hz); no per-frame
  React renders during gameplay.
- Spatial hash grid for collisions (never O(n·m) brute force).
- Perf test in CI: scripted 300-enemy stress scene must hold frame budget headroom.
- Tracker overhead < 5% of tick time at full load (preallocated ring buffer,
  incremental aggregation).

## SVG → texture pipeline

- Source of truth: SVG files in `art/` (authored by Claude, whimsical & colorful,
  consistent palette tokens).
- Build step rasterizes SVGs into texture atlases at **2 fixed scales** (1× reference
  and 2× for zoomed-in), mipmaps enabled. Gameplay camera zoom is CLAMPED to the range
  the raster budget supports — the zoom clamp in `02-coop-controls.md` is this number.
- Entity "squish" locomotion = scale transforms on the sprite (cheap, charming).
- Item icons rasterize at inventory size; the website uses the SVGs directly (crisp).
- Palette/presentation tokens live in ONE token file shared by game UI, arena art, and
  website (predecessor had four divergent color tables).

## Debug harness (built BEFORE content, used by my own Playwright testing)

- `?debug=1` enables: debug quick start screen (class/level/act/item grants), the
  in-run sim button, invincibility/gold/level cheats, spawn-enemy console.
- `window.__debug` exposes: game state snapshot getter, current scene/screen name,
  deterministic-step function (advance N ticks), input injection, error ring buffer
  (500 entries, captures window.onerror + unhandledrejection, scene-tagged).
- Playwright drives the game through `window.__debug` for gameplay E2E (input
  injection + tick stepping = deterministic tests, no flaky timing).
- Debug UI/code is tree-shaken out of release builds except the error ring buffer
  (kept for user bug reports via settings "copy error log").

## Two build targets

- **Game+site** (shipped): no devtool pages, no debug screens (flag-gated).
- **Dev** (local only): devtools, data browsers, sim dashboards. Never deployed.
  (The predecessor shipped ~55 devtool pages to production, some broken.)
