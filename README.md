# Untitled Roguelike

A co-op action roguelite for the web. 1–4 players on one couch, one shared camera,
two buttons, weapons that fire themselves — your whole job is where you stand.

**Status: early development.** The previous prototype in this repo was retired; this is a
ground-up rebuild.

## Development

```bash
npm install
npm run dev        # dev server on 0.0.0.0:5173
npm test           # unit tests (Vitest)
npm run e2e        # browser tests (Playwright)
npm run build      # production build
```

## Architecture

- `src/sim/` — the deterministic game simulation. Pure TypeScript, no rendering, no real
  time, no `Math.random()`. Fixed 30-tick timestep, seeded RNG. The same code runs the
  live game and the headless balance simulator.
- `src/render/` — PixiJS isometric renderer. Reads sim state, writes nothing.
- `src/app/` — React shell and menu screens.
- `src/content/` — all game content as JSON (enemies, weapons, items, waves, classes).
  Content is data; adding content means adding JSON, not code.
- `art/` — SVG artwork. `critical/` follows the primitive-shape readability rules;
  `decor/` is decorative detail.

## Design rules that bind this codebase

- **Two-layer art rule:** anything the player must react to is drawn as bold primitive
  shapes with flat color, permanently. Detailed art lives only in the decorative layer.
- **Two-button budget:** A (equipment) and B (movement item). No feature may add a button.
- **Determinism:** a run is exactly reproducible from its seed.
- **Whole numbers:** every stat shown to the player is an integer.
