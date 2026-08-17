# Milestones — the build order

The full scope of these docs IS the commitment. This staging exists so progress is
visible and slippage is explicit (re-staged here in a commit, never silently dropped).
Each milestone ends: tests green, deployed to Pages, checklist + docs updated.

## M0 — Skeleton (repo, CI, deploy, debug harness)
Vite/React/TS/PixiJS scaffold; fixed-tick loop + seeded RNG streams; pools + spatial
hash; debug harness + Playwright driving it; GitHub Pages deploy pipeline; Claude
Design link. **Exit: a moving, dashing character in an arena at 60fps, E2E-tested.**

## M1 — Combat vertical slice
One combat core: stats, damage pipeline, statuses, crits; tracker event stream (log +
meter from one stream); Hero + starting gear; 6 Act-1 enemy types with archetype AIs;
wave scripting; drops (gold/XP/chests); recap → rewards (equip/satchel/salvage + diff
tooltip) → boon screen; solo run of Act 1 waves 1–10 incl. miniboss + Mopsy boss.
**Exit: a fun, complete solo Act 1 run, meters drillable, deterministic replay works.**

## M2 — Co-op
2–4 players, gamepads, hot-join, camera fit + edge-slowdown leash, per-player panels
at couch minimums, round-robin loot + mirrored gold, revives, personal screens 1–4P.
**Exit: 4-pad Act 1 run via Playwright gamepad emulation + manual couch test.**

## M3 — Meta loop
Town scene + NPC screens, save slots (localStorage+IndexedDB, export/import), Glimmers
/shops/town upgrades, deed engine + day-one audit in CI, codex, keystone ceremony,
acts 2–4 arenas/enemies/bosses, endless mode, Emberkey flow.
**Exit: full story loop playable start→win→endless on deployed build.**

## M4 — Content at scale
24 classes + mechanics; 200+ items (all wired, monotonicity-tested); 80+ affixes; 60+
boons; 40+ feats; 30+ enemies + stirred variants; evil items; dream-build enablers;
NPC rescues; all SVG art + procedural SFX; simple generative music loops.
**Exit: content targets hit; sim smoke gates pass; every dream build assembled in sim.**

## M5 — Simulation & balance
Headless sim (same core), decision policies, batch sweeps, economy curves; balance
pass across classes/acts; calibration v0 (my own instrumented sessions); unit tests
for math/drops/deeds.
**Exit: class clear-rate guardrails met in sim; balance snapshot archived.**

## M6 — Website & polish
Website manual from live data (classes/items/enemies/deeds DBs, spoiler-marked),
player guide (spoiler-free, plain language), modding docs + content-pack loader UI,
accessibility pass (ARIA, Cozy Mode), full Playwright matrix (desktop/TV-quarter/
mobile), perf stress gate, real music pass, release notes.
**Exit: v1.0 deployed; user notified to playtest.**

## Post-1.0 candidates (explicitly NOT in v1)
Online co-op (Supabase), cloud saves, daily challenge (date-seeded), boss rush,
ElevenLabs audio swap, more acts/classes.
