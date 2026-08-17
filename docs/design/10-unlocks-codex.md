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
- **single-event**: one qualifying moment (5 kills sharing one `sourceHitId`;
  "ignite 5 enemies simultaneously" = burning-enemy count touches 5).
- **counter**: accumulate across all runs ("100 burn kills", "block 500 damage",
  "dodge 25 attacks"). Progress persists per save slot, visible in codex.
- **run-state**: evaluated at wave/run end ("clear a wave below 25% HP", "hold
  5,000 gold", "take 0 damage this wave").
- **discovery**: flag set by an event (NPC rescued, secret found).

Because deeds match on tracker events (which carry full attribution: source player,
item, perk, delivery, damage types, target), authoring new deeds is pure data. The
unlock toast ("✨ Unlocked: Meteor!") appears immediately in-run; new items join drop
pools from the NEXT wave.

In co-op, deeds credit the player who performed them; counters are per save slot
(the couch shares a town). [DECISION: shared-slot unlocks — the couch progresses
together; per-player deed *stats* still recorded for bragging rights.]

## The Codex (in-game, at Archivist Glow; also pause-menu accessible mid-run)

Tabs: **Classes / Weapons / Passives / Feats / Boons / Enemies / Bosses / NPCs /
Effects & Combos / Lore**.

- Every entry has three states: **Unlocked** (full detail + stats + flavor),
  **Seen/Locked** (silhouette + name + unlock hint + live progress bar, e.g.
  "Burned 73/100"), **Unknown** (??? + vague category hint, so completionists know
  how much remains).
- Enemy entries fill in after first encounter: behaviors, resistances, gold/XP yield,
  kill count. "Stirred" variants listed under their base enemy.
- Effects & Combos documents statuses (burn/stun/freeze/etc.) and discovered combo
  rules (Ice Bomb, Frostfire) once witnessed.
- Codex completion % per tab; 100% grants a cosmetic town trophy. No power locked
  behind completion (collection is its own reward).
- The website mirrors the codex from the same data files — but the site shows
  everything (it's the spoiler-friendly manual; the in-game codex is the
  spoiler-safe one). Player docs on the site stay spoiler-free on the how-to-play
  pages; the reference/database section is clearly marked "spoilers".
