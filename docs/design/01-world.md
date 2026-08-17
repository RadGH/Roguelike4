# World, Lore & Acts

Tone: storybook-bright. Think warm lantern light, button-eyed monsters, pastel meadows —
and a villain who is, quite literally, a wet blanket.

## The premise

The world of **Flickermoor** is lit not by a sun but by the **Everflame** — a colossal,
cheerful bonfire tended for a thousand years from the town of **Wickburrow**, home of the
candle-folk. One night, something yawned in the dark between the stars: **the Snuff**, a
tide of soft, grabby shadow-creatures who find every light *far too loud* and would like
them all put out, please.

The Everflame is guttering. The four **Beacon Pillars** that feed it have gone cold, their
**Emberkeys** stolen and carried off into the four corners of Flickermoor. The town's last
hope: the **Wicklighters** — volunteer heroes (that's the players) who march out, wick
ablaze, to carve through the Snuff, recover the Emberkeys, and relight the world.

Wicklighters who fall are not dead — they are *snuffed out*, retiring to the town's
Hall of Embers where their deeds are recorded (run history). There's always another
volunteer.

## The four acts

| Act | Region | Waves | Palette | Threat |
|-----|--------|-------|---------|--------|
| 1 | **Guttering Meadows** — rolling flower fields where the light flickers | 1–10 | spring greens, dandelion gold | Snufflings, fluffs, and beasts of the meadow |
| 2 | **Sogbottom Marsh** — a giggling bog that drowns lanterns | 11–20 | teal, lilypad green, plum | damp things, bubbles, frog-folk gone soggy |
| 3 | **The Frosted Wick** — a mountain shaped like a snuffed candle | 21–30 | ice blue, white, mint | frost sprites, snowballs with teeth, chilly winds |
| 4 | **The Snuffed Palace** — the Snuff's plush, pillow-dark court | 31–40 | deep violet, black, neon accents | the Snuff's elite, animated bedding, the Grand Snuff |

Each act is a themed arena (bounded arena with light obstacles). Completing an act's
final wave for the first time drops its **Emberkey**. Back in town, a short animation
shows the key slotting into its Beacon Pillar — relighting it, unlocking the next act
for future runs, and stirring **harder monster variants** into the completed act.

Beating Act 4 (wave 40) the first time = the win. The Everflame roars back. The Snuff,
politely, does not stop coming — which is the excuse for **endless mode** (see
`08-waves-acts.md`).

## Wickburrow (town hub)

The town is the main menu, walked as a tiny cozy scene. NPCs are the menu entries
(full screen specs in `11-screens.md`):

| NPC | Role |
|-----|------|
| **Mayor Tallow** — a stately half-melted candle | Story, keystone ceremony, town upgrades (spend Glimmers) |
| **Fizzwick** — a tinker gnome with too many goggles | Settings (video/audio/controls/accessibility) |
| **Chronicler Soot** — a scholarly moth | Run history, combat statistics, drill-down meters |
| **Forgemaster Cinder** — a salamander blacksmith | Item unlock shop (Glimmers), salvage info |
| **Professor Lumen** — a firefly academic | Perk/feat unlock shop (Glimmers) |
| **Grandmaster Flick** — a match-stick martial artist | Class unlock shop (Glimmers), class previews |
| **The Bellhop** — a small brass bell creature | Start a run (party setup, act/difficulty select) |
| **Archivist Glow** — a lantern spirit | The Codex (browse everything, locked + unlocked) |

**Discoverable NPCs** appear in town after being found mid-run (each has a rescue
event in a specific act; see `09-economy-meta.md#discoverable-npcs`): Gravekeeper
Mortimer (Act 2, necromancy), Beekeeper Bumble (Act 1), Chef Basil (Act 3), and
Madame Wobble the fortune teller (Act 4).

## Naming glossary (single source of truth for flavor terms)

| Term | Meaning |
|------|---------|
| Everflame | The world-fire; the thing you're saving |
| Snuff / the Snuff | The enemy faction; individual creatures are "Snuffs" |
| Wicklighter | A player character |
| Emberkey | Act-completion keystone artifact |
| Beacon Pillars | Town progression pillars, one per act |
| Glimmers | Persistent gem currency (town/meta) |
| Gold | Run-only currency |
| Bits | Salvage materials (run-only), used to tinker items between waves |
| Hall of Embers | Run history / retired characters |

All lore text lives in `data/lore/*.json` — the game and website read the same files.
