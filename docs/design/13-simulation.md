# Simulation Mode

A headless run emulator for testing and balancing: plays out an entire run —
choices, drops, rewards, combat outcomes — with NO physics, rendering, or input,
producing realistic statistics fast (target: a full 40-wave run simulated in <2s;
thousands of runs batched for balance sweeps).

## How it works

- **Same data, same math.** The sim imports the real combat formulas, item/boon/feat
  definitions, drop tables, wave scripts, and the real combat tracker. What it
  replaces is the spatial layer.
- **Spatial abstraction:** instead of positions, each enemy/player pair gets sampled
  engagement states (in-melee / at-range / safe) from per-archetype encounter
  distributions (a Charger reaches melee more often than a Shooter; player mobility
  stat shifts the distribution). Attack uptimes, AoE overlap counts (how many enemies
  a Meteor typically clips at a given density), and hit/dodge rolls come from these
  distributions. Distributions live in `data/sim-profiles.json` and are calibrated
  against instrumented REAL play sessions (the tracker makes real and simulated runs
  directly comparable — same event stream, same meters).
- **Decision policies:** pluggable per-player bots choose rewards/boons/feats/tinkering:
  `random`, `greedy-dps`, `survival-first`, `build-script` (follows a target build,
  e.g. the frostfire dream build — used to verify reachability), `human-trace`
  (replay choices from a recorded real run).
- **Determinism:** every sim takes a seed; same seed + same data = same result.
  Divergence between versions is itself a balance-diff signal.

## Outputs

- Per-run: victory/death wave, timeline of levels/items, final build, full tracker
  aggregate tree (drillable with the SAME meter UI in a dev screen).
- Batch: clear-rate per class/act, damage distribution by item across the pool,
  time-to-kill curves, boon/feat pick equity (is anything never worth picking?),
  economy curves (gold/Bits/Glimmers per run).

## Uses (gates in CI)

- Class guardrails: every class ≥60% Act 1 solo clear (novelty ≥40%) at launch tuning.
- Dream-build reachability: build-script bots must assemble each dream build by wave
  20 in ≥50% of seeded attempts.
- Regression: balance-affecting PRs run a 500-run sweep; deltas beyond thresholds
  flag for review.
- In-game surface (dev/curiosity screen at Chronicler Soot, hidden behind a toggle):
  "Simulate this build ×100" for the player's current character.
