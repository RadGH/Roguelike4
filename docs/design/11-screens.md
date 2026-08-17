# Screens — complete inventory

Every screen in the game, with: contents, player actions, players supported,
share/personal classification, and responsive rules. (Global rules in
`02-coop-controls.md#responsive-layout-rules` apply everywhere: shared = one panel;
personal = per-player panel usable at quarter-screen.)

## Boot & meta

### 1. Title screen — shared
Logo (from `data/branding.json`), "Press any button", ambient town glow, version.
Any device's press claims Player 1. → Save slots.

### 2. Save slots — shared, P1 drives
3+ slots as cards: town level, keys lit, playtime, codex %, last played. Actions:
load, new game, copy, delete (typed/held confirm), export slot, import file.
Responsive: cards stack vertically on narrow screens.

### 3. Settings — shared, any player drives (opened via Fizzwick or pause)
Tabs: **Video** (fullscreen, zoom comfort, screen-shake, flash reduction, colorblind
palettes), **Audio** (master/music/SFX sliders, mute-when-unfocused), **Controls**
(per-device rebinding, deadzones, aim assist strength, swap sticks), **Accessibility**
(text size ×1–×1.5, high-contrast outlines, slow-mode 85%, hold-to-mash toggles),
**Content packs**, **Data** (export/import save, raw combat-log export toggle).
Responsive: tabs become accordion on narrow screens.

## Town (hub scene) — shared

### 4. Town walkabout
The party walks a cozy diorama; NPCs with prompt bubbles; Beacon Pillars visible
(lit per Emberkeys); town cosmetics reflect upgrades. All joined players walk around;
any player can engage an NPC (opens the relevant screen for all — town screens are
shared; per-player choices inside are focus-split). Hot-join active here.
Responsive: camera fits town; prompt text scales.

### 5. Keystone ceremony — shared, non-interactive, skippable
Plays on town entry with a new Emberkey (see `09-economy-meta.md`).

### 6–9. Shop screens (Flick / Cinder / Lumen / Tallow) — shared, any player drives
Grid of unlockables: icon, name, price, owned/locked state, deed-shortcut prices.
Selecting shows detail pane (kit preview for classes, stats for items). Purchase
uses the slot's shared Glimmers with a confirm. Responsive: grid 4→2→1 columns;
detail pane becomes a sheet on narrow screens.

### 10. Codex (Archivist Glow; read-only from pause mid-run) — shared
See `10-unlocks-codex.md`. Tab bar, entry grid with three lock states, detail pane
with stats/flavor/progress bars, completion %. Responsive: same grid collapse.

### 11. Run history & meters (Chronicler Soot) — shared
Run list (date, party, classes, result, wave reached) → run detail: recap table +
full meter drill-down (see `12-tracking.md#aggregation--ui`) + build snapshots per
player. Dev-toggle: "simulate this build ×100". Responsive: meter tables become
stacked bars + tap-to-expand rows on narrow screens; this screen is the stress test
for table responsiveness.

### 12. Party setup (The Bellhop) — PERSONAL panels + shared footer
Each joined player's panel: class carousel (locked classes show hints), loadout
preview, ready toggle. Shared footer: starting act selector (unlocked acts), evil-
item reminder, GO (requires all ready). Supports 1–4; panels half/quarter screen.
Hot-join here adds a panel live. Quarter-screen rule fully applies.

## Run screens

### 13. Arena HUD — shared overlay
Per-player corner clusters (HP bar, level, dash pips, class ability cooldown, gold);
wave number + spawn progress ticker top-center; boss bar with phase notches when
active; unlock toasts; pickup sparkles. Party wipes → run-end transition. Colorblind-
safe player outline colors. Responsive: clusters shrink; on solo mobile, HUD anchors
re-inset for safe areas.

### 14. Pause — shared (any player, whole screen, gameplay frozen)
Resume, Settings, Codex (read-only), Meters (current run), Drop out (per player),
Abandon run (all players confirm), Quit to town. Shows controller assignments.

### 15. Wave recap — shared
Party table: kills, damage dealt/taken, healing, deaths/survived, gold this wave;
MVP-style callouts (most kills, most saved HP, best dodge). "Details" opens meter
drill-down. Continue advances when all press ready. Responsive: table → stacked
cards on narrow.

### 16. Rewards — PERSONAL panels
Each player's chest queue from round-robin: open exact chests (reveal → equip/
salvage) and choice chests (4 cards, 5 with Oracle/Lucky Ribbon → pick → equip/
salvage). Equipping over full hands prompts what to swap (salvage the loser).
Tinkering tab: spend Bits to upgrade quality of equipped items; gold peddler tab
when the wandering peddler visits. Ready check per player; a shared "next wave in
3-2-1" only once all ready. Quarter-screen: cards become a swipeable/focus-cycled
stack; all info visible without hover.

### 17. Level-up: boons — PERSONAL panels (queued per level gained)
1-of-4 boon cards (5 with Lucky Ribbon/Oracle) per level gained this wave, resolved
one level at a time. Card: icon, name, effect, current-stat context ("+4% crit →
9%"). Skip is never offered (always pick). Quarter-screen: 2×2 card grid minimum
targets 40px.

### 18. Level-up: class items & feats — PERSONAL panels
Same card UI: class item grants at scripted levels (Mage lvl 2: Fireball/Lightning
Bolt/Frostbolt) and feats every 3rd level. Feat cards visually distinct (gilded).

### 19. Run end (victory or wipe) — shared
Victory: Emberkey fanfare / WIN celebration (act 4 first clear = credits). Wipe:
gentle snuff-out, "The Everflame remembers." Both → final recap (whole-run meters,
records set, deeds progressed, Glimmers earned) → town.

## Overlay & edge screens

### 20. Controller lost / device prompts — shared modal
Auto-pause + reconnect instructions; reassign device to player.

### 21. NPC rescue event — in-arena diegetic prompt
Caged NPC + guard burst; freed → thank-you bubble + toast "New face in town!".

### 22. First-run tutorial — diegetic, minimal
Wave 0.5 walk-in: move/aim/dash prompts fade after first use; interact prompt at
first chest. No modal tutorial walls. Replayable from settings.

## Screen flow

Title → Slots → Town ⇄ (shops/codex/history/settings)
Town → Party setup → Arena: [HUD wave → Recap → Rewards → Level-ups]×N → Boss →
(Emberkey | continue | wipe) → Run end → Town (ceremony if key).
Pause reachable anywhere in-arena; codex read-only in pause.
