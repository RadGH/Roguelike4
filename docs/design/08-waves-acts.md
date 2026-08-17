# Waves, Acts, Runs & Endless

## Run structure

- A **run** = party setup in town → arena → waves N..M → victory (act complete /
  wave 40) or party snuffed. Either way: recap → town. Characters are per-run
  (retire to the Hall of Embers when the run ends).
- Runs start at Act 1 wave 1 by default; unlocked acts allow starting later
  ("relit beacons let the Bellhop drop you further along") with level-appropriate
  starter package [DECISION: act-start packages = level boost + gold + choice
  chests, tuned by sim, so late starts aren't suicide].
- Story mode: complete acts 1→4 across multiple runs. First-time act completion
  drops that act's Emberkey and ends the run **successfully** (player may instead
  press on to the next act in the same run once it's unlocked — the Emberkey run-end
  applies only when the next act is still locked).

## Wave scripting

A wave is a **spawn script**: an ordered list of entries
`{ atSecond | afterPrevCleared, enemyId, count, pattern (ring|edge|trickle|burst), spacing }`.
Example shape: swarm of Snufflings at t=0, ranged Thistle Archers at t=15, mixed
burst at t=30. Waves end when the script is exhausted AND all enemies are dead.
No wave timer — pace is the player's, pressure is the script's.

- Wave 5 & 8 of each act: elite-heavy scripts. Final act wave (10/20/30/40): boss.
- Miniboss appears mid-act (wave 4/14/24/34) and via Evil Eye items.
- Chest drops, gold/XP economy per wave are part of the script's loot budget.
- Scripts live in `data/waves/act1.json` etc. — fully tunable without code.

## Difficulty knobs

- Global curve: enemy HP/damage/count scale per wave index + party size multiplier
  (co-op scaling: +70% spawns per extra player, +15% elite chance).
- "Stirred" pools: after an act is completed once, its enemy pool permanently gains
  harder variants (marked in codex). Story difficulty therefore rises run over run.
- Evil items stack per copy, party-wide.

## Endless mode

- Unlocks after the first Act 4 clear (the WIN), but only for NEW runs.
- Endless runs go past wave 40 as if an Act 5 existed (there isn't — the game
  invents escalating remix waves: all-act enemy pools, stacked elite modifiers,
  +8% enemy stats per wave compounding, extra simultaneous scripts past wave 50).
- Glimmers do NOT drop in endless (no town-farming incentive) — endless is for
  glory: deepest wave reached is recorded per class and party size in run history.
- Death is the only exit; recap celebrates the final wave count.

## Failure & retirement

- Party snuffed → recap (with meter drill-down) → town. Gems/unlocks earned during
  the run are kept; gold and Bits are lost with the character (run-only).
- Run history stores the full recap + build snapshot of every retired character.
