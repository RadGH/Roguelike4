# Unlocks & Codex

## The unlock engine

Everything unlockable (classes, items, feats, acts, cosmetics, codex lore pages)
references a **deed** — a declarative requirement evaluated against the combat
tracker's event stream. Deeds live in `data/deeds.json`:

```jsonc
{
  "id": "explosion-multikill-5",
  "desc": "Defeat 5 or more enemies with a single explosion",
  "kind": "single-event",            // single-event | counter | run-state | discovery
  "match": { "event": "kill", "where": { "deliveryTag": "explosion" }, "groupBy": "sourceHitId", "count": 5 },
  "hint": "Crowded enemies, one very big bang."
}
```

Deed kinds:
- **single-event**: one qualifying moment (e.g. 5 kills sharing one `sourceHitId`
  from an explosion-tagged hit).
- **counter**: accumulate across all runs ("100 burn kills", "block 500 damage").
  Progress persists per save slot, visible in codex.
- **run-state**: evaluated at wave/run end ("clear a wave below 25% HP", "hold
  5,000 gold", "take 0 damage this wave").
- **world-state**: predicate over live world state, checked when the relevant state
  changes ("5 enemies burning simultaneously" — the status system emits a
  `statusCountChanged` event; deeds match its high-water mark).
- **discovery**: flag set by an event (NPC rescued, secret found).

Every deed declares a co-op **scope**: `perPlayer` (one player must satisfy the whole
requirement — e.g. "take 0 damage this wave" is about YOUR run) or `party` (pooled
across the couch — most counters). The codex hint states the scope in plain words.
Select deeds also award a first-time Glimmer bonus (1–5) — listed on the deed.

Because deeds match on tracker events (which carry full attribution: source player,
item, perk, delivery, damage types, target), authoring new deeds is pure data. The
unlock toast ("✨ Unlocked: Meteor!") appears immediately in-run; new items join drop
pools from the NEXT wave.

In co-op, unlocks belong to the save slot (the couch progresses together);
per-player deed *stats* are still recorded for bragging rights.

## Day-one audit (a shipped test, not a vibe)

`data/deeds.json` + the day-one item pool (`05-items.md`) must satisfy a CI check:
**every deed's prerequisite is reachable from a fresh save** by walking the unlock
graph — e.g. fire kills are reachable (Mage starting Wand ties→fire, Candlestick in
day-one drops) → Fireball; explosions are reachable (Firecracker day-one, Fireball
blast) → Rocket Launcher/Meteor; burns reachable (Candlestick) → Flamethrower's
5-simultaneous-ignites. The audit fails the build if any unlock is orphaned. The sim's
reachability sweep double-checks it probabilistically.

## The Codex (in-game, at Archivist Glow; also pause-menu accessible mid-run)

Tabs: **Classes / Weapons / Passives / Feats / Boons / Enemies / Bosses / NPCs /
Effects & Combos / Lore**.

- Every entry has three states: **Unlocked** (full detail + stats + flavor),
  **Seen/Locked** (silhouette + name + unlock hint + live progress bar, e.g.
  "Burned 73/100"), **Unknown** (??? + vague category hint, so completionists know
  how much remains).
- Enemy entries fill in after first encounter: behaviors, resistances, gold/XP yield,
  kill count. "Stirred" variants listed under their base enemy. **Two-tier lore
  unlocks per enemy** (10 kills / 50 kills): tier 1 is flavor; tier 2 is a real
  mechanical tip ("Soggums hate standing in fire pools — their slow aura shuts off
  while burning"). Knowledge-as-reward, teaching the systems through play.
- Effects & Combos documents statuses (burn/stun/freeze/etc.) and discovered combo
  rules (Ice Bomb, Frostfire) once witnessed.
- Codex completion % per tab; 100% grants a cosmetic town trophy. No power locked
  behind completion (collection is its own reward).
- The website mirrors the codex from the same data files — but the site shows
  everything (it's the spoiler-friendly manual; the in-game codex is the
  spoiler-safe one). Player docs on the site stay spoiler-free on the how-to-play
  pages; the reference/database section is clearly marked "spoilers".
