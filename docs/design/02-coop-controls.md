# Co-op, Controls, Camera & Responsive Rules

## Player count & joining

- 1–4 players, one shared screen (never split-screen).
- Player 1: keyboard + mouse OR gamepad. Players 2–4: gamepads.
- Hot-join in town or between waves: press Start/Enter on an unused device → character
  select for that player. **Mid-run joiners get a catch-up package**: they enter at the
  party's average level, immediately resolve their queued boon/feat picks, and open a
  scripted stack of choice chests scaled to the current act — then join the loot
  rotation in the slot immediately after the round-robin pointer. Drop-out from pause
  menu (their character retires to the bench for the rest of the run; the rotation
  skips them and their unopened chests pass to the next player, rerolled through the
  new owner's equip filter at the same rarity).
- Each player picks their own class; duplicates allowed.

## Camera

- Single camera centered on the party's bounding box, zoomed so all players fit with
  comfortable margin. Zoom is clamped (min/max, tied to the art raster budget in
  `16-engine.md`) and smoothed.
- **No forced movement.** The camera never pushes a player (a pull could drag someone
  into a telegraph). Instead, players beyond the frame edge get a soft *move-speed
  reduction away from the party* (they can always move toward it at full speed) plus an
  edge arrow indicator. Slow classes are exempt from causing the squeeze: the leash
  radius keys off each player's own max speed (Snail Knight never fights the camera).
  This needs live playtesting — flagged as a tune-first system.
- Solo play: camera follows the player at a fixed pleasant zoom with slight
  look-ahead (+2 units toward aim).

## Controls (gamepad is the first-class citizen)

| Action | Gamepad | Keyboard/Mouse (P1) |
|--------|---------|---------------------|
| Move | Left stick | WASD |
| Aim | Right stick (weapons auto-fire while aiming; nearest-enemy auto-aim when stick neutral) | Mouse position (always aiming) |
| Dash/dodge roll | A / bottom face | Space |
| Interact (chests, NPCs, revive) | X / left face | E |
| Class active ability (if class has one) | B / right face | Right mouse / Q |
| Open own inventory (between waves: jump to own panel) | Y / top face | Tab / I |
| Pause (whole screen, any player) | Start | Esc |
| Menu navigation | D-pad/stick + face buttons | Arrows/mouse |

- Every menu is 100% navigable by gamepad (focus ring, no mouse-only affordances) AND
  by mouse — this is a CI-tested contract (the predecessor shipped menus a controller
  couldn't open at all). Menus carry ARIA roles/labels (React makes this nearly free).
- Rebinding for keyboard and gamepad in Settings. Sensible per-pad defaults.

### Touch gameplay (solo mobile — full spec, proven in the predecessor)

- Floating dual sticks: touching the left half of the screen spawns the move stick AT
  the touch point; right half spawns the aim stick. Base springs back to a rest position
  on release. Base radius ~70pt, knob ~28pt, inner deadzone 0.12 then renormalized.
- Aim stick magnitude ≥ 0.6 = auto-fire (aiming and shooting are one gesture).
- Dash button bottom-center; Interact appears contextually near it. Haptics with
  intent: light tick on stick grab (15ms), skill (12ms), dash (25ms).
- Respect safe-area insets (`viewport-fit=cover`); `touch-action: none` on the canvas.
- Touch pause button top corner (a controller/keyboard is never required on mobile).

## Co-op rules (from the brief — these are contractual)

- **Item drops** (chests): dealt **round-robin**. A pointer records who got the last
  item; the next chest belongs to the next player in join order. The recap/reward UI
  shows whose turn is next. Skips retired/benched players.
- **Gold** is **mirrored**: 100 gold dropped = every non-retired player receives 100 —
  **including snuffed players** (being downed already costs enough; the mirror exists
  to prevent resentment). Pickup still requires *someone* to collect it.
- **Pickup-affecting effects are personal but react globally**: e.g. a player with
  "5% chance to auto-collect gold" rolls that chance against ANY gold drop from any
  kill — maximizing the value of each player's items. Pickup-radius bonuses extend
  that player's own collection circle only.
- **XP** drops are per-player pickups credited to the whole party equally (party
  levels are individual; XP amounts are equal so co-op doesn't starve anyone).
  [DECISION: shared-equal XP keeps players in sync and avoids kill-stealing feelings.]
  **XP budget is per-wave normalized**: party size scales spawn COUNT (+70%/player) but
  per-kill XP is divided so each player's XP-per-wave stays roughly flat vs solo —
  co-op must not level dramatically faster.
- **Downed players**: at 0 HP a player is snuffed (ghost-wisp follows the party).
  Revive: alive player holds Interact near the wisp for 3s. Each player can BE revived
  once per wave; automatic revive at wave end. All players snuffed = run over.
- **Wave rewards**: each player gets their own chest queue + level-ups (see
  `11-screens.md`). Reward/level-up screens split the screen into per-player panels.

## Responsive layout rules (contractual)

Screens are classified as **shared** (one panel, whole screen) or **personal**
(one panel *per player*, screen divided):

- Shared: town, HUD overlay, pause, recap, settings, codex, run history.
- Personal: reward/chest opening, level-up boon/feat picks, inventory management,
  character select.

Personal panels divide the screen: 1P = full, 2P = halves (side by side), 3–4P =
quarters. **Every personal panel must be fully usable at quarter-screen (~480×270 on
a 1080p TV) — and, equivalently, on a phone screen.** This is the same constraint,
which is why the game is mobile-friendly for solo play almost for free.

**Quarter-screen ≠ phone** — same pixels, very different viewing distance. Two minimum
sets, both CI-tested as separate Playwright projects:
- Phone (30cm viewing): targets ≥ 40px, text ≥ 14px.
- Couch quarter-screen (2–3m viewing, 1080p TV): targets ≥ 56px, text ≥ 22px — panels
  at quarter scale must pass the COUCH minimums, which are the binding constraint.

Rules for personal panels:
- No hover-only information; everything reachable by pad focus.
- Panels are self-contained React components, synced to Claude Design, and testable
  at all four sizes in isolation (Playwright captures all sizes in CI).
- Players proceed at their own pace; a "ready" checkmark per panel, wave continues
  when all are ready (with a votable "hurry up" nudge sound, not a timer).

Shared screens must work from 320px-wide phones to 4K TVs (fluid layout, safe-area
insets for TVs).

## Assist & accessibility

- **Cozy Mode** (per player, in party setup + settings): −25% damage taken for that
  player. Runs with any Cozy player are flagged (gently) in run history. Keeps
  mixed-skill couches playing together — very on-brand.
- Existing accessibility settings (text scale, contrast outlines, colorblind palettes,
  flash reduction, slow-mode 85%, hold-to-mash) per `11-screens.md` §3; menus ARIA'd.

## Input edge cases

- Pad disconnect mid-wave: game auto-pauses (whole screen) with "controller lost" toast.
- Two devices pressing pause: last-in wins; any player can unpause.
- Menus never trap focus; back always exists (B / Esc).
