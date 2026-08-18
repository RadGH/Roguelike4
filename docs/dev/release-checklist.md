# Release checklist

Status as of v0.2.0 — all design-doc systems are built. What separates today's
build from a public release:

## Blocked on the user (flagged repeatedly, not forgotten)

- [ ] **GitHub Pages deploy.** The repo token lacks `workflow`/admin scope, so the
  parked workflow (`docs/dev/pending-deploy-workflow.yml`) can't be pushed and Pages
  can't be enabled via API. Either:
  - Option A: add `~/.ssh/roguelike4_deploy_key.pub` as a write deploy key + enable
    Pages (Settings → Pages → deploy from branch or actions), or
  - Option B: reissue `ROGUELIKE4_GITHUB_TOKEN` with `workflow` + admin:pages scope.
- [ ] **Human playtest.** Every balance number was calibrated against bot pilots
  (design 13's honesty clause). Known bot-vs-human gaps, in the order they'll matter:
  - Lone-melee classes (Tycoon, Chef, Paladin, and to a degree Engineer/Bard) sweep
    under the depth bar because bots can't poke-and-retreat like a human.
  - Fresh act-2+ Bellhop restarts stall for bots (~60%); a human with Mayor upgrades
    and better play likely clears. Revisit `waves.hpGrowthPerWave` if humans stall too.
  - Couch co-op needs a real 2-4 pad test on the actual couch (E2E pads are emulated).

## Pre-release polish that can happen anytime

- [ ] Code-split the bundle (index chunk is 780 kB min / 228 kB gzip — fine for
  Pages, but a `manualChunks` split of PixiJS would drop first-paint).
- [ ] The boons-vs-feats interpretation question in design 06 (flagged for the user;
  current build implements both: boons every level, feats every 3rd).
- [ ] Rename pass: pick the real title, update `data/branding.json` (title/saveSlug),
  regenerate the manual, republish. Nothing else in the codebase names the game.

## Verified green (2026-08-18)

- 180 unit tests, 78 E2E tests (desktop / quarter-screen / mobile viewports), lint clean.
- `npm run build` produces a working dist with game + manual + guide (both HTTP 200
  under `vite preview`).
- Determinism: same seed + same inputs → same state hash (sim.test.ts).
- Reference-title privacy: grep-audited before every push; repo is public-safe.
