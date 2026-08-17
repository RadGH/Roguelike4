# Project structure (internal dev docs)

Design docs (what the game IS): `docs/design/00-17`. This file: how the code is laid out.

```
data/               game content as JSON (branding, balance, entities — grows in M1)
art/                SVG sources (rasterized to textures at load/build)
src/
  main.tsx          React entry; sets document.title from branding
  ui/               ALL menus/screens (React). App.tsx = screen router
  game/
    branding.ts     typed accessor over data/branding.json (title lives ONLY there)
    core/           THE game rules — pure TS, no pixi/react/browser. The live game,
                    the simulator, and the tests all call this same code.
      sim.ts        fixed-tick simulation (30 Hz)
      rng.ts        seeded mulberry32 streams (combat/drops/waves/variants/cosmetic)
      input.ts      InputFrame — serializable per-tick player intent
      spatial.ts    spatial hash for broad-phase queries
      constants.ts  structural constants (balance numbers move to data/balance.json)
    shell/          browser glue: Engine (accumulator loop), renderer (PixiJS),
                    inputSources (KB/M + gamepads → InputFrames)
    debug/          harness: ?debug=1 → window.__debug (pause/step/setInput/snapshot),
                    error ring buffer always on
e2e/                Playwright tests — drive gameplay via window.__debug (deterministic)
scripts/            node tooling (sim runner, data validation — M1+)
docs/design/        the game design (source of truth for behavior)
docs/dev/           this dir — internal how-it-works docs
```

## Rules that keep the codebase healthy

- `src/game/core/` imports NOTHING from shell/ui/pixi. Enforced by review; a lint
  boundary rule lands with M1.
- Content is data; the engine exposes named capabilities. Unknown names = loud load
  failure. No data lands without a live consumer.
- The display title exists only in `data/branding.json` — never in code or docs prose.
- Tests: `npm test` (unit), `npm run test:e2e` (Playwright: desktop / quarter-screen /
  mobile projects). E2E uses `?debug=1` + `__debug.step()` — no flaky timing.
- Dev server: `npx vite --host` (LAN). Deploys: parked until token scopes fixed —
  see `docs/dev/pending-deploy-workflow.yml`.
