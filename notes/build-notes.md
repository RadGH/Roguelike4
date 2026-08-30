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
- Next: scaffold the project, then M0 engine foundation (deterministic sim core + seeded
  RNG + tag/content registries + Pixi isometric bootstrap).
