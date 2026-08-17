# Website (the manual)

Same repo, same GitHub Pages deploy, same DATA. The site is an in-depth manual that
reads the actual `data/*.json` the game ships — numbers can never drift from the
game. Model: the predecessor game's site (classes/enemies/spells browsable online).

## Structure

```
/               → landing: art, pitch, play-now button (the game itself), screenshots
/play           → the game (canonical URL)
/guide          → PLAYER DOCS: spoiler-free, jargon-free how-to-play
                  (controls incl. gamepad diagrams, co-op etiquette, what screens do,
                   first-run tips, accessibility options)
/database       → the reference (marked "spoilers ahead"):
  /classes      → every class: kit, mods, unlock deed, level-up items
  /weapons /passives /feats /boons
  /enemies      → per act, behaviors, resistances, yields; elites, bosses (phase notes)
  /effects      → statuses & combo rules
  /deeds        → every unlock requirement
  /economy      → currencies, shops, town upgrades
/modding        → generated schema docs + content-pack how-to
/changelog      → release notes per version
```

## Build

- Static generation at build time: a Vite build step imports the same Zod-validated
  registries the game uses and emits the database pages (React, prerendered to
  static HTML for SEO; hydrated for search/filter).
- Search + filters (by damage type, tag, unlock kind). Item cards reuse the GAME'S
  item-card React component (synced with Claude Design) so the site looks like the
  game.
- Site-only extras: per-item "example numbers at quality tiers" tables computed with
  the real formulas; deed hint vs full requirement toggle.
- Player guide pages are hand-written markdown (spoiler-free, plain language) —
  the ONLY hand-authored site content besides the landing page.

## Constraints

- No reference-game titles anywhere on the site. Original lore/terms only.
- Site must pass mobile + desktop Playwright checks like the game screens.
- The game title appears via `data/branding.json` → rename stays one edit.
