# Combat Tracking (the meter)

Inspiration: raid-style damage meters with full drill-down. The tracker is a core
engine system, not a UI afterthought — deeds, recap screens, run history, balance
sims, and the website's "example numbers" all consume it.

## Event model

Every combat-relevant moment emits one immutable event into the run's ring log:

```jsonc
{
  "t": 1234.56, "wave": 7,
  "event": "damage",            // damage | heal | mitigation | kill | status | pickup | summon | death
  "source": {
    "player": "p2",              // or "enemy:croakswain#41" / "pet:dog#p2"
    "itemId": "fireball",        // owning weapon/passive/feat
    "grantedBy": "feat:cinder",  // when a feat/perk/affix modified or caused it
    "deliveryTag": "explosion",  // projectile | melee | explosion | pool | chain | pet | trail...
    "hitId": "h_88123"           // shared by all consequences of one hit (multikill deeds)
  },
  "target": "enemy:snuffling#812",
  "amount": 34, "types": ["fire"], "crit": true,
  "mitigated": { "dodged": false, "blocked": 2, "armor": 5, "resist": 3, "flat": 0 }
}
```

Key attribution rules:
- DoT ticks carry the ORIGINAL source chain (Fireball + burn-perk → every burn tick
  credits Fireball and notes the perk). 
- Mitigation events credit the DEFENSIVE source: a dodge granted by an avoidance-perk
  item logs that item, so "how many times did Lucky Slippers save me" is answerable.
- **Enemy-side mitigation is logged too** — "how much damage did Pillowman's armor
  absorb" must be answerable, or offensive tuning goes blind (predecessor lesson).
- Reflected/triggered damage chains keep both links (trigger source + original).
- Attribution keys are STRUCTURED IDs, never display strings (predecessor lesson).

## Aggregation & UI

- Live aggregation per (player → item → effect → target) at multiple resolutions:
  current wave, current act, whole run. Ring log keeps full events for the current
  act; older waves keep aggregates only (memory bound).
- **Recap screen** (after every wave): party table — kills, damage dealt, damage
  taken, healing, survived — with per-player expansion.
- **Meter drill-down** (recap "details", Chronicler Soot in town, pause menu):
  Summary bars → click a player → by item/skill → click an item → by effect
  component (direct / DoT / triggered) → by target, with counts, crits, avg,
  min/max, uptime for DoTs/auras. Mitigation tab: damage avoided by source
  (dodge/block/armor/resist), per granting item. Healing tab similarly.
- Sort/filter, per-wave paging, co-op comparison view (who's carrying — lovingly).

## Persistence

Run history stores per-run aggregate trees + final build snapshots in IndexedDB,
capped at 50 runs + pinned favorites (oldest unpinned evicted). Raw events are not
retained by default; when the settings toggle "export combat log" is ON, events stream
to an append buffer for the whole run (memory-bounded with a visible warning) and can
be downloaded as JSON at run end. Toggle off = only the current act's ring log exists.

## Performance

Events are plain objects in a preallocated ring buffer; aggregation is incremental
(no rescans mid-wave); the meter UI reads aggregate snapshots at 4 Hz max. Budget:
tracking overhead <5% frame time at 300 enemies / 4 players (perf test enforced).
