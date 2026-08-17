# Co-op, Controls, Camera & Responsive Rules

## Player count & joining

- 1–4 players, one shared screen (never split-screen).
- Player 1: keyboard + mouse OR gamepad. Players 2–4: gamepads.
- Hot-join in town or between waves: press Start/Enter on an unused device → character
  select for that player. Drop-out from pause menu (their character retires to the bench
  for the rest of the run; loot round-robin skips them).
- Each player picks their own class; duplicates allowed.

## Camera

- Single camera centered on the party's bounding box, zoomed so all players fit with
  comfortable margin. Zoom is clamped (min/max) and smoothed; a soft "leash" gently
  pushes stragglers toward the party when max zoom is reached (no hard walls between
  players — the leash is an accelerating pull applied only beyond the leash radius).
- Solo play: camera follows the player at a fixed pleasant zoom.

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
  by mouse. Touch is supported on menus for mobile play (single player).
- Rebinding for keyboard and gamepad in Settings. Sensible per-pad defaults.

## Co-op rules (from the brief — these are contractual)

- **Item drops** (chests): dealt **round-robin**. A pointer records who got the last
  item; the next chest belongs to the next player in join order. The recap/reward UI
  shows whose turn is next. Skips retired/benched players.
- **Gold** is **mirrored**: 100 gold dropped = every living player receives 100.
  (Pickup still requires *someone* to collect it; once collected it credits everyone.)
- **Pickup-affecting effects are personal but react globally**: e.g. a player with
  "5% chance to auto-collect gold" rolls that chance against ANY gold drop from any
  kill — maximizing the value of each player's items. Pickup-radius bonuses extend
  that player's own collection circle only.
- **XP** drops are per-player pickups credited to the whole party equally (party
  levels are individual; XP amounts are equal so co-op doesn't starve anyone).
  [DECISION: shared-equal XP keeps players in sync and avoids kill-stealing feelings.]
- **Downed players**: at 0 HP a player is snuffed (ghost-wisp follows the party).
  Revive: alive player holds Interact near the wisp for 3s (once per wave per player),
  or automatic revive at wave end. All players snuffed = run over.
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

Rules for personal panels:
- Minimum touch/focus target 40px; text ≥ 14px at quarter scale.
- No hover-only information; everything reachable by pad focus.
- Panels are self-contained React components, synced to Claude Design, and testable
  at all four sizes in isolation (Playwright captures all sizes in CI).
- Players proceed at their own pace; a "ready" checkmark per panel, wave continues
  when all are ready (with a votable "hurry up" nudge sound, not a timer).

Shared screens must work from 320px-wide phones to 4K TVs (fluid layout, safe-area
insets for TVs).

## Input edge cases

- Pad disconnect mid-wave: game auto-pauses (whole screen) with "controller lost" toast.
- Two devices pressing pause: last-in wins; any player can unpause.
- Menus never trap focus; back always exists (B / Esc).
