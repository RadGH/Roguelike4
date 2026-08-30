# Build notes

Running notes from the build, for Radley to review. Two kinds of entries: **progress log**
(what got built, when) and **design feedback** (things the vault leaves open, contradicts
itself on, or that played out differently in practice — meant to be folded back into the
planning docs for the next version).

The design vault is the authority for every decision it makes. Where it's silent I make a
call, log it here under *Calls I made*, and keep it easy to reverse.

---

## Design feedback on the vault (found while reading, 2026-08-30)

1. **The unlock ladder names a class that doesn't exist.** Class Catalog says completing a
   Student run unlocks "Fighter, Rogue, and Mage together" — but the 36-class roster has no
   Mage. Presumably Mage was renamed or absorbed. Plan: author a plain Mage (Magic-affinity
   baseline caster, the magic-side mirror of Fighter) so the trio covers melee/agility/magic.
   Flag for the vault: either add Mage to the roster or change the trio.

2. **The perk roster is empty but perks carry the run.** Perk Catalog defines the rules well
   (attributes only, rolled tiers) yet has zero entries, while drafts are "the most frequent
   meaningful decision." I'll author an initial roster (~20–30 attribute perks) from the
   Damage and Defense attribute list. Worth writing the real roster into the vault next pass.

3. **Act 1's wave table was never authored** even though Documentation Status ranks it the
   #1 resume item. I'll author it from the Enemy Catalog's intro schedule (each enemy's
   "Intro" wave) plus the 1–7 teach / 8–9 crescendo / 10 boss shape. It'll live in JSON in
   the repo; the vault should eventually get the human-readable version.

4. **No numbers anywhere.** Every stat in the vault is a placeholder. I'll author a
   baseline-numbers doc (player HP, enemy stats, XP/gold curves, tier multipliers, shop
   prices) early, keep it in `docs/dev/numbers.md`, and let Simulation Mode iterate on it.
   These numbers are mine, not the vault's — treat them as proposals.

5. **Corrupt vs Cursed overlap** — the vault flags it and suggests a resolution (Corrupt =
   power paid in survivability specifically; Cursed = arbitrary two-property trade). I'll
   implement the suggested split as written since it's the vault's own recommendation.

6. **Three colour languages compete for one palette**: enemy archetypes (arena), item tiers
   (menus), stat deviation (menus). The vault half-resolves this (menu colours never appear
   in the arena). I'll enforce it structurally: the arena palette and the menu palette are
   two disjoint constant sets in code, so a collision is impossible rather than avoided.

7. **Solo downed handling is still open.** Vault options: self-revive on long cooldown, one
   recovery per run, or accept harsher solo. My plan: solo down = run over (harsh), but
   Second Wind exists as the findable answer, and the death screen tells you Second Wind
   would have saved you — makes the item legible and pursuable. Cheap to change later.

8. **Weapons-are-shop-only + Interest item** makes the first shop critical: a player who
   skips wave 1's shop fights wave 2 with their starting weapon only. That's probably fine
   (starting weapons exist) but wave 1–2 gold income needs tuning so the first real purchase
   lands by wave 2–3. Sim mode should watch "waves until first weapon purchase."

9. **Flyers vs "hazards are floor-plane only"** — small tension: Flitter ignores ground
   hazards, so player-made ground zones can't touch it. That's presumably intended (it's the
   Flitter's whole point) but it means `Area` ground builds have a hard counter in wave 4+.
   Worth one sentence in the vault confirming it's deliberate.

10. **King Slime tier-4 stall.** The boss note asks whether a hard timer is needed for
    builds that can't clear 27 small slimes. Plan: no enrage; instead tier-4 slimes slowly
    self-degrade (lose HP over time) so the fight always ends — pressure without a wall.
    Logged as a call I made; vault should confirm or replace.

## Calls I made (build decisions the vault leaves open)

- **Tech stack:** Vite + TypeScript + PixiJS (WebGL) for the arena, React for screens,
  JSON content data, Vitest + Playwright, localStorage saves with export/import. The sim
  core is a pure TypeScript module with no renderer imports, so Simulation Mode is the same
  code run headless — satisfying the "reads the same data as the game" requirement for free.
- **Mouse/keyboard mapping** (Control Budget open question): WASD/arrows move, A = left
  click or Space, B = right click or Shift. Pause = Esc/Start, outside the A/B budget.
- **Unlocks are global to the installation** (per-device), matching the shared-couch
  argument in the vault. Export/import moves them between devices.
- **Repo/publishing:** the planning vault (`new/`) and `references/` are gitignored — the
  repo is public and those folders name third-party games. The game itself contains no
  third-party titles anywhere.

## Progress log

### 2026-08-30 — Session 1: reset + foundation
- Read the entire vault (all design notes, catalogs, decision records, meta notes).
- Scrapped the previous iteration: repo reduced to `docs/` (old design docs, reference
  only), `new/roguelike5/` (vault, private), `references/` (private). Commit 47cbc05.
- Rewrote agent memory, this notes file, and the milestone checklist
  (`~/claude/agent/roguelike-checklist.md`).
- Scaffolded Vite + React + TS + PixiJS + Vitest + Playwright.
- Built the M0 foundation (commit 009dc4f, pushed): deterministic 30-tick sim core with
  seeded fork-able RNG and state hashing (same seed = identical run, proven by tests);
  tag vocabulary + content registry + first JSON content (5 act-1 enemies, 3 starter
  weapons, waves 1–3); autofire with targeting rules/hold-fire/stagger; flocking swarms;
  slime splitting; pickups with shared-and-multiplied gold; auto-collect at wave clear;
  density cap with deferred spawns; damage attribution tracker (v1).
- Isometric debug arena is playable in the browser: WASD/arrows or gamepad stick, waves
  1–3 loop, primitive-shape art per the two-layer rule. 14 unit + 2 E2E tests green.
- **Playable now at http://192.168.1.34:5173/** (dev server running on the VM).
- Second chunk (05d5dd4): full damage pipeline (dodge → block → diminishing armor → flat
  reduction → resist, Void unresistable, universal lifesteal), damage-taken tracking with
  mitigation attribution, telegraphed floor zones (severity = window ∝ payload; Spitters
  now lead your movement), discrete dodgeable contact damage, XP curve + level-ups banking
  drafts, weapons visibly hovering/rotating/lunging, HUD, readability debug views (F1–F3).
  27 unit + 2 E2E green.
- Third chunk (c7da9dd): the run loop exists. Title screen → run → wave → recap → level-up
  drafts (16 attribute perks, rolled tiers) → shop (buy/sell/reroll, wave-scaled prices)
  → next wave → victory/defeat with a damage-by-source run summary. Stats recompute from
  scratch on every build change so nothing drifts. 33 unit + 2 E2E green.
- Fourth chunk (dbce3b3): act 1 is content-complete. All 11 enemy types with real behavior
  machines (charging, diving, burrowing, spawning, webbing, death-bursts, retaliation),
  elite modifiers, ground hazard pools, the authored 10-wave table following the vault's
  curriculum, and King Slime splitting 1→3→9→27 while changing archetype per tier. Tests
  prove the boss chain resolves and the fight ends. 42 unit + 2 E2E green.
- Design note while authoring waves: the wave table lives in `src/content/acts/act1.json`
  and reads exactly like the vault's schema wants (composition, order, timing, elites) —
  worth copying back into the vault's Act Catalog as the reference example.
- Fifth chunk (3aca710): persistence. Saves are written at every wave clear (a closed tab
  costs at most one wave), the title screen offers continue/export/import, run history
  keeps the last 50 runs with each player's top damage sources, and buying with full
  weapon slots now opens a replace prompt with a half-price refund. The tracker was
  refactored to savable aggregates. 45 unit + 2 E2E green.
- Sixth chunk (8450d7e): co-op works. 1–4 players (P1 keyboard, pads in order), one shared
  camera that zooms out to frame everyone, downed/bleed-out/proximity-revive exactly per
  the vault (enemies ignore downed players; run ends only when nobody stands; the dead
  return at wave clear at half health), identity rings, and simultaneous quarter-screen
  intermission panels with a "waiting on P2" readout. 52 unit + 2 E2E green.
- Design call logged: solo down = immediate death (no pointless 15s wait with no possible
  rescuer). Second Wind stays the findable solo answer once items land in M5.
- Palette note for the vault: with players, pickups, telegraphs, tiers, and ten archetypes
  all claiming hues, the palette is exactly as crowded as Art Direction predicted. Player
  identity went to ring outlines rather than body hues to dodge collisions — worth
  recording as the chosen mechanism.
- Seventh chunk (8d3c04d): the meta layer is live. Five classes (Student/Fighter/Rogue/
  Mage/Sentinel — sidegrades only), the behavioral unlock engine (finish a Student run,
  win or lose, opens the trio — exactly the vault's ladder), content gating (locked
  weapons never stock shops, locked perks never draft), a codex with live progress on
  every condition, and a per-player class select screen. 59 unit + 2 E2E green.
- I authored a plain Mage to resolve the vault's missing-Mage inconsistency (feedback
  item 1) — Magic-affinity baseline caster, mirror of Fighter.
- Loadout screen note: per the vault a slot with no choice is skipped entirely; since no
  current class offers alternatives, the loadout screen correctly does not exist yet. It
  arrives when a class first offers two starting options.
- Eighth chunk (2c96d97): the balance simulator exists and immediately earned its keep.
  `npm run simulate -- --runs 40 --players 1 --skill 0.6` plays full headless runs and
  reports win rate, death-wave histogram, economy, and damage shares.
  **First findings, all acted on:**
  - Initial state: 0% win rate, with death cliffs at wave 7 (Delver/Brood Sac) and 9, and
    no healing anywhere between waves — a death spiral by design accident. Fix: survivors
    recover a third of max health at wave start (design call, worth vault confirmation).
  - Co-op was trivial (97% duo win) because spawn counts ignored player count. Fix: +50%
    spawns per extra player. Post-fix: solo 38% / duo 53% / 4P 90% at mid skill — co-op
    being easier is intended (the revive backstop), but 4P may still be too generous.
  - Runs were build-capped, not skill-capped: shops sold identical white weapons all run.
    Implemented the vault's weapon quality tiers (damage multipliers, better rolls in
    later shops, tier pricing) — deaths now spread across waves 7–9 instead of one wall.
  - **Honest caveat for the vault's Simulation Mode note:** the movement-policy skill knob
    does not yet monotonically improve outcomes (0.85 skill scored below 0.6 in one
    batch) — the policy is the dominant error term, exactly as the vault predicted. Treat
    absolute win rates as rough; the histograms and A/B deltas are the trustworthy part.
- Ninth chunk (a590156): first SVG art pass. I authored 14 SVGs for the gameplay-critical
  layer — the player, one body plan per enemy archetype with the reserved palette baked
  into the file, the crowned King Slime, and the pickups. They render through a pooled
  sprite layer with velocity-based facing, a black-tint silhouette debug view, and a
  primitive-shape fallback if loading ever fails. Screenshot-reviewed per the art doc's
  gate (scripts/screenshot-live.mjs) — fixed a real finding: the camera never zoomed in,
  so solo play failed the squint test; it now zooms to 1.8x when players are close.
- Tenth chunk (2931622): pause menu (Esc/Start — per-player weapons, perks, whole-number
  stats, live damage breakdown), soft intermission timer for multiplayer (35s grace,
  countdown, auto-resolve at 50s), and pad-disconnect auto-pause.
- Next: content breadth — the items system (passive items as drops, equipment/movement
  slots per the Control Budget), more classes, with sim checks per addition.
