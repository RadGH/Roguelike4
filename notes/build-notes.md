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
- Eleventh chunk (9fc3203): the items system. Chest drops capped at 2/wave per the
  drop-discipline rule, items unveiled at a rewards screen and dealt round-robin, keep-or-
  sell as a mandatory decision, 14 passives including triggered effects (kill-explosions,
  pickup-zaps) with damage attributed to the item — so "41% of your damage came from
  Killing Blow" already works in the pause menu.
- Twelfth chunk (e011e51): the Control Budget is real. A = equipment (Repulse, Maelstrom,
  Ground Slam, Lesser Heal), B = movement (Dash, Blink — no i-frames), slots are exclusive
  content that classes start with, chests drop, and saves keep. Rogue/Mage/Sentinel now
  have their identity items. Mid-skill solo win rate is ~47% with the policy spending
  both buttons — right in the band I was aiming for.
- Thirteenth chunk (d11d0ed): content tranche. 4 weapons (incl. Magic-damage-in-melee and
  a 3-pellet shotgun), 4 classes (Priest/Marksman/Looter/Vampire — the Vampire's 1 dmg/s
  clock and the Looter's health-per-item both work as vault-specced), 8 items, shop stock
  widened to 4 and build-weighted by tag overlap.
- **Balance finding worth keeping:** adding situational weapons diluted the shop enough to
  crater the no-affinity Student's full-pool win rate (43%→20% in A/B). Real play gates
  the pool behind unlocks and affinity classes make those weapons good, so this is a
  watch item, not a crisis — but it confirms the vault's warning that every pool addition
  is a balance event. The simulator's A/B mode made this visible in minutes.
- Fourteenth chunk (adf696d): pets and structures, the last big v1 system. The mortality
  split works as the vault argues it should — wolves body-block and die to incidental
  contact then respawn in 8s, while turrets and ravens can't be hurt. Pets rebuild from
  carried summon items at every wave start (which quietly answers the vault's open
  question: structures re-deploy per wave, and saves don't need pet state at all).
  Engineer class + Kinship perk + 3 summon items + 3 ally SVGs.
- Fifteenth chunk (8cf1afd): touch input (virtual stick + A/B, shown on touch devices or
  with ?touch in the URL), a worst-case sim stress benchmark (220 enemies + 16 pets =
  0.22ms/tick — 0.7% of the frame budget, so no spatial partitioning needed), and a class
  win-rate sweep. **Findings:** ranged starts beat melee starts by a wide margin (the
  policy's kiting couldn't land melee at all until I taught it to orbit its own reach);
  after tuning, the band is Sentinel/Fighter ~5-15%, Student/Rogue/Looter ~15-30%,
  Vampire 30%, Mage/Marksman 40%, Priest 50%, Engineer 75%. Engineer's turret is clearly
  strong — vault's "pet damage is free" warning showing up in numbers. Worth a nerf watch.
- Sixteenth chunk (7fc41e4): the companion manual is live at /manual.html — the full
  content catalog (classes, weapon stat tables, items, slot items, companions, perks,
  enemies, unlock conditions) rendered from the exact JSON the game runs on, plus a
  spoiler-free player guide and a how-to-play section. Linked from the title screen.
- **Two things only Radley can do for the live deploy:**
  1. Enable Pages: repo Settings → Pages → Source: "GitHub Actions".
  2. Move `docs/dev/github-pages-deploy.yml` to `.github/workflows/deploy.yml` and push
     (my token lacks the `workflow` scope to push workflow files; a token with that scope
     would also work).
- Seventeenth chunk (901e5d8): the intermission sequence is now the vault's complete
  five-step order (recap → rewards → draft → class grant → shop, empty steps skipped).
  Class gifts seeded on five classes. Internal architecture doc + release checklist
  written, including my proposed achievements-vs-unlocks split (achievements = reward-
  free records on the same condition engine).
- Eighteenth chunk (1234756): **v0.1.0 tagged.** The full release checklist ran clean:
  90 unit + 4 E2E tests, lint, build, stress (0.22ms/tick), sim band (45% solo mid-skill
  win, deaths spread 7–10, first weapon purchase by wave 2), screenshot review, no title
  or reference leaks, private dirs untracked. This is the first complete, releasable
  build of the rebuild — playable at http://192.168.1.34:5173/ with the manual at
  /manual.html, and it goes live on Pages the moment the two flagged steps happen.
- Nineteenth chunk (b7e5bf3): elements landed exactly as the vault specifies — effects on
  authored sources only, no hard control. Burn is attributed damage-over-time, Shocked
  amplifies everything and makes Lightning arc, Chilled slows with diminishing returns.
  Ember Wand / Ice Shotgun / Storm Javelin / Ignition Charm, plus Pyromancer and
  Stormcaller. The vault's "ignite several enemies at once" build target is now a real
  tracked unlock condition (Firestarter: 4 alight at once opens the Pyromancer).
- Twentieth chunk (1db4d00): **every build target the vault names as a goal now exists
  and is proven by an acceptance test** — no-weapon summoner (a wave cleared 100% by
  pets), gold-pickup damage (Scavenger + Gold Strike with chance-not-magnitude stacking),
  unresistable Void (Warlock + Void Scepter), ignition, close-range spread, and lightning
  chains. 13 classes, 12 weapons, 24 items, 101 tests.
- Twenty-first chunk (98f2067): **Act 2 exists.** Six enemies straight from the vault's
  wider pool (Leaper, Sprayer, Fumer, Bannerman, Shielder, Caller), the Broodmother boss
  (slams and spawns, frenzy below half health — designed by me since the vault only has
  the act-1 boss; worth a vault entry), ten authored waves, and an act picker once act 1
  is won. Support enemies finally give co-op a target-priority conversation.
- Twenty-second chunk (ae106fa): the simulator caught act 2's inverted difficulty curve
  (half of all deaths in waves 1–2, then a coast) — opening softened, late stiffened, now
  57% mid-skill with a spread curve. And the vault's uniform menu scheme is real: every
  panel is pad-navigable (up/down + A) through one generic hook, with each co-op player's
  pad driving their own quarter-screen panel. Arena A/B buttons no longer leak into menus.
- Twenty-third chunk (6a4d02e): item variants, using the vault's own recommended
  separation — Corrupt is always paid in max health (the player learns what corruption
  costs), Cursed carries a per-item FIXED penalty (the curse on Fleet Boots is always the
  same curse — learnable, which I think improves on 'arbitrary'), Relic adds a bonus stat,
  Holographic is labeled and slightly stronger. Implemented as derived item ids so saves,
  stacking, and attribution needed zero changes. Worth folding the fixed-curse idea back
  into the vault's Damage and Defense note.
- Twenty-fourth chunk (05f0d84): audio. My proposed direction (the vault left it open):
  fully procedural Web Audio — no files, no downloads, and cues only where they carry
  information (money, level-ups, wave clears, getting hit, downs and revives, shop
  transactions, the unlock fanfare). Weapon fire and enemy hits are deliberately silent;
  in a horde game constant combat noise would just be static. Mute toggle persists.
  Suggest adding an Audio Direction note to the vault with this principle: sound obeys
  the same rule as the critical art layer — it exists to carry information, not decoration.
- Twenty-fifth chunk (3971f61): classes 14–17. The Bulwark's crowd-armor makes the middle
  of the horde the safe place (the vault's favorite revision, working); the Oracle proves
  the information-class axis is nearly free to build; the Demon Hunter is the first
  act-2-gated unlock. 17 of 36 roster classes playable.
- Twenty-sixth chunk (4e08d77): full-roster balance sweep. Win rates at mid skill, act 1,
  after tuning: Priest/Stormcaller ~50, Marksman 44, Oracle 40 (down from a too-hot 69),
  Engineer/Pyromancer 38, Student/Mage/Warlock/Magnetist ~31, Scavenger 30 (up from a
  broken 0 — its gold-zap needed a ranged start and a Lodestone), Demon Hunter 25,
  Fighter/Rogue/Sentinel/Bulwark ~20, Vampire/Looter ~13. **Systemic finding for the
  vault:** melee-start classes consistently trail ranged starts by ~15 points — the melee
  proximity tax needs either bigger melee numbers or a defensive rider baked into the
  Melee tag. Worth a vault decision rather than more per-class patches.
- Twenty-seventh chunk (8a9f698): hot-join (pause menu → Add player, joins beside P1 at
  half health with their class kit) and a real readability-gate run at wave-9 density.
  The screenshot review caught exactly the class of failure the vault's art doc predicts:
  the solo camera zoomed in so far the horde was off-screen. The camera now frames every
  threat within 9 units of any player. The vault's review-gates section works as intended
  — a still exposed what live play hides.
- Twenty-eighth chunk (85d7300): the remaining readability-gate work. Four-player framing
  passes (rings carry identity at distance), the last decimal displays became whole
  attacks-per-10s rates, and the art doc's runtime tuning requirement is real — enemy and
  player scale, marker alpha, and telegraph alpha are adjustable live from the console.
- Twenty-ninth chunk (765032b): the last two UI rules from Screens and UI — stat colours
  now show deviation from the class baseline (green up, red down, computed live per
  class), and tags render as menu-only chips with element hues. Every M7 polish item the
  vault specifies concretely is now done.
- Thirtieth chunk (8d3e59d): the King is playable — no weapons at all, three squires that
  inherit half of every melee bonus he finds, which is the vault's flagship no-weapon
  summoner delivered as a class. Paladin completes the mitigation trio the vault sketched
  (Priest shares regen, Bulwark self-tanks in crowds, Paladin shares armor), and the
  Dragon Knight is the conversion pattern pointed at fire. 20 of 36 classes.
- Thirty-first chunk (55b316d): endless mode, straight from the Run Structure spec —
  generated escalating waves past the final boss (random pressure, rising elite share, a
  boss every fifth wave), unlocked by finishing act 2, and deliberately progression-free
  so it never competes with normal play. Randomized waves belong to endless exactly as
  the Idea Backlog suggested.
- Thirty-second chunk (6968953): the slot-count trade — the Combat Model's strongest
  class identity lever — is real. Windrunner (two movement slots, no equipment, burning
  trail) and Quartermaster (two equipment slots, no movement, faster cooldowns). One
  button per slot type still fires the first ready item, so the two-button budget holds
  even with doubled slots. Player-made ground hazards now exist as a general mechanic.
- Thirty-third chunk (ebbf13e): Necromancer (kills rise as 12-second allies), Toxicologist
  (poison — a fourth effect that stacks without limit, per the vault's "accepted with
  unlimited stacking" note, cost taken as reduced direct damage from its own candidate
  list), and Gambler (heavy Corrupt bias + free first reroll). 25 of 36 classes.
- Remaining electives: classes 26–36 (several need mechanics that don't exist yet —
  Runesmith's player-facing tags, Bard's aura items, Merchant/Curator variant hooks),
  act 3, the hub. Good review point.
